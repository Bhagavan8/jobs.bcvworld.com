import { auth, db } from './firebase-config.js';
import { 
    collection, 
    getDocs, 
    deleteDoc, 
    doc,
    query, 
    orderBy 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// DOM Elements
const usersTableBody = document.getElementById('usersTableBody');
const userCountBadge = document.getElementById('userCount');
const toastEl = document.getElementById('liveToast');
const toast = new bootstrap.Toast(toastEl);
const toastMessage = document.getElementById('toastMessage');
const usersPagination = document.getElementById('usersPagination');

// State
let allUsers = [];
let currentPage = 1;
const ITEMS_PER_PAGE = 10;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkAdminAndLoadUsers();
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('userSearch')?.addEventListener('input', () => {
        currentPage = 1;
        applyFilters();
    });
    document.getElementById('statusFilter')?.addEventListener('change', () => {
        currentPage = 1;
        applyFilters();
    });
    document.getElementById('roleFilter')?.addEventListener('change', () => {
        currentPage = 1;
        applyFilters();
    });
}

function checkAdminAndLoadUsers() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            loadUsers();
        } else {
            window.location.href = 'login.html';
        }
    });
}

async function loadUsers() {
    try {
        const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        
        allUsers = [];
        querySnapshot.forEach((doc) => {
            allUsers.push({ id: doc.id, ...doc.data() });
        });

        applyFilters();
    } catch (error) {
        console.error("Error loading users:", error);
        // Fallback if sorting fails
        try {
            const querySnapshot = await getDocs(collection(db, "users"));
            allUsers = [];
            querySnapshot.forEach((doc) => {
                allUsers.push({ id: doc.id, ...doc.data() });
            });
            applyFilters();
        } catch (err) {
            console.error("Error loading users fallback:", err);
            usersTableBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Error loading users: ${err.message}</td></tr>`;
        }
    }
}

function applyFilters() {
    const searchTerm = document.getElementById('userSearch').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    const roleFilter = document.getElementById('roleFilter').value;

    const filteredUsers = allUsers.filter(user => {
        const name = resolveUserName(user).toLowerCase();
        const email = (user.email || '').toLowerCase();
        const phone = (user.phoneNumber || user.phone || '').toLowerCase();
        
        const matchesSearch = name.includes(searchTerm) || email.includes(searchTerm) || phone.includes(searchTerm);
        
        const matchesStatus = statusFilter === 'all' || 
            (statusFilter === 'active' && user.isActive !== false) ||
            (statusFilter === 'inactive' && user.isActive === false);
            
        const matchesRole = roleFilter === 'all' || (user.role || 'user') === roleFilter;

        return matchesSearch && matchesStatus && matchesRole;
    });

    // Sort by Full Name (A-Z)
    filteredUsers.sort((a, b) => {
        const nameA = resolveUserName(a).toLowerCase();
        const nameB = resolveUserName(b).toLowerCase();
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        return 0;
    });

    renderUsers(filteredUsers);
}

function resolveUserName(user) {
    let name = user.fullName || user.name;
    if (!name && user.firstName) {
        name = `${user.firstName} ${user.lastName || ''}`.trim();
    }
    if (!name && user.displayName) {
        name = user.displayName;
    }
    if (!name) {
        name = user.email ? user.email.split('@')[0] : 'N/A';
    }
    return name;
}

function renderUsers(users) {
    userCountBadge.textContent = `${users.length} Users`;
    
    if (users.length === 0) {
        usersTableBody.innerHTML = `<tr><td colspan="7" class="text-center py-4">No users found</td></tr>`;
        usersPagination.innerHTML = '';
        return;
    }

    // Pagination Logic
    const totalPages = Math.ceil(users.length / ITEMS_PER_PAGE);
    if (currentPage > totalPages) currentPage = 1;
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const paginatedUsers = users.slice(start, end);

    usersTableBody.innerHTML = paginatedUsers.map(user => {
        const name = resolveUserName(user);
        const email = user.email || 'N/A';
        const phone = user.phoneNumber || user.phone || 'N/A';
        const status = user.isActive !== false ? '<span class="badge bg-success">Active</span>' : '<span class="badge bg-secondary">Inactive</span>';
        const date = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A';
        const dob = user.dob || user.dateOfBirth || 'N/A';
        const avatarInitial = name.charAt(0).toUpperCase();
        
        // Check if this is the current user to prevent self-deletion
        const isCurrentUser = auth.currentUser && auth.currentUser.uid === user.id;
        const isAdmin = (user.role === 'admin');

        return `
            <tr>
                <td class="ps-4">
                    <div class="d-flex align-items-center">
                        <div class="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center me-3" style="width: 40px; height: 40px; font-weight: bold;">
                            ${avatarInitial}
                        </div>
                        <div>
                            <h6 class="mb-0 fw-semibold">${name}</h6>
                            <small class="text-muted d-lg-none">${email}</small>
                        </div>
                    </div>
                </td>
                <td class="d-none d-lg-table-cell">${email}</td>
                <td>${phone}</td>
                <td>${dob}</td>
                <td>${status}</td>
                <td class="text-end pe-4">
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteUser('${user.id}')" ${isCurrentUser ? 'disabled' : ''} title="${isCurrentUser ? 'Cannot delete yourself' : 'Delete User'}">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    renderPagination(totalPages);
}

function renderPagination(totalPages) {
    if (totalPages <= 1) {
        usersPagination.innerHTML = '';
        return;
    }

    let html = '';
    
    // Previous
    html += `
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <button class="page-link" onclick="changePage(${currentPage - 1})">Previous</button>
        </li>
    `;

    // Page Numbers
    // Simple pagination: show all or limited range? Let's show all for simplicity or simple range
    // reusing dashboard.js logic style
    const delta = 2;
    const range = [];
    range.push(1);
    for (let i = currentPage - delta; i <= currentPage + delta; i++) {
        if (i > 1 && i < totalPages) range.push(i);
    }
    if (totalPages > 1) range.push(totalPages);
    
    const uniqueRange = [...new Set(range)].sort((a, b) => a - b);
    
    let l;
    for (const i of uniqueRange) {
        if (l) {
            if (i - l === 2) {
                html += `<li class="page-item"><button class="page-link" onclick="changePage(${l + 1})">${l + 1}</button></li>`;
            } else if (i - l !== 1) {
                html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            }
        }
        html += `
            <li class="page-item ${i === currentPage ? 'active' : ''}">
                <button class="page-link" onclick="changePage(${i})">${i}</button>
            </li>
        `;
        l = i;
    }

    // Next
    html += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <button class="page-link" onclick="changePage(${currentPage + 1})">Next</button>
        </li>
    `;

    usersPagination.innerHTML = html;
}

window.changePage = (page) => {
    currentPage = page;
    applyFilters(); // Re-render with new page
};

window.deleteUser = async (userId) => {
    if (confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
        try {
            await deleteDoc(doc(db, "users", userId));
            showToast('User deleted successfully');
            loadUsers(); // Reload data
        } catch (error) {
            console.error("Error deleting user:", error);
            showToast('Error deleting user', true);
        }
    }
};

function showToast(message, isError = false) {
    toastMessage.textContent = message;
    if (isError) {
        toastEl.classList.remove('bg-primary');
        toastEl.classList.add('bg-danger');
    } else {
        toastEl.classList.remove('bg-danger');
        toastEl.classList.add('bg-primary');
    }
    toast.show();
}
