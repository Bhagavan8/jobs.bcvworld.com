import { auth, db } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'login.html';
    }
});

const uploadGovtJobForm = document.getElementById('uploadGovtJobForm');

uploadGovtJobForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
        const user = auth.currentUser;
        
        const jobData = {
            department: document.getElementById('department').value,
            state: document.getElementById('state').value,
            postName: document.getElementById('postName').value,
            vacancies: document.getElementById('vacancies').value,
            qualification: document.getElementById('qualification').value,
            salary: document.getElementById('salary').value,
            description: document.getElementById('description').value,
            lastDate: document.getElementById('lastDate').value,
            examDate: document.getElementById('examDate').value || null,
            applicationLink: document.getElementById('applicationLink').value,
            notificationFile: document.getElementById('notificationFile').value,
            isActive: document.getElementById('isActive').value === 'true', // Convert string to boolean
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await addDoc(collection(db, 'governmentJobs'), jobData);
        alert('Government job posted successfully!');
        uploadGovtJobForm.reset();

    } catch (error) {
        console.error('Error posting government job:', error);
        alert('Error posting job: ' + error.message);
    }
});