import { auth, db } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'login.html';
    }
});

const storyForm = document.getElementById('storyForm');
const addChapterBtn = document.getElementById('addChapter');
const chaptersContainer = document.getElementById('chaptersContainer');
const chapterTemplate = document.getElementById('chapterTemplate');

// Add first chapter by default
addChapter();

// Add new chapter
addChapterBtn.addEventListener('click', addChapter);

function addChapter() {
    const chapterElement = chapterTemplate.content.cloneNode(true);
    const chapterCount = chaptersContainer.children.length + 1;
    
    chapterElement.querySelector('.chapter-number').textContent = chapterCount;
    
    // Remove chapter button
    chapterElement.querySelector('.remove-chapter').addEventListener('click', function(e) {
        if (chaptersContainer.children.length > 1) {
            e.target.closest('.chapter').remove();
            updateChapterNumbers();
        } else {
            alert('Story must have at least one chapter');
        }
    });
    
    chaptersContainer.appendChild(chapterElement);
}

function updateChapterNumbers() {
    const chapters = chaptersContainer.querySelectorAll('.chapter');
    chapters.forEach((chapter, index) => {
        chapter.querySelector('.chapter-number').textContent = index + 1;
    });
}

storyForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
        const user = auth.currentUser;
        
        // Get chapters data
        const chapters = [];
        const chapterElements = chaptersContainer.querySelectorAll('.chapter');
        
        chapterElements.forEach((chapter, index) => {
            chapters.push({
                number: index + 1,
                title: chapter.querySelector('.chapter-title').value,
                content: chapter.querySelector('.chapter-content').value,
                imageUrl: chapter.querySelector('.chapter-image').value || null
            });
        });

        const storyData = {
            title: document.getElementById('storyTitle').value,
            category: document.getElementById('storyCategory').value,
            shortDescription: document.getElementById('shortDescription').value,
            chapters: chapters,
            status: document.getElementById('status').value,
            visibility: document.getElementById('visibility').value,
            authorId: user.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            views: 0,
            likes: 0
        };

        await addDoc(collection(db, 'stories'), storyData);
        alert('Story saved successfully!');
        storyForm.reset();
        
        // Reset to one chapter
        chaptersContainer.innerHTML = '';
        addChapter();

    } catch (error) {
        console.error('Error saving story:', error);
        alert('Error saving story: ' + error.message);
    }
});