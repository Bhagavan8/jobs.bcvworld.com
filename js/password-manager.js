import { db, auth, storage } from './firebase-config.js';
import { 
    collection, 
    addDoc, 
    getDocs, 
    doc, 
    deleteDoc, 
    updateDoc, 
    query, 
    where, 
    orderBy,
    getDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    ref, 
    uploadBytes, 
    getDownloadURL, 
    deleteObject 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// DOM Elements
const passwordsGrid = document.getElementById('passwordsGrid');
const documentsList = document.getElementById('documentsList');
const searchInput = document.getElementById('searchInput');
const tabBtns = document.querySelectorAll('.tab-btn');
const addItemModal = new bootstrap.Modal(document.getElementById('addItemModal'));
const viewPasswordModal = new bootstrap.Modal(document.getElementById('viewPasswordModal'));
const itemForm = document.getElementById('itemForm');
const saveBtn = document.getElementById('saveBtn');
const encryptionKeyModal = new bootstrap.Modal(document.getElementById('encryptionKeyModal'));
const mfaModal = new bootstrap.Modal(document.getElementById('mfaModal'));

// State
let currentUser = null;
let currentItems = {
    passwords: [],
    documents: []
};
let currentTab = 'passwords'; // 'passwords' or 'documents'
let viewingItemId = null;
let encryptionPassphrase = null;
let mfaSecret = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkAuthAndRole();
    setupEventListeners();
});

function showToast(message, variant = 'primary') {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast align-items-center text-bg-${variant} border-0`;
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', 'assertive');
    el.setAttribute('aria-atomic', 'true');
    el.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    `;
    container.appendChild(el);
    const t = new bootstrap.Toast(el, { delay: 3000 });
    t.show();
    el.addEventListener('hidden.bs.toast', () => el.remove());
}

async function deriveKey(passphrase, salt) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

function base64ToArrayBuffer(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}

async function encryptText(plain, passphrase) {
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(passphrase, salt);
    const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain));
    return {
        cipher: arrayBufferToBase64(cipherBuf),
        iv: arrayBufferToBase64(iv.buffer),
        salt: arrayBufferToBase64(salt.buffer)
    };
}

async function decryptText(cipher, passphrase, ivB64, saltB64) {
    const iv = new Uint8Array(base64ToArrayBuffer(ivB64));
    const salt = new Uint8Array(base64ToArrayBuffer(saltB64));
    const key = await deriveKey(passphrase, salt);
    const cipherBuf = base64ToArrayBuffer(cipher);
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBuf);
    const dec = new TextDecoder();
    return dec.decode(plainBuf);
}

function base32Decode(input) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const cleaned = input.replace(/=+$/, '').toUpperCase().replace(/[^A-Z2-7]/g, '');
    let bits = '';
    let bytes = [];
    for (let i = 0; i < cleaned.length; i++) {
        const val = alphabet.indexOf(cleaned[i]);
        if (val === -1) continue;
        bits += val.toString(2).padStart(5, '0');
        if (bits.length >= 8) {
            bytes.push(parseInt(bits.substring(0, 8), 2));
            bits = bits.substring(8);
        }
    }
    return new Uint8Array(bytes);
}

async function hotp(secretBytes, counter) {
    const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const buf = new ArrayBuffer(8);
    const view = new DataView(buf);
    const high = Math.floor(counter / Math.pow(2, 32));
    const low = counter % Math.pow(2, 32);
    view.setUint32(0, high);
    view.setUint32(4, low);
    const hmac = await crypto.subtle.sign('HMAC', key, buf);
    const bytes = new Uint8Array(hmac);
    const offset = bytes[bytes.length - 1] & 0x0f;
    const code = ((bytes[offset] & 0x7f) << 24) |
                 ((bytes[offset + 1] & 0xff) << 16) |
                 ((bytes[offset + 2] & 0xff) << 8) |
                 (bytes[offset + 3] & 0xff);
    return (code % 1000000).toString().padStart(6, '0');
}

async function verifyTotp(secretBase32, token) {
    if (!secretBase32 || !token) return false;
    const secretBytes = base32Decode(secretBase32);
    const epoch = Math.floor(Date.now() / 1000);
    const counter = Math.floor(epoch / 30);
    const windows = [counter - 1, counter, counter + 1];
    for (const c of windows) {
        const code = await hotp(secretBytes, c);
        if (code === token) return true;
    }
    return false;
}

function generateBase32Secret(length = 20) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const arr = new Uint8Array(length);
    crypto.getRandomValues(arr);
    let out = '';
    for (let i = 0; i < arr.length; i++) {
        out += alphabet[arr[i] % alphabet.length];
    }
    return out;
}

function checkAuthAndRole() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Check if admin
            try {
                const userDocRef = doc(db, 'users', user.uid);
                const userDoc = await getDoc(userDocRef);
                
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    const role = userData.role;
                    
                    // Check for admin role (case-insensitive)
                    if (role && role.toLowerCase() === 'admin') {
                        currentUser = user;
                        const key = `mfaVerified_${user.uid}`;
                        const sessionOk = sessionStorage.getItem(key) === '1';
                        const enabled = userData.mfaEnabled === true && typeof userData.mfaSecret === 'string';
                        if (!sessionOk) {
                            if (enabled) {
                                mfaSecret = userData.mfaSecret;
                                document.getElementById('mfaSetupContainer').style.display = 'none';
                                mfaModal.show();
                            } else {
                                const secret = generateBase32Secret(20);
                                mfaSecret = secret;
                                const email = user.email || 'admin';
                                const issuer = 'SecureLocker';
                                const url = `otpauth://totp/${issuer}:${email}?secret=${secret}&issuer=${issuer}&digits=6&period=30`;
                                document.getElementById('mfaSecretDisplay').value = secret;
                                document.getElementById('mfaOtpAuthUrl').value = url;
                                document.getElementById('mfaSetupContainer').style.display = 'block';
                                mfaModal.show();
                            }
                        }
                        loadItems();
                    } else {
                        console.log('User role:', role);
                        showToast('Access denied. Admin required.', 'danger');
                        window.location.href = 'index.html';
                    }
                } else {
                    showToast('Access denied. Admin required.', 'danger');
                    window.location.href = 'index.html';
                }
            } catch (error) {
                console.error("Error verifying admin role:", error);
                showToast('Error verifying permissions.', 'danger');
                window.location.href = 'index.html';
            }
        } else {
            window.location.href = 'login.html';
        }
    });
}

function setupEventListeners() {
    // Tabs
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update UI
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Switch Sections
            const tabName = btn.dataset.tab;
            currentTab = tabName;
            
            document.querySelectorAll('.section-content').forEach(el => el.classList.remove('active'));
            document.getElementById(`${tabName}Section`).classList.add('active');
            
            // Refresh Search
            filterItems(searchInput.value);
        });
    });

    // Sidebar Toggle
    const sidebarToggleBtns = document.querySelectorAll('.sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');

    sidebarToggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });
    });

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
        if (window.innerWidth < 992) {
            if (sidebar.classList.contains('active') && !sidebar.contains(e.target) && !e.target.closest('.sidebar-toggle')) {
                sidebar.classList.remove('active');
            }
        }
    });

    // Form Submission
    itemForm.addEventListener('submit', handleFormSubmit);

    document.getElementById('setKeyBtn').addEventListener('click', () => {
        encryptionKeyModal.show();
    });

    document.getElementById('encryptionKeyForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const val = document.getElementById('encryptionKeyInput').value.trim();
        if (val.length < 8) {
            showToast('Use a stronger key (min 8 chars).', 'warning');
            return;
        }
        encryptionPassphrase = val;
        encryptionKeyModal.hide();
        showToast('Locker key saved.', 'success');
    });

    document.getElementById('setupMfaBtn').addEventListener('click', () => {
        document.getElementById('mfaSetupContainer').style.display = 'block';
        if (!mfaSecret) {
            mfaSecret = generateBase32Secret(20);
            const email = currentUser?.email || 'admin';
            const issuer = 'SecureLocker';
            const url = `otpauth://totp/${issuer}:${email}?secret=${mfaSecret}&issuer=${issuer}&digits=6&period=30`;
            document.getElementById('mfaSecretDisplay').value = mfaSecret;
            document.getElementById('mfaOtpAuthUrl').value = url;
        }
    });

    const confirmBtn = document.getElementById('confirmEnableMfaBtn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            if (!currentUser || !mfaSecret) return;
            const userDocRef = doc(db, 'users', currentUser.uid);
            await updateDoc(userDocRef, { mfaEnabled: true, mfaSecret: mfaSecret });
            showToast('Two-factor enabled.', 'success');
            document.getElementById('mfaSetupContainer').style.display = 'none';
        });
    }

    const mfaForm = document.getElementById('mfaForm');
    if (mfaForm) {
        mfaForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const code = document.getElementById('mfaCodeInput').value.trim();
            const ok = await verifyTotp(mfaSecret, code);
            if (ok) {
                sessionStorage.setItem(`mfaVerified_${currentUser.uid}`, '1');
                mfaModal.hide();
                showToast('Two-factor verified.', 'success');
            } else {
                showToast('Invalid code.', 'danger');
            }
        });
    }

    // Search
    searchInput.addEventListener('input', (e) => {
        filterItems(e.target.value);
    });

    // Type Selector in Modal
    const typeRadios = document.querySelectorAll('input[name="itemType"]');
    typeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const type = e.target.value;
            if (type === 'password') {
                document.getElementById('passwordFields').style.display = 'block';
                document.getElementById('documentFields').style.display = 'none';
            } else {
                document.getElementById('passwordFields').style.display = 'none';
                document.getElementById('documentFields').style.display = 'block';
            }
        });
    });

    // Password Visibility Toggles
    document.getElementById('togglePassword').addEventListener('click', function() {
        const input = document.getElementById('itemPassword');
        const icon = this.querySelector('i');
        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.replace('bi-eye', 'bi-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.replace('bi-eye-slash', 'bi-eye');
        }
    });

    document.getElementById('toggleViewPassword').addEventListener('click', function() {
        const input = document.getElementById('viewPassword');
        const icon = this.querySelector('i');
        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.replace('bi-eye', 'bi-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.replace('bi-eye-slash', 'bi-eye');
        }
    });

    // Delete Button in View Modal
    document.getElementById('deleteItemBtn').addEventListener('click', async () => {
        if (confirm('Are you sure you want to delete this item?')) {
            await deleteItem(viewingItemId, 'passwords'); // Currently only passwords use the view modal
            viewPasswordModal.hide();
        }
    });

    // Edit Button in View Modal
    document.getElementById('editItemBtn').addEventListener('click', () => {
        viewPasswordModal.hide();
        openEditModal(viewingItemId, 'passwords');
    });
}

async function loadItems() {
    try {
        // Load Passwords
        const passQuery = query(collection(db, 'passwords'), orderBy('createdAt', 'desc'));
        const passSnapshot = await getDocs(passQuery);
        currentItems.passwords = passSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Load Documents
        const docQuery = query(collection(db, 'documents'), orderBy('createdAt', 'desc'));
        const docSnapshot = await getDocs(docQuery);
        currentItems.documents = docSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        renderPasswords(currentItems.passwords);
        renderDocuments(currentItems.documents);

        // Hide Loaders
        const passwordLoader = document.querySelector('#passwordsSection .loading-spinner');
        if (passwordLoader) passwordLoader.style.display = 'none';

        const documentLoader = document.querySelector('#documentsLoading');
        if (documentLoader) documentLoader.style.display = 'none';

    } catch (error) {
        console.error("Error loading items:", error);
        showToast('Failed to load items.', 'danger');
    }
}

function renderPasswords(items) {
    passwordsGrid.innerHTML = '';
    if (items.length === 0) {
        passwordsGrid.innerHTML = '<div class="col-12 text-center text-muted"><p>No passwords found.</p></div>';
        return;
    }
    const list = document.createElement('ul');
    list.className = 'passwords-list';
    items.forEach(item => {
        const li = document.createElement('li');
        li.className = 'passwords-item';
        li.innerHTML = `
            <div class="item-left">
                <span class="item-icon"><i class="bi bi-shield-lock"></i></span>
                <span class="item-title text-truncate">${item.title}</span>
            </div>
            <i class="bi bi-chevron-right item-arrow"></i>
        `;
        li.addEventListener('click', () => window.openViewModal(item.id));
        list.appendChild(li);
    });
    passwordsGrid.appendChild(list);
}

function renderDocuments(items) {
    documentsList.innerHTML = '';
    
    if (items.length === 0) {
        documentsList.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No documents found.</td></tr>';
        return;
    }

    items.forEach(item => {
        const tr = document.createElement('tr');
        const date = item.createdAt ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() : 'N/A';
        tr.innerHTML = `
            <td>
                <div class="d-flex align-items-center">
                    <i class="bi bi-file-earmark-text doc-icon"></i>
                    <span class="fw-bold">${item.title}</span>
                </div>
            </td>
            <td>${item.fileType || 'File'}</td>
            <td>${date}</td>
            <td>
                <div class="btn-group">
                    <a href="${item.fileUrl}" target="_blank" class="btn btn-sm btn-outline-primary" title="Download/View">
                        <i class="bi bi-download"></i>
                    </a>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteDocument('${item.id}')" title="Delete">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        `;
        documentsList.appendChild(tr);
    });
}

function filterItems(searchTerm) {
    searchTerm = searchTerm.toLowerCase();
    
    if (currentTab === 'passwords') {
        const filtered = currentItems.passwords.filter(item => 
            item.title.toLowerCase().includes(searchTerm) || 
            (item.username && item.username.toLowerCase().includes(searchTerm)) ||
            (item.url && item.url.toLowerCase().includes(searchTerm))
        );
        renderPasswords(filtered);
    } else {
        const filtered = currentItems.documents.filter(item => 
            item.title.toLowerCase().includes(searchTerm)
        );
        renderDocuments(filtered);
    }
}

// Global scope for HTML onclick attributes
window.openViewModal = (id) => {
    const item = currentItems.passwords.find(p => p.id === id);
    if (!item) return;
    
    viewingItemId = id;
    document.getElementById('viewTitle').textContent = item.title;
    document.getElementById('viewUsername').value = item.username || '';
    if (item.passwordEnc) {
        if (!encryptionPassphrase) {
            showToast('Set locker key to view.', 'warning');
            encryptionKeyModal.show();
            return;
        }
        decryptText(item.passwordEnc, encryptionPassphrase, item.iv, item.salt)
            .then((pwd) => {
                document.getElementById('viewPassword').value = pwd;
                viewPasswordModal.show();
            })
            .catch(() => {
                showToast('Wrong locker key.', 'danger');
            });
        return;
    } else {
        document.getElementById('viewPassword').value = item.password || '';
    }

    const urlEl = document.getElementById('viewUrl');
    const urlDomainEl = document.getElementById('viewUrlDomain');
    const urlContainer = document.getElementById('viewUrlContainer');
    if (item.url) {
        try {
            const u = new URL(item.url);
            urlEl.href = u.href;
            urlDomainEl.textContent = u.hostname;
        } catch {
            urlEl.href = item.url;
            urlDomainEl.textContent = 'Link';
        }
        urlContainer.style.display = 'block';
    } else {
        urlContainer.style.display = 'none';
    }

    const notesEl = document.getElementById('viewNotes');
    const notesContainer = document.getElementById('viewNotesContainer');
    if (item.notes) {
        notesEl.textContent = item.notes;
        notesContainer.style.display = 'block';
    } else {
        notesContainer.style.display = 'none';
    }

    viewPasswordModal.show();
};

window.copyToClipboard = (elementId) => {
    const copyText = document.getElementById(elementId);
    copyText.select();
    copyText.setSelectionRange(0, 99999); // For mobile
    navigator.clipboard.writeText(copyText.value).then(() => {
        // Could add a toast notification here
        const btn = copyText.nextElementSibling;
        const originalIcon = btn.innerHTML;
        btn.innerHTML = '<i class="bi bi-check"></i>';
        setTimeout(() => {
            btn.innerHTML = originalIcon;
        }, 1500);
    });
};

window.deleteDocument = async (id) => {
    if (confirm('Are you sure you want to delete this document?')) {
        await deleteItem(id, 'documents');
    }
};

async function deleteItem(id, collectionName) {
    try {
        const item = currentItems[collectionName].find(i => i.id === id);
        
        // If it's a document, delete from Storage first
        if (collectionName === 'documents' && item.storagePath) {
            const fileRef = ref(storage, item.storagePath);
            await deleteObject(fileRef).catch(err => console.warn('File not found in storage, deleting record anyway', err));
        }

        await deleteDoc(doc(db, collectionName, id));
        
        // Remove from local state and re-render
        currentItems[collectionName] = currentItems[collectionName].filter(i => i.id !== id);
        if (collectionName === 'passwords') renderPasswords(currentItems.passwords);
        else renderDocuments(currentItems.documents);

        showToast('Item deleted.', 'success');
    } catch (error) {
        console.error("Error deleting item:", error);
        showToast('Failed to delete item.', 'danger');
    }
}

function openEditModal(id, type) {
    const item = currentItems[type].find(i => i.id === id);
    if (!item) return;

    document.getElementById('itemId').value = id;
    document.getElementById('modalTitle').textContent = 'Edit Item';
    
    // Set type
    const radio = document.querySelector(`input[name="itemType"][value="${type}"]`);
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    
    // Disable type switching during edit
    document.querySelectorAll('input[name="itemType"]').forEach(r => r.disabled = true);

    document.getElementById('itemTitle').value = item.title;
    document.getElementById('itemNotes').value = item.notes || '';

    if (type === 'password') {
        document.getElementById('itemUsername').value = item.username || '';
        document.getElementById('itemPassword').value = item.password || '';
        document.getElementById('itemUrl').value = item.url || '';
    } else {
        document.getElementById('currentFile').style.display = 'block';
        document.getElementById('currentFile').textContent = `Current file: ${item.fileName}`;
    }

    addItemModal.show();
}

// Reset modal on close
document.getElementById('addItemModal').addEventListener('hidden.bs.modal', () => {
    itemForm.reset();
    document.getElementById('itemId').value = '';
    document.getElementById('modalTitle').textContent = 'Add New Item';
    document.querySelectorAll('input[name="itemType"]').forEach(r => r.disabled = false);
    document.getElementById('currentFile').style.display = 'none';
    document.getElementById('passwordFields').style.display = 'block';
    document.getElementById('documentFields').style.display = 'none';
    document.querySelector('input[name="itemType"][value="password"]').checked = true;
});

async function handleFormSubmit(e) {
    e.preventDefault();
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Saving...';

    const itemId = document.getElementById('itemId').value;
    const type = document.querySelector('input[name="itemType"]:checked').value;
    const title = document.getElementById('itemTitle').value;
    const notes = document.getElementById('itemNotes').value;

    try {
        if (type === 'password') {
            if (!encryptionPassphrase) {
                showToast('Set locker key to save.', 'warning');
                encryptionKeyModal.show();
                throw new Error('Locker key required');
            }
            const encrypted = await encryptText(document.getElementById('itemPassword').value, encryptionPassphrase);
            const data = {
                title,
                username: document.getElementById('itemUsername').value,
                passwordEnc: encrypted.cipher,
                iv: encrypted.iv,
                salt: encrypted.salt,
                url: document.getElementById('itemUrl').value,
                notes,
                updatedAt: serverTimestamp()
            };

            if (!itemId) {
                data.createdAt = serverTimestamp();
                await addDoc(collection(db, 'passwords'), data);
            } else {
                await updateDoc(doc(db, 'passwords', itemId), data);
            }
        } else {
            // Document
            const fileInput = document.getElementById('fileUpload');
            let fileUrl = null;
            let storagePath = null;
            let fileName = null;
            let fileType = null;

            if (fileInput.files.length > 0) {
                const file = fileInput.files[0];
                fileName = file.name;
                fileType = file.type;
                storagePath = `documents/${Date.now()}_${file.name}`;
                const storageRef = ref(storage, storagePath);
                
                const snapshot = await uploadBytes(storageRef, file);
                fileUrl = await getDownloadURL(snapshot.ref);
            }

            const data = {
                title,
                notes,
                updatedAt: serverTimestamp()
            };

            if (fileUrl) {
                data.fileUrl = fileUrl;
                data.storagePath = storagePath;
                data.fileName = fileName;
                data.fileType = fileType;
            }

            if (!itemId) {
                if (!fileUrl) throw new Error('File is required for new documents');
                data.createdAt = serverTimestamp();
                await addDoc(collection(db, 'documents'), data);
            } else {
                await updateDoc(doc(db, 'documents', itemId), data);
            }
        }

        addItemModal.hide();
        loadItems(); // Refresh
        showToast('Saved successfully.', 'success');

    } catch (error) {
        console.error("Error saving item:", error);
        showToast('Error saving item.', 'danger');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Item';
    }
}
