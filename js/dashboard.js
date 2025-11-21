import { auth, db } from './firebase-config.js';
import {
    collection,
    query,
    orderBy,
    getDocs,
    getDoc,
    doc,
    deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";


// Initialize when auth state changes
onAuthStateChanged(auth, (user) => {
    console.log(user);
    if (!user) {
        window.location.href = 'login.html';
    } else {
        const email = user.email || '';
        const namePart = email.split('@')[0]; // Get part before @

        // Remove numbers and special characters, keep only letters
        const lettersOnly = namePart.replace(/[^a-zA-Z]/g, '');

        // Capitalize the first letter, rest lowercase
        const displayName = lettersOnly.charAt(0).toUpperCase() + lettersOnly.slice(1).toLowerCase();

        document.getElementById('userName').textContent = displayName;

        loadTables(); 
    }
});

// Add error handling for the statistics
window.addEventListener('error', (event) => {
    console.error('Error in statistics:', event.error);
    const affectedElement = event.target.id;
    if (affectedElement) {
        document.getElementById(affectedElement).textContent = 'Error';
    }
});

function isAdmin() {
    const userRole = localStorage.getItem('userRole');
    return userRole === 'Admin';
}


// Add these variables at the top of the file
const ITEMS_PER_PAGE = 10;
let currentPage = {
    news: 1,
    jobs: 1,
    stories: 1,
    affiliate: 1
};

async function loadTables() {
    try {
        // Load News Table with pagination
        const newsRef = collection(db, 'news');
        const newsQuery = query(newsRef, orderBy('createdAt', 'desc'));
        const newsSnapshot = await getDocs(newsQuery);
        const newsTableBody = document.getElementById('newsTableBody');
        const newsPagination = document.getElementById('newsPagination');
        updateTable('news', newsSnapshot.docs, newsTableBody, newsPagination);

        // Load Jobs Table with pagination
        const jobsRef = collection(db, 'jobs');
        const jobsQuery = query(jobsRef, orderBy('createdAt', 'desc'));
        const jobsSnapshot = await getDocs(jobsQuery);
        const jobsTableBody = document.getElementById('jobsTableBody');
        const jobsPagination = document.getElementById('jobsPagination');
        await updateJobsTable(jobsSnapshot.docs, jobsTableBody, jobsPagination);

        // Load Stories Table with pagination
        const storiesRef = collection(db, 'stories');
        const storiesQuery = query(storiesRef, orderBy('createdAt', 'desc'));
        const storiesSnapshot = await getDocs(storiesQuery);
        const storiesTableBody = document.getElementById('storiesTableBody');
        const storiesPagination = document.getElementById('storiesPagination');
        updateTable('stories', storiesSnapshot.docs, storiesTableBody, storiesPagination);

        // Load Affiliate Table with pagination
        const affiliateRef = collection(db, 'affiliate');
        const affiliateQuery = query(affiliateRef, orderBy('createdAt', 'desc'));
        const affiliateSnapshot = await getDocs(affiliateQuery);
        const affiliateTableBody = document.getElementById('affiliateTableBody');
        const affiliatePagination = document.getElementById('affiliatePagination');
        updateTable('affiliate', affiliateSnapshot.docs, affiliateTableBody, affiliatePagination);

    } catch (error) {
        console.error('Error loading tables:', error);
        alert('Failed to load some data. Please refresh the page.');
    }
}

function updateTable(type, docs, tableBody, paginationElement) {
    const totalPages = Math.ceil(docs.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage[type] - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const currentDocs = docs.slice(startIndex, endIndex);

    tableBody.innerHTML = '';
    
    currentDocs.forEach(doc => {
        const data = doc.data();
        let row = '';
        const actionButtons = isAdmin() ? `
            <button class="btn btn-sm btn-primary edit-btn" data-id="${doc.id}" data-type="${type}">Edit</button>
            <button class="btn btn-sm btn-danger delete-btn" data-id="${doc.id}" data-type="${type}">Delete</button>
        ` : '';
        
        switch(type) {
            case 'news':
                row = `
                    <tr>
                        <td>${data.title}</td>
                        <td>${data.category}</td>
                        <td>${new Date(data.createdAt?.toDate()).toLocaleDateString()}</td>
                        <td>${data.views || 0}</td>
                        <td>${actionButtons}</td>
                    </tr>`;
                break;
            case 'stories':
                row = `
                    <tr>
                        <td>${data.title}</td>
                        <td>${data.category}</td>
                        <td>${data.chapters || 0}</td>
                        <td>${data.status}</td>
                        <td>${data.views || 0}</td>
                        <td>${actionButtons}</td>
                    </tr>`;
                break;
            case 'affiliate':
                row = `
                    <tr>
                        <td>${data.product}</td>
                        <td>${data.category}</td>
                        <td>${data.price}</td>
                        <td>${data.clicks || 0}</td>
                        <td>${data.status}</td>
                        <td>${actionButtons}</td>
                    </tr>`;
                break;
        }
        
        tableBody.innerHTML += row;
    });

    // Update pagination
    updatePagination(type, totalPages, paginationElement);

    // Reattach event listeners
    attachEventListeners();
}

async function updateJobsTable(docs, tableBody, paginationElement) {
    const totalPages = Math.ceil(docs.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage['jobs'] - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const currentDocs = docs.slice(startIndex, endIndex);

    tableBody.innerHTML = '';
    
    // Fetch all company details in parallel for better performance
    const companyPromises = currentDocs
        .filter(docSnapshot => docSnapshot.data().companyId)
        .map(async docSnapshot => {
            const job = docSnapshot.data();
            try {
                // Use the imported doc function from Firestore
                const companyRef = doc(db, 'companies', job.companyId.toString());
                const companySnapshot = await getDoc(companyRef);
                return {
                    jobId: docSnapshot.id,
                    companyName: companySnapshot.exists() ? companySnapshot.data().name : job.companyName
                };
            } catch (error) {
                console.error('Error fetching company details:', error);
                return { jobId: docSnapshot.id, companyName: job.companyName };
            }
        });

    // Wait for all company details to be fetched
    const companyDetails = await Promise.all(companyPromises);
    const companyMap = new Map(companyDetails.map(detail => [detail.jobId, detail.companyName]));
   
    // Render table rows
    for (const docSnapshot of currentDocs) {
        const job = docSnapshot.data();
        const companyName = companyMap.get(docSnapshot.id) || job.companyName;
        // Only show action buttons for Admin users
        const actionButtons = isAdmin() ? `
            <button class="btn btn-sm btn-primary edit-btn" data-id="${docSnapshot.id}" data-type="jobs">Edit</button>
            <button class="btn btn-sm btn-danger delete-btn" data-id="${docSnapshot.id}" data-type="jobs">Delete</button>
        ` : '';
        tableBody.innerHTML += `
            <tr>
                <td>${job.jobTitle}</td>
                <td>${companyName}</td>
                <td>${job.createdAt ? (job.createdAt.seconds ? new Date(job.createdAt.seconds * 1000).toLocaleDateString() : new Date(job.createdAt).toLocaleDateString()) : 'N/A'}</td>
                <td>${job.lastDate ? (job.lastDate.seconds ? new Date(job.lastDate.seconds * 1000).toLocaleDateString() : new Date(job.lastDate).toLocaleDateString()) : 'No deadline'}</td>
                <td>${job.views || 0}</td>
                <td>${job.status}</td>
                <td>${actionButtons}</td>
            </tr>`;
    }

    // Update pagination
    updatePagination('jobs', totalPages, paginationElement);

    // Reattach event listeners
    attachEventListeners();
}

function updatePagination(type, totalPages, paginationElement) {
    paginationElement.innerHTML = '';
    
    if (totalPages <= 1) return;

    const createPageButton = (pageNum, isActive = false) => {
        const li = document.createElement('li');
        li.className = `page-item${isActive ? ' active' : ''}`;
        li.innerHTML = `<button class="page-link" data-page="${pageNum}" data-type="${type}">${pageNum}</button>`;
        return li;
    };

    const ul = document.createElement('ul');
    ul.className = 'pagination justify-content-center';

    // Previous button
    const prevLi = document.createElement('li');
    prevLi.className = `page-item${currentPage[type] === 1 ? ' disabled' : ''}`;
    prevLi.innerHTML = `<button class="page-link" data-page="${currentPage[type] - 1}" data-type="${type}">Previous</button>`;
    ul.appendChild(prevLi);

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        ul.appendChild(createPageButton(i, i === currentPage[type]));
    }

    // Next button
    const nextLi = document.createElement('li');
    nextLi.className = `page-item${currentPage[type] === totalPages ? ' disabled' : ''}`;
    nextLi.innerHTML = `<button class="page-link" data-page="${currentPage[type] + 1}" data-type="${type}">Next</button>`;
    ul.appendChild(nextLi);

    paginationElement.appendChild(ul);

    // Add event listeners to pagination buttons
    paginationElement.querySelectorAll('.page-link').forEach(button => {
        button.addEventListener('click', handlePagination);
    });
}

function handlePagination(e) {
    e.preventDefault();
    const page = parseInt(e.target.dataset.page);
    const type = e.target.dataset.type;
    
    if (page < 1) return;
    
    currentPage[type] = page;
    loadTables(); // Reload tables with new page
}

function attachEventListeners() {
    document.querySelectorAll('.edit-btn').forEach(button => {
        button.removeEventListener('click', handleEdit);
        button.addEventListener('click', handleEdit);
    });
    document.querySelectorAll('.delete-btn').forEach(button => {
        button.removeEventListener('click', handleDelete);
        button.addEventListener('click', handleDelete);
    });
}

// Add these functions before loadTables
async function handleEdit(e) {
    e.preventDefault();
    const id = e.target.dataset.id;
    const type = e.target.dataset.type;
    // Map the type to the correct edit page and add edit parameter
    const editPages = {
        'news': 'upload-news.html',
        'jobs': 'jobs-upload.html',
        'stories': 'stories-upload.html',
        'affiliate': 'affiliate-upload.html'
    };
    const editPage = editPages[type] || `${type}-edit.html`;
    window.location.href = `${editPage}?id=${id}&edit=true`;
}

async function handleDelete(e) {
    e.preventDefault();
    const id = e.target.dataset.id;
    const type = e.target.dataset.type;

    if (confirm(`Are you sure you want to delete this ${type} item?`)) {
        try {
            await deleteDoc(doc(db, type, id));

            await loadTables();
        } catch (error) {
            console.error('Error deleting item:', error);
            alert('Failed to delete item. Please try again.');
        }
    }
}

// Add logout handler
const logoutBtn = document.getElementById('logoutBtn');
logoutBtn?.addEventListener('click', async () => {
    try {
        await auth.signOut();
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Error during logout:', error);
        alert('Failed to logout. Please try again.');
    }
});