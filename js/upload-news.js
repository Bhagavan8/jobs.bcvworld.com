import { auth, db } from './firebase-config.js';
import { 
    collection, 
    addDoc, 
    doc, 
    getDoc,
    updateDoc,
    serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

// Get the news ID from URL if it exists
const urlParams = new URLSearchParams(window.location.search);
const newsId = urlParams.get('id');


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
                document.getElementById('newsContent').value = data.content || '';
                document.getElementById('newsImage').value = data.imageName || '';
                document.getElementById('newsStatus').value = data.status || 'pending';

                // Update form button text
                document.querySelector('button[type="submit"]').textContent = 'Update News';
            }
        } catch (error) {
            console.error('Error loading news:', error);
            alert('Error loading news data');
        }
    }
}

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    loadNewsData();
    
    const form = document.querySelector('#uploadNewsForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const title = document.getElementById('newsTitle').value;
            const category = document.getElementById('newsCategory').value;
            const section = document.getElementById('newsSection').value;
            const content = document.getElementById('newsContent').value;
            const imageName = document.getElementById('newsImage').value;
            const status = document.getElementById('newsStatus').value;

            try {
                const newsData = {
                    title,
                    category,
                    section,
                    content,
                    imageName,
                    imagePath: `/assets/images/news/${imageName}`,
                    approvalStatus: status,
                    authorId: auth.currentUser?.uid || 'anonymous',
                    authorName: auth.currentUser?.displayName || 'Anonymous',
                    updatedAt: serverTimestamp(),
                    createdAt: serverTimestamp()
                };

                if (newsId) {
                    await updateDoc(doc(db, 'news', newsId), newsData);
                    alert('News updated successfully!');
                } else {
                    newsData.createdAt = serverTimestamp();
                    await addDoc(collection(db, 'news'), newsData);
                    alert('News uploaded successfully!');
                }

                window.location.href = 'dashboard.html';
            } catch (error) {
                console.error('Error:', error);
                alert('Failed to process news. Please try again.');
            }
        });
    } else {
        console.error('Form not found');
    }
});