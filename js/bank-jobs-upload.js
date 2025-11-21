import { auth, db } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'login.html';
    }
});

const uploadBankJobForm = document.getElementById('uploadBankJobForm');

uploadBankJobForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
        const user = auth.currentUser;
        
        const jobData = {
            bankName: document.getElementById('bankName').value,
            bankType: document.getElementById('bankType').value,
            state: document.getElementById('state').value,
            postName: document.getElementById('postName').value,
            vacancies: parseInt(document.getElementById('vacancies').value),
            qualification: document.getElementById('qualification').value,
            ageLimit: document.getElementById('ageLimit').value,
            salary: document.getElementById('salary').value,
            description: document.getElementById('description').value,
            lastDate: document.getElementById('lastDate').value,
            examDate: document.getElementById('examDate').value || null,
            applicationLink: document.getElementById('applicationLink').value,
            notificationFile: document.getElementById('notificationFile').value,
            jobType: 'bank',
            postedBy: user.uid,
            postedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            isActive: true
        };

        await addDoc(collection(db, 'bankJobs'), jobData);
        alert('Bank job posted successfully!');
        uploadBankJobForm.reset();

    } catch (error) {
        console.error('Error posting bank job:', error);
        alert('Error posting job: ' + error.message);
    }
});