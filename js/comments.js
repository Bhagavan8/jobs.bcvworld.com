import { auth, db } from './firebase-config.js';
import { 
    collection, 
    query, 
    orderBy, 
    onSnapshot, 
    doc, 
    deleteDoc,
    getDoc,
    updateDoc, 
    where,
    limit,
    startAfter,
    endBefore,
    limitToLast
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let currentUser = null;
let deleteModal = null;
let commentToDelete = null;

// Pagination State
const commentState = {
    page: 1,
    lastDocs: [], // Stack to store last document of each page for back navigation
    unsubscribe: null,
    itemsPerPage: 10
};

// Debug helper to make self admin
window.makeMeAdmin = async () => {
    if (!auth.currentUser) return console.error('Not logged in');
    try {
        await updateDoc(doc(db, 'users', auth.currentUser.uid), { role: 'admin' });
        console.log('Success! You are now admin. Refresh the page.');
        alert('Success! You are now admin. Refresh the page.');
    } catch (e) {
        console.error('Error making admin:', e);
        alert('Error: ' + e.message);
    }
};

// Initialize Bootstrap components
document.addEventListener('DOMContentLoaded', () => {
    deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
    
    // Setup delete confirmation
    document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
        if (commentToDelete) {
            await deleteComment(commentToDelete);
            deleteModal.hide();
            commentToDelete = null;
        }
    });

    // Setup search
    document.getElementById('searchComments').addEventListener('input', debounce((e) => {
        const searchTerm = e.target.value.toLowerCase();
        filterComments(searchTerm);
    }, 300));

    // Sidebar Toggle
    const sidebar = document.querySelector('.sidebar');
    const sidebarToggles = document.querySelectorAll('.sidebar-toggle');
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);

    function toggleSidebar() {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
        document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
    }

    sidebarToggles.forEach(toggle => {
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSidebar();
        });
    });

    // Close sidebar when clicking overlay
    overlay.addEventListener('click', () => {
        if (sidebar.classList.contains('active')) {
            toggleSidebar();
        }
    });

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
        if (window.innerWidth < 992 && 
            sidebar.classList.contains('active') && 
            !sidebar.contains(e.target) && 
            !e.target.closest('.sidebar-toggle')) {
            toggleSidebar();
        }
    });

    // Logout Button Listener
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Pagination Listeners
    document.getElementById('prevBtn').addEventListener('click', () => changePage('prev'));
    document.getElementById('nextBtn').addEventListener('click', () => changePage('next'));
});

async function handleLogout(e) {
    e.preventDefault();
    try {
        await auth.signOut();
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Error signing out:', error);
        alert('Error signing out. Please try again.');
    }
}

// Authentication check
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    // Check admin role
    console.log('Checking admin role for user:', user.uid, user.email);
    try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        
        console.log('User doc exists:', userDoc.exists());
        if (userDoc.exists()) {
            console.log('User data:', userDoc.data());
        }

        const role = userDoc.exists() ? userDoc.data().role : null;
        console.log('User role from DB:', role);

        // Check for 'admin' or 'Admin' to handle case inconsistency
        if (!role || (role !== 'admin' && role !== 'Admin')) {
            console.warn('Access denied. Role:', role);
            const msg = 'Access Denied. Admin privileges required.\nYour role is: ' + (role || 'unknown') + 
                       '\n\nIf you are the developer, open Console (F12) and run: makeMeAdmin()';
            alert(msg);
            window.location.href = 'dashboard.html';
            return;
        }

        currentUser = user;
        
        // Setup UI based on role
        setupRoleBasedUI(role);

        // Update UI with user info
        if (userDoc.exists()) {
            updateUserInterface(userDoc.data(), user);
        } else {
            // Fallback if no user doc
            updateUserInterface({}, user);
        }

        initializeComments();
    } catch (err) {
        console.error('Error checking admin role:', err);
        alert('Error verifying permissions: ' + err.message);
        return;
    }
});

function setupRoleBasedUI(role) {
    // Hide/Show admin content
    const adminEmployerContent = document.getElementById('adminEmployerContent');
    const adminOnlyContent = document.getElementById('adminOnlyContent');
    const adminOnlyJobs = document.getElementById('adminOnlyJobs');

    if (role === 'Admin' || role === 'Employer' || role === 'admin') {
        if (adminEmployerContent) adminEmployerContent.style.display = 'block';
    }

    if (role === 'Admin' || role === 'admin') {
        if (adminOnlyContent) adminOnlyContent.style.display = 'block';
        if (adminOnlyJobs) adminOnlyJobs.style.display = 'block';
    }
}

function updateUserInterface(userData, user) {
    const firstName = capitalizeFirstLetter(userData.firstName || user.email.split('@')[0]);
    const profileImage = userData.profileImageUrl || user.profileImageUrl || '/images/default.webp';
    const userRole = userData.role || 'Admin';

    // Update Sidebar Footer
    const sidebarFooter = document.querySelector('.sidebar-footer');
    if (sidebarFooter) {
        sidebarFooter.innerHTML = `
            <div class="user-profile">
                <img src="${profileImage}" alt="${firstName}" class="profile-img">
                <div class="profile-info">
                    <h6 class="profile-name">${firstName}</h6>
                    <span class="profile-role">${userRole}</span>
                </div>
            </div>
        `;
    }

    // Update Top Menu
    const userMenuDropdown = document.getElementById('userMenuDropdown');
    if (userMenuDropdown) {
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
                    <li><a class="dropdown-item" href="profile-upload.html"><i class="bi bi-person-circle me-2"></i>My Profile</a></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><a class="dropdown-item" href="#" id="logoutBtnDropdown"><i class="bi bi-box-arrow-right me-2"></i>Sign Out</a></li>
                </ul>
            </div>
        `;
        
        // Add listener to new logout button
        const logoutBtnDropdown = document.getElementById('logoutBtnDropdown');
        if (logoutBtnDropdown) {
            logoutBtnDropdown.addEventListener('click', handleLogout);
        }
    }
}

function capitalizeFirstLetter(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function initializeComments() {
    const commentsContainer = document.getElementById('commentsContainer');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const pageIndicator = document.getElementById('pageIndicator');

    // Unsubscribe previous listener
    if (commentState.unsubscribe) {
        commentState.unsubscribe();
    }

    // Build query
    let q = query(
        collection(db, 'jobComments'), 
        orderBy('timestamp', 'desc'),
        limit(commentState.itemsPerPage)
    );

    // Apply pagination
    if (commentState.page > 1 && commentState.lastDocs.length >= commentState.page - 1) {
        const lastDoc = commentState.lastDocs[commentState.page - 2];
        q = query(
            collection(db, 'jobComments'), 
            orderBy('timestamp', 'desc'),
            startAfter(lastDoc),
            limit(commentState.itemsPerPage)
        );
    }

    commentState.unsubscribe = onSnapshot(q, (snapshot) => {
        // Update navigation UI
        pageIndicator.textContent = `Page ${commentState.page}`;
        prevBtn.disabled = commentState.page === 1;
        nextBtn.disabled = snapshot.docs.length < commentState.itemsPerPage;

        // Store last doc for next page
        if (!snapshot.empty) {
            // Ensure array is big enough
            while(commentState.lastDocs.length < commentState.page) {
                commentState.lastDocs.push(null);
            }
            commentState.lastDocs[commentState.page - 1] = snapshot.docs[snapshot.docs.length - 1];
        }

        if (snapshot.empty && commentState.page > 1) {
            // If empty page but not first page, go back
            changePage('prev');
            return;
        }

        if (snapshot.empty) {
            commentsContainer.innerHTML = `
                <div class="col-12 text-center py-5">
                    <div class="text-muted">
                        <i class="bi bi-chat-square-dots display-1 opacity-25"></i>
                        <p class="mt-3 fs-5">No comments found</p>
                    </div>
                </div>
            `;
            return;
        }

        commentsContainer.innerHTML = '';
        
        snapshot.forEach((docSnap) => {
            const comment = docSnap.data();
            const commentId = docSnap.id;
            
            const card = createCommentCard(comment, commentId);
            commentsContainer.appendChild(card);
        });
    }, (error) => {
        console.error("Error fetching comments:", error);
        commentsContainer.innerHTML = `
            <div class="col-12 text-center text-danger py-5">
                <p>Error loading comments. Please try again later.</p>
                <small>${error.message}</small>
            </div>
        `;
    });
}

function changePage(direction) {
    if (direction === 'next') {
        commentState.page++;
    } else if (direction === 'prev' && commentState.page > 1) {
        commentState.page--;
    }
    initializeComments();
}

function createCommentCard(comment, id) {
    const col = document.createElement('div');
    col.className = 'col-12 comment-item border-bottom'; // Added border-bottom for list feel
    col.dataset.searchText = `${comment.userName} ${comment.userEmail} ${comment.content}`.toLowerCase();
    
    const timestamp = getSafeDate(comment.timestamp);
    const dateStr = timestamp ? timestamp.toLocaleString() : 'Unknown date';
    const timeAgo = timestamp ? getTimeAgo(timestamp) : '';

    // Long text handling
    const fullText = escapeHtml(comment.content || '');
    const isLongText = fullText.length > 200;
    const displayText = isLongText ? fullText.substring(0, 200) + '...' : fullText;
    const readMoreHtml = isLongText ? 
        `<a href="#" class="text-primary small text-decoration-none ms-1 read-more-btn" onclick="toggleReadMore(event, this, '${fullText.replace(/'/g, "\\'")}')">Read More</a>` : '';

    col.innerHTML = `
        <div class="comment-card p-3">
            <div class="d-flex gap-3">
                <div class="avatar-circle flex-shrink-0">
                    ${(comment.userName || 'A').charAt(0).toUpperCase()}
                </div>
                <div class="flex-grow-1">
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
                            <h6 class="mb-0 fw-bold text-dark">${comment.userName || 'Anonymous'}</h6>
                            <span class="text-muted small">•</span>
                            <span class="text-muted small">${comment.userEmail || 'No email'}</span>
                            <span class="text-muted small">•</span>
                            <span class="text-muted small" title="${dateStr}">${timeAgo}</span>
                        </div>
                        <button class="btn btn-outline-danger btn-sm" onclick="showDeleteModal('${id}')" title="Delete Comment">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                    
                    <div class="comment-content mt-2">
                        <p class="comment-text mb-1 text-break">${displayText}${readMoreHtml}</p>
                    </div>
                    
                    <div class="d-flex align-items-center gap-3 mt-2">
                        <span class="job-badge text-muted small bg-light px-2 py-1 rounded d-flex align-items-center">
                            <i class="bi bi-briefcase me-2"></i>
                            <span class="me-2">Job ID: ${comment.jobId ? (comment.jobId.length > 20 ? comment.jobId.substring(0, 20) + '...' : comment.jobId) : 'Unknown'}</span>
                            ${comment.jobId ? `
                            <i class="bi bi-copy cursor-pointer" onclick="copyToClipboard('${comment.jobId}')" title="Copy Job ID" style="cursor: pointer;"></i>
                            ` : ''}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    `;
    return col;
}

// Global function for Copy to Clipboard
window.copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Job ID copied to clipboard');
    }).catch(err => {
        console.error('Failed to copy:', err);
        showToast('Failed to copy Job ID', 'error');
    });
};

// Global function for Read More
window.toggleReadMore = (e, btn, fullText) => {
    e.preventDefault();
    const p = btn.closest('.comment-text');
    if (btn.textContent === 'Read More') {
        p.innerHTML = fullText + ` <a href="#" class="text-primary small text-decoration-none ms-1 read-more-btn" onclick="toggleReadMore(event, this, '${fullText.replace(/'/g, "\\'")}')">Show Less</a>`;
    } else {
        const truncated = fullText.substring(0, 200) + '...';
        p.innerHTML = truncated + ` <a href="#" class="text-primary small text-decoration-none ms-1 read-more-btn" onclick="toggleReadMore(event, this, '${fullText.replace(/'/g, "\\'")}')">Read More</a>`;
    }
};

// Make functions available globally
window.showDeleteModal = (id) => {
    commentToDelete = id;
    deleteModal.show();
};

async function deleteComment(id) {
    const btn = document.getElementById('confirmDeleteBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Deleting...';

    try {
        await deleteDoc(doc(db, 'jobComments', id));
        showToast('Comment deleted successfully');
    } catch (error) {
        console.error("Error deleting comment:", error);
        showToast('Error deleting comment', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

function filterComments(searchTerm) {
    const items = document.querySelectorAll('.comment-item');
    let hasVisible = false;
    
    items.forEach(item => {
        if (item.dataset.searchText.includes(searchTerm)) {
            item.style.display = '';
            hasVisible = true;
        } else {
            item.style.display = 'none';
        }
    });

    // Handle no results
    let noResults = document.getElementById('noResultsMsg');
    if (!hasVisible && searchTerm) {
        if (!noResults) {
            noResults = document.createElement('div');
            noResults.id = 'noResultsMsg';
            noResults.className = 'col-12 text-center py-4 text-muted';
            noResults.innerHTML = 'No comments found matching your search.';
            document.getElementById('commentsContainer').appendChild(noResults);
        }
    } else if (noResults) {
        noResults.remove();
    }
}

// Utilities
function getSafeDate(timestamp) {
    if (!timestamp) return null;
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
        return timestamp.toDate();
    }
    return new Date(timestamp);
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y ago";
    
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo ago";
    
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    
    return "Just now";
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function showToast(message, type = 'success') {
    const toastEl = document.getElementById('actionToast');
    const toastBody = document.getElementById('toastMessage');
    
    toastBody.textContent = message;
    if (type === 'error') {
        toastEl.classList.remove('bg-primary');
        toastEl.classList.add('bg-danger');
    } else {
        toastEl.classList.remove('bg-danger');
        toastEl.classList.add('bg-primary');
    }
    
    const toast = new bootstrap.Toast(toastEl);
    toast.show();
}
