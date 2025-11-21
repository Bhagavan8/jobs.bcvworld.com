import { auth, db } from './firebase-config.js';
import { 
    collection, 
    query, 
    orderBy, 
    onSnapshot, 
    doc, 
    updateDoc, 
    deleteDoc,
    where 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Authentication check
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'login.html';
    } else {
        // Make sure Firebase is initialized
        if (db) {
            document.getElementById('userName').textContent = user.email;
            initializeComments();
        } else {
            console.error('Firestore not initialized');
        }
    }
});

function initializeComments() {
    const commentsTableBody = document.getElementById('commentsTableBody');
    const statusFilter = document.getElementById('statusFilter');
    const contentTypeFilter = document.getElementById('contentTypeFilter');
    const searchInput = document.getElementById('searchComments');

    function loadComments(filters = {}) {
        let q = query(collection(db, 'comments'), orderBy('timestamp', 'desc'));
        
        if (filters.status && filters.status !== 'all') {
            q = query(q, where('status', '==', filters.status));
        }
        if (filters.contentType && filters.contentType !== 'all') {
            q = query(q, where('contentType', '==', filters.contentType));
        }

        onSnapshot(q, (snapshot) => {
            commentsTableBody.innerHTML = '';
            if (snapshot.empty) {
                commentsTableBody.innerHTML = '<tr><td colspan="6" class="text-center">No comments found</td></tr>';
                return;
            }

            snapshot.forEach((doc) => {
                const comment = doc.data();
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>
                        <div class="fw-bold">${comment.userName || 'Anonymous'}</div>
                        <div class="small text-muted">${comment.userEmail || 'No email'}</div>
                    </td>
                    <td>
                        <div class="comment-content">${comment.content}</div>
                        ${comment.replyTo ? `<div class="small text-muted">Reply to: ${comment.replyTo}</div>` : ''}
                    </td>
                    <td>
                        <div class="fw-bold">${comment.postTitle || 'N/A'}</div>
                        <div class="small text-muted">${comment.contentType || 'Unknown'}</div>
                    </td>
                    <td>${new Date(comment.timestamp?.toDate()).toLocaleString()}</td>
                    <td>
                        <select class="form-select form-select-sm status-select" data-id="${doc.id}">
                            <option value="approved" ${comment.status === 'approved' ? 'selected' : ''}>Approved</option>
                            <option value="pending" ${comment.status === 'pending' ? 'selected' : ''}>Pending</option>
                            <option value="spam" ${comment.status === 'spam' ? 'selected' : ''}>Spam</option>
                        </select>
                    </td>
                    <td>
                        <button class="btn btn-sm btn-danger delete-btn" data-id="${doc.id}">
                            <i class="bi bi-trash"></i> Delete
                        </button>
                    </td>
                `;

                const statusSelect = row.querySelector('.status-select');
                statusSelect.addEventListener('change', (e) => updateCommentStatus(doc.id, e.target.value));

                const deleteBtn = row.querySelector('.delete-btn');
                deleteBtn.addEventListener('click', () => deleteComment(doc.id));

                commentsTableBody.appendChild(row);
            });
        });
    }

    // Event listeners
    statusFilter.addEventListener('change', () => {
        loadComments({
            status: statusFilter.value,
            contentType: contentTypeFilter.value
        });
    });

    contentTypeFilter.addEventListener('change', () => {
        loadComments({
            status: statusFilter.value,
            contentType: contentTypeFilter.value
        });
    });

    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const rows = commentsTableBody.getElementsByTagName('tr');
        Array.from(rows).forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(searchTerm) ? '' : 'none';
        });
    });

    // Initial load
    loadComments();
}

async function updateCommentStatus(commentId, newStatus) {
    try {
        await updateDoc(doc(db, 'comments', commentId), {
            status: newStatus,
            updatedAt: new Date()
        });
    } catch (error) {
        console.error('Error updating comment status:', error);
        alert('Failed to update comment status');
    }
}

async function deleteComment(commentId) {
    if (confirm('Are you sure you want to delete this comment?')) {
        try {
            await deleteDoc(doc(db, 'comments', commentId));
        } catch (error) {
            console.error('Error deleting comment:', error);
            alert('Failed to delete comment');
        }
    }
}

// Logout handler
const logoutBtn = document.getElementById('logoutBtn');
logoutBtn.addEventListener('click', async () => {
    try {
        await auth.signOut();
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Error during logout:', error);
        alert('Failed to logout. Please try again.');
    }
});