import { auth, db } from './firebase-config.js';
import { 
    collection, 
    query, 
    orderBy, 
    onSnapshot, 
    doc, 
    deleteDoc, 
    getDoc,
    where,
    limit,
    startAfter
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// DOM Elements
const contactList = document.getElementById('contactMessagesList');
const suggestionsList = document.getElementById('suggestionsList');
const userMenuDropdown = document.getElementById('userMenuDropdown');
const sidebarFooter = document.querySelector('.sidebar-footer');

// Pagination Elements
const contactPrevBtn = document.getElementById('contactPrevBtn');
const contactNextBtn = document.getElementById('contactNextBtn');
const contactPageIndicator = document.getElementById('contactPageIndicator');
const suggestionsPrevBtn = document.getElementById('suggestionsPrevBtn');
const suggestionsNextBtn = document.getElementById('suggestionsNextBtn');
const suggestionsPageIndicator = document.getElementById('suggestionsPageIndicator');

let messageModalInstance = null;
let currentUser = null;
let userRole = null;

// Pagination State
const ITEMS_PER_PAGE = 10;

const contactState = {
    page: 1,
    lastDocs: [], // Array to store the last document of each page
    unsubscribe: null
};

const suggestionsState = {
    page: 1,
    lastDocs: [],
    unsubscribe: null
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    messageModalInstance = new bootstrap.Modal(document.getElementById('messageDetailModal'));

    // Auth Check
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            await initializeUser(user);
            setupPaginationListeners();
        } else {
            window.location.href = 'login.html';
        }
    });

    // Modal Delete Button Listener
    document.getElementById('modalDeleteBtn').addEventListener('click', async () => {
        const btn = document.getElementById('modalDeleteBtn');
        const collectionName = btn.dataset.collection;
        const docId = btn.dataset.docId;
        
        if (collectionName && docId) {
            await window.deleteMessage(collectionName, docId, true); // true = from modal
        }
    });

    // Pagination Event Listeners
    contactPrevBtn.addEventListener('click', () => changePage('contact', 'prev'));
    contactNextBtn.addEventListener('click', () => changePage('contact', 'next'));
    suggestionsPrevBtn.addEventListener('click', () => changePage('suggestions', 'prev'));
    suggestionsNextBtn.addEventListener('click', () => changePage('suggestions', 'next'));
});

async function initializeUser(user) {
    try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            const userData = userSnap.data();
            userRole = userData.role || 'User';
            
            // Setup UI based on role
            setupRoleBasedUI(userRole);
            updateUserInterface(userData, user);
        }
    } catch (error) {
        console.error("Error fetching user data:", error);
    }
}

function setupRoleBasedUI(role) {
    // Hide/Show admin content
    const adminEmployerContent = document.getElementById('adminEmployerContent');
    const adminOnlyContent = document.getElementById('adminOnlyContent');
    const adminOnlyJobs = document.getElementById('adminOnlyJobs');

    if (role === 'Admin' || role === 'Employer') {
        if (adminEmployerContent) adminEmployerContent.style.display = 'block';
    }

    if (role === 'Admin') {
        if (adminOnlyContent) adminOnlyContent.style.display = 'block';
        if (adminOnlyJobs) adminOnlyJobs.style.display = 'block';
    }
}

function updateUserInterface(userData, user) {
    const firstName = capitalizeFirstLetter(userData.firstName || user.email.split('@')[0]);
    const profileImage = userData.profileImageUrl || user.profileImageUrl || '/images/default.webp';
    
    // Update Sidebar Footer
    sidebarFooter.innerHTML = `
        <div class="user-profile">
            <img src="${profileImage}" alt="${firstName}" class="profile-img">
            <div class="profile-info">
                <h6 class="profile-name">${firstName}</h6>
                <span class="profile-role">${userRole}</span>
            </div>
        </div>
    `;

    // Update Top Menu
    userMenuDropdown.innerHTML = `
        <div class="dropdown">
            <button class="user-dropdown" data-bs-toggle="dropdown">
                <div class="user-avatar">
                    <img src="${profileImage}" alt="${firstName}">
                    <span class="status-indicator online"></span>
                </div>
                <div class="user-info">
                    <span class="user-name">${firstName}</span>
                </div>
                <i class="bi bi-chevron-down"></i>
            </button>
            <ul class="dropdown-menu dropdown-menu-end animate slideIn">
                <li class="dropdown-header">Welcome, ${firstName}!</li>
                <li><a class="dropdown-item" href="profile.html"><i class="bi bi-person-circle me-2"></i>My Profile</a></li>
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item" href="#" id="logoutBtn"><i class="bi bi-box-arrow-right me-2"></i>Sign Out</a></li>
            </ul>
        </div>
    `;

    document.getElementById('logoutBtn').addEventListener('click', (e) => {
        e.preventDefault();
        auth.signOut().then(() => window.location.href = 'index.html');
    });
}

function setupPaginationListeners() {
    loadMessages('contact');
    loadMessages('suggestions');
}

function changePage(type, direction) {
    const state = type === 'contact' ? contactState : suggestionsState;
    
    if (direction === 'next') {
        state.page++;
    } else if (direction === 'prev' && state.page > 1) {
        state.page--;
    }

    loadMessages(type);
}

function loadMessages(type) {
    const state = type === 'contact' ? contactState : suggestionsState;
    const collectionName = type === 'contact' ? 'contact_messages' : 'suggestions';
    const orderByField = type === 'contact' ? 'timestamp' : 'createdAt';
    const listElement = type === 'contact' ? contactList : suggestionsList;
    const prevBtn = type === 'contact' ? contactPrevBtn : suggestionsPrevBtn;
    const nextBtn = type === 'contact' ? contactNextBtn : suggestionsNextBtn;
    const pageIndicator = type === 'contact' ? contactPageIndicator : suggestionsPageIndicator;

    // Show loading spinner
    listElement.innerHTML = `
        <div class="text-center py-5">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
        </div>
    `;

    // Unsubscribe previous listener
    if (state.unsubscribe) {
        state.unsubscribe();
    }

    // Build Query
    let q = query(
        collection(db, collectionName), 
        orderBy(orderByField, 'desc'),
        limit(ITEMS_PER_PAGE)
    );

    if (state.page > 1) {
        const lastDoc = state.lastDocs[state.page - 2];
        if (lastDoc) {
            q = query(
                collection(db, collectionName), 
                orderBy(orderByField, 'desc'),
                startAfter(lastDoc),
                limit(ITEMS_PER_PAGE)
            );
        }
    }

    // Subscribe
    state.unsubscribe = onSnapshot(q, (snapshot) => {
        // Update UI
        if (type === 'contact') {
            renderContactMessages(snapshot);
        } else {
            renderSuggestions(snapshot);
        }

        // Manage Pagination State
        pageIndicator.textContent = `Page ${state.page}`;
        prevBtn.disabled = state.page === 1;

        if (!snapshot.empty) {
            // Store the last document for the next page
            state.lastDocs[state.page - 1] = snapshot.docs[snapshot.docs.length - 1];
            
            // Check if we have more documents (simple check: if we got full page, assume maybe more)
            // Ideally, we'd fetch limit + 1 to know for sure, but that complicates display.
            // For now, if we get < limit, we definitely are at end.
            if (snapshot.docs.length < ITEMS_PER_PAGE) {
                nextBtn.disabled = true;
            } else {
                nextBtn.disabled = false;
            }
        } else {
            // No items found
            nextBtn.disabled = true;
            if (state.page > 1) {
                // If we went to a page with no items, maybe go back? 
                // Or just show empty state.
            }
        }

    }, (error) => {
        console.error(`Error loading ${type}:`, error);
        listElement.innerHTML = `<div class="text-center text-danger p-3">Error: ${error.message}</div>`;
    });
}

function renderContactMessages(snapshot) {
    if (snapshot.empty) {
        contactList.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-inbox"></i>
                <p>No contact messages yet.</p>
            </div>
        `;
        return;
    }

    contactList.innerHTML = '';
    snapshot.forEach(doc => {
        const data = doc.data();
        const date = formatTimestamp(data.timestamp);
        const subject = data.subject || 'No Subject';
        const name = data.name || 'Anonymous';
        const status = data.status || 'read';

        const item = document.createElement('a');
        item.href = '#';
        item.className = 'list-group-item list-group-item-action py-3';
        item.innerHTML = `
            <div class="d-flex w-100 justify-content-between align-items-center mb-1">
                <h6 class="mb-0 text-truncate" style="max-width: 70%;">
                    <span class="badge status-badge ${status === 'new' ? 'status-new' : 'bg-secondary'} me-2">
                        ${capitalizeFirstLetter(status)}
                    </span>
                    ${subject}
                </h6>
                <small class="text-muted text-nowrap">${date}</small>
            </div>
            <div class="d-flex justify-content-between align-items-center">
                <p class="mb-0 small text-muted">
                    <i class="bi bi-person me-1"></i> ${name}
                </p>
                <small class="text-primary">View Details <i class="bi bi-chevron-right"></i></small>
            </div>
        `;

        item.addEventListener('click', (e) => {
            e.preventDefault();
            openMessageModal('contact', doc.id, data);
        });

        contactList.appendChild(item);
    });
}

function renderSuggestions(snapshot) {
    if (snapshot.empty) {
        suggestionsList.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-lightbulb-off"></i>
                <p>No suggestions yet.</p>
            </div>
        `;
        return;
    }

    suggestionsList.innerHTML = '';
    snapshot.forEach(doc => {
        const data = doc.data();
        const date = data.createdAt ? (typeof data.createdAt === 'string' ? data.createdAt : formatTimestamp(data.createdAt)) : 'Unknown Date';
        const helpType = formatHelpType(data.helpType);
        const jobPreference = formatJobPreference(data.jobPreference);
        const userName = data.userName || 'Anonymous';

        const item = document.createElement('a');
        item.href = '#';
        item.className = 'list-group-item list-group-item-action py-3';
        item.innerHTML = `
            <div class="d-flex w-100 justify-content-between align-items-center mb-1">
                <h6 class="mb-0 text-truncate" style="max-width: 70%;">
                    <span class="badge bg-info text-dark rounded-pill me-2">${helpType}</span>
                    ${jobPreference}
                </h6>
                <small class="text-muted text-nowrap">${date}</small>
            </div>
            <div class="d-flex justify-content-between align-items-center">
                <p class="mb-0 small text-muted">
                    <i class="bi bi-person me-1"></i> ${userName}
                </p>
                <small class="text-primary">View Details <i class="bi bi-chevron-right"></i></small>
            </div>
        `;

        item.addEventListener('click', (e) => {
            e.preventDefault();
            openMessageModal('suggestion', doc.id, data);
        });

        suggestionsList.appendChild(item);
    });
}

function openMessageModal(type, docId, data) {
    const modalTitle = document.getElementById('messageDetailTitle');
    const modalBody = document.getElementById('messageDetailBody');
    const deleteBtn = document.getElementById('modalDeleteBtn');

    // Configure Delete Button
    if (userRole === 'Admin') {
        deleteBtn.style.display = 'block';
        deleteBtn.dataset.collection = type === 'contact' ? 'contact_messages' : 'suggestions';
        deleteBtn.dataset.docId = docId;
    } else {
        deleteBtn.style.display = 'none';
    }

    if (type === 'contact') {
        modalTitle.textContent = 'Contact Message Details';
        modalBody.innerHTML = `
            <div class="mb-3">
                <label class="small text-muted fw-bold">Subject</label>
                <h5>${data.subject || 'No Subject'}</h5>
            </div>
            <div class="row mb-3">
                <div class="col-md-6">
                    <label class="small text-muted fw-bold">From</label>
                    <div class="d-flex align-items-center">
                        <i class="bi bi-person-circle me-2 text-secondary"></i>
                        <span>${data.name || 'Anonymous'}</span>
                    </div>
                </div>
                <div class="col-md-6">
                    <label class="small text-muted fw-bold">Email</label>
                    <div class="d-flex align-items-center">
                        <i class="bi bi-envelope me-2 text-secondary"></i>
                        <a href="mailto:${data.email}">${data.email || 'No Email'}</a>
                    </div>
                </div>
            </div>
            <div class="mb-3">
                <label class="small text-muted fw-bold">Date Received</label>
                <div>${formatTimestamp(data.timestamp)}</div>
            </div>
            <div class="mb-3">
                <label class="small text-muted fw-bold">Message</label>
                <div class="bg-light p-3 rounded border">
                    ${(data.message || '').replace(/\n/g, '<br>')}
                </div>
            </div>
            <div class="mb-3">
                 <label class="small text-muted fw-bold">Status</label>
                 <div><span class="badge ${data.status === 'new' ? 'status-new' : 'bg-secondary'}">${capitalizeFirstLetter(data.status || 'read')}</span></div>
            </div>
        `;
    } else {
        modalTitle.textContent = 'Suggestion Details';
        modalBody.innerHTML = `
             <div class="row mb-3">
                <div class="col-md-6">
                    <label class="small text-muted fw-bold">Help Type</label>
                    <div><span class="badge bg-info text-dark">${formatHelpType(data.helpType)}</span></div>
                </div>
                <div class="col-md-6">
                    <label class="small text-muted fw-bold">Job Preference</label>
                    <div>${formatJobPreference(data.jobPreference)}</div>
                </div>
            </div>
            <div class="row mb-3">
                <div class="col-md-6">
                    <label class="small text-muted fw-bold">From</label>
                    <div class="d-flex align-items-center">
                        <i class="bi bi-person-circle me-2 text-secondary"></i>
                        <span>${data.userName || 'Anonymous'}</span>
                    </div>
                </div>
                <div class="col-md-6">
                    <label class="small text-muted fw-bold">Email</label>
                    <div class="d-flex align-items-center">
                        <i class="bi bi-envelope me-2 text-secondary"></i>
                        <a href="mailto:${data.userEmail}">${data.userEmail || 'No Email'}</a>
                    </div>
                </div>
            </div>
            <div class="mb-3">
                <label class="small text-muted fw-bold">Date Submitted</label>
                <div>${data.createdAt ? (typeof data.createdAt === 'string' ? data.createdAt : formatTimestamp(data.createdAt)) : 'Unknown Date'}</div>
            </div>
            <div class="mb-3">
                <label class="small text-muted fw-bold">Suggestion</label>
                <div class="bg-light p-3 rounded border">
                    ${(data.suggestion || '').replace(/\n/g, '<br>')}
                </div>
            </div>
             <div class="mb-3">
                <label class="small text-muted fw-bold">Consent</label>
                <div>
                    ${data.emailConsent 
                        ? '<span class="text-success"><i class="bi bi-check-circle-fill me-1"></i>User agreed to be contacted via email</span>' 
                        : '<span class="text-secondary"><i class="bi bi-x-circle-fill me-1"></i>User did NOT agree to be contacted</span>'}
                </div>
            </div>
        `;
    }

    messageModalInstance.show();
}

// Global functions
window.deleteMessage = async (collectionName, docId, fromModal = false) => {
    if (userRole !== 'Admin') {
        alert('Permission denied: Only Admins can delete messages.');
        return;
    }

    if (!confirm('Are you sure you want to delete this item? This cannot be undone.')) {
        return;
    }

    try {
        await deleteDoc(doc(db, collectionName, docId));
        if (fromModal && messageModalInstance) {
            messageModalInstance.hide();
        }
        // Realtime listener will remove it from UI list automatically
    } catch (error) {
        console.error("Error deleting document:", error);
        alert('Error deleting item: ' + error.message);
    }
};

// Utilities
function formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    // Handle Firestore Timestamp or Date string
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

function capitalizeFirstLetter(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function formatHelpType(type) {
    if (!type) return 'General';
    return type.split('_').map(capitalizeFirstLetter).join(' ');
}

function formatJobPreference(pref) {
    if (!pref) return 'Any';
    return pref.split('_').map(capitalizeFirstLetter).join(' ');
}
