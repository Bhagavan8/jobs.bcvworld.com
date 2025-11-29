import { auth, db, storage, ref, uploadBytes, getDownloadURL } from './firebase-config.js';
import { 
    collection, 
    addDoc, 
    doc, 
    getDoc,
    updateDoc,
    serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Get the news ID from URL if it exists
const urlParams = new URLSearchParams(window.location.search);
const newsId = urlParams.get('id');
let existingImageUrl = '';

function showToast(message, type = 'success') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'position-fixed top-0 end-0 p-3';
        container.style.zIndex = '1100';
        document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.className = `toast align-items-center text-bg-${type} border-0`;
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', 'assertive');
    el.setAttribute('aria-atomic', 'true');
    el.innerHTML = `<div class="d-flex"><div class="toast-body">${message}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div>`;
    container.appendChild(el);
    const toast = new bootstrap.Toast(el, { delay: 3000 });
    toast.show();
    el.addEventListener('hidden.bs.toast', () => el.remove());
}


// Load existing news data if editing
async function loadNewsData() {
    if (newsId) {
        try {
            const newsDoc = await getDoc(doc(db, 'news', newsId));
            if (newsDoc.exists()) {
                const data = newsDoc.data();
                document.getElementById('newsTitle').value = data.title || '';
                document.getElementById('newsCategory').value = data.category || '';
                document.getElementById('newsSection').value = data.section || '';
                const container = document.getElementById('paragraphsContainer');
                const template = document.getElementById('paragraphTemplate');
                const subTemplate = document.getElementById('subpointTemplate');
                container.innerHTML = '';
                const paragraphs = Array.isArray(data.paragraphs) && data.paragraphs.length ? data.paragraphs : (data.content ? [data.content] : ['']);
                paragraphs.forEach(p => {
                    const el = template.content.cloneNode(true);
                    const paragraphText = typeof p === 'string' ? p : (p.text || '');
                    el.querySelector('.paragraph-text').value = paragraphText;
                    const node = el.firstElementChild;
                    const subContainer = node.querySelector('.subpoints-container');
                    const points = (typeof p === 'object' && Array.isArray(p.points)) ? p.points : [];
                    points.forEach(pt => {
                        const sp = subTemplate.content.cloneNode(true);
                        sp.querySelector('.subpoint-text').value = pt.text || '';
                        const spNode = sp.firstElementChild;
                        if (pt.bold) spNode.classList.add('bold');
                        subContainer.appendChild(sp);
                    });
                    container.appendChild(el);
                });
                const urlEl = document.getElementById('newsUrl');
                if (urlEl) { urlEl.value = data.url || ''; }
                existingImageUrl = data.imageUrl || '';
                document.getElementById('newsStatus').value = data.status || 'pending';

                // Update form button text
                document.querySelector('button[type="submit"]').textContent = 'Update News';
            }
        } catch (error) {
            console.error('Error loading news:', error);
            showToast('Error loading news data', 'danger');
        }
    }
}

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    loadNewsData();
    
    const form = document.querySelector('#uploadNewsForm');
    const paragraphsContainer = document.getElementById('paragraphsContainer');
    const paragraphTemplate = document.getElementById('paragraphTemplate');
    const addParagraphBtn = document.getElementById('addParagraphBtn');
    const splitBtn = document.getElementById('splitParagraphsBtn');
    const bulkText = document.getElementById('bulkParagraphText');

    const addSubpoint = (subContainer, text = '') => {
        const sp = document.getElementById('subpointTemplate').content.cloneNode(true);
        const spNode = sp.firstElementChild;
        spNode.querySelector('.subpoint-text').value = text;
        spNode.querySelector('.remove-subpoint').addEventListener('click', () => spNode.remove());
        spNode.querySelector('.toggle-bold').addEventListener('click', () => {
            spNode.classList.toggle('bold');
        });
        subContainer.appendChild(sp);
    };

    const addParagraph = (text = '') => {
        const el = paragraphTemplate.content.cloneNode(true);
        const node = el.firstElementChild;
        node.querySelector('.paragraph-text').value = text;
        node.querySelector('.remove-paragraph').addEventListener('click', () => node.remove());
        const subContainer = node.querySelector('.subpoints-container');
        node.querySelector('.add-subpoint').addEventListener('click', () => addSubpoint(subContainer, ''));
        paragraphsContainer.appendChild(el);
    };

    if (paragraphsContainer && paragraphsContainer.children.length === 0) {
        addParagraph('');
    }

    addParagraphBtn?.addEventListener('click', () => addParagraph(''));
    splitBtn?.addEventListener('click', () => {
        const raw = (bulkText?.value || '').trim();
        if (!raw) return;
        const parts = raw.split('.').map(s => s.trim()).filter(Boolean);
        parts.forEach(p => addParagraph(p));
        bulkText.value = '';
    });
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const title = document.getElementById('newsTitle').value;
            const category = document.getElementById('newsCategory').value;
            const section = document.getElementById('newsSection').value;
            const paragraphNodes = Array.from(document.querySelectorAll('.paragraph-item'));
            const paragraphs = paragraphNodes.map(node => {
                const text = node.querySelector('.paragraph-text')?.value.trim() || '';
                const points = Array.from(node.querySelectorAll('.subpoint-item')).map(sp => ({
                    text: sp.querySelector('.subpoint-text')?.value.trim() || '',
                    bold: sp.classList.contains('bold')
                })).filter(pt => pt.text);
                return { text, points };
            }).filter(p => p.text || (p.points && p.points.length));
            const content = paragraphs.map(p => {
                let t = p.text;
                if (p.points?.length) {
                    t += '\n' + p.points.map(pt => `• ${pt.bold ? '**' + pt.text + '**' : pt.text}`).join('\n');
                }
                return t;
            }).join('\n\n');
            const imageFileInput = document.getElementById('newsImageFile');
            const imageFile = imageFileInput?.files?.[0] || null;
            const status = document.getElementById('newsStatus').value;
            const url = document.getElementById('newsUrl')?.value || '';

            try {
                let imageUrl = existingImageUrl;
                let imageName = '';

                if (imageFile) {
                    imageName = imageFile.name;
                    const fileName = `news/${Date.now()}_${Math.random().toString(36).slice(2)}_${imageFile.name}`;
                    const storageRef = ref(storage, fileName);
                    await uploadBytes(storageRef, imageFile, { contentType: imageFile.type });
                    imageUrl = await getDownloadURL(storageRef);
                }

                const newsData = {
                    title,
                    category,
                    section,
                    content,
                    paragraphs,
                    url,
                    imageName: imageName || undefined,
                    imageUrl: imageUrl || undefined,
                    status,
                    authorId: auth.currentUser?.uid || 'anonymous',
                    authorName: auth.currentUser?.displayName || 'Anonymous',
                    updatedAt: serverTimestamp(),
                    createdAt: serverTimestamp()
                };

                if (newsId) {
                    await updateDoc(doc(db, 'news', newsId), newsData);
                    showToast('News updated successfully!', 'success');
                } else {
                    newsData.createdAt = serverTimestamp();
                    await addDoc(collection(db, 'news'), newsData);
                    showToast('News uploaded successfully!', 'success');
                }
                setTimeout(() => { window.location.href = 'dashboard.html'; }, 800);
            } catch (error) {
                console.error('Error:', error);
                showToast('Failed to process news. Please try again.', 'danger');
            }
        });
    } else {
        console.error('Form not found');
    }
});
