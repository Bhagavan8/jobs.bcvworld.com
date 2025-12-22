import { auth, db } from './firebase-config.js';
import { 
    collection, 
    addDoc, 
    query, 
    orderBy, 
    onSnapshot, 
    doc, 
    getDoc,
    serverTimestamp,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let currentUser = null;
let transactions = [];
let __trxPage = 1;
const __trxPageSize = 10;
let __submitting = false;

// Format currency
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR'
    }).format(amount);
};

document.addEventListener('DOMContentLoaded', () => {
    // Set default date to today
    document.getElementById('trxDate').valueAsDate = new Date();

    // Sidebar Logic
    setupSidebar();

    // Form Submit
    document.getElementById('transactionForm').addEventListener('submit', handleTransactionSubmit);

    // Pagination controls
    document.getElementById('prevBtn').addEventListener('click', () => {
        if (__trxPage > 1) {
            __trxPage--;
            renderTransactions();
        }
    });

    document.getElementById('nextBtn').addEventListener('click', () => {
        const totalPages = Math.ceil(transactions.length / __trxPageSize);
        if (__trxPage < totalPages) {
            __trxPage++;
            renderTransactions();
        }
    });

    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
});

// Auth Check
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    // Admin Check
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const role = userDoc.exists() ? userDoc.data().role : null;

    if (!role || (role !== 'admin' && role !== 'Admin')) {
        alert('Access Denied. Admin privileges required.');
        window.location.href = 'dashboard.html';
        return;
    }

    currentUser = user;
    updateUserInterface(userDoc.data(), user);
    initializeFinance();
});

function setupSidebar() {
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

    overlay.addEventListener('click', () => {
        if (sidebar.classList.contains('active')) toggleSidebar();
    });
}

function updateUserInterface(userData, user) {
    const firstName = (userData.firstName || user.email.split('@')[0]);
    const profileImage = userData.profileImageUrl || user.profileImageUrl || '/images/default.webp';
    
    // Update sidebar profile
    const sidebarFooter = document.querySelector('.sidebar-footer');
    if (sidebarFooter) {
        sidebarFooter.innerHTML = `
            <div class="user-profile">
                <img src="${profileImage}" alt="${firstName}" class="profile-img">
                <div class="profile-info">
                    <h6 class="profile-name">${firstName}</h6>
                    <span class="profile-role">Admin</span>
                </div>
            </div>
        `;
    }

    // Show admin content
    const adminEmployerContent = document.getElementById('adminEmployerContent');
    const adminOnlyContent = document.getElementById('adminOnlyContent');
    const adminOnlyJobs = document.getElementById('adminOnlyJobs');

    if (adminEmployerContent) adminEmployerContent.style.display = 'block';
    if (adminOnlyContent) adminOnlyContent.style.display = 'block';
    if (adminOnlyJobs) adminOnlyJobs.style.display = 'block';

    // Update top navigation user menu
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
                    <li><a class="dropdown-item" href="profile-upload.html">
                        <i class="bi bi-person-circle me-2"></i>My Profile
                    </a></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><a class="dropdown-item" href="#" id="logoutBtn">
                        <i class="bi bi-box-arrow-right me-2"></i>Sign Out
                    </a></li>
                </ul>
            </div>
        `;
        const logoutBtn = userMenuDropdown.querySelector('#logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    }
}

function initializeFinance() {
    const q = query(collection(db, 'adTransactions'), orderBy('date', 'desc'), orderBy('timestamp', 'desc'));
    onSnapshot(q, (snapshot) => {
        transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        calculateStats();
        __trxPage = 1;
        renderTransactions();
    }, (error) => console.error("Error fetching transactions:", error));
}

function calculateStats() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const todayStr = now.toISOString().split('T')[0];
    
    // Get start of this week (Sunday)
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    // Last Month
    let lastMonth = currentMonth - 1;
    let lastMonthYear = currentYear;
    if (lastMonth < 0) {
        lastMonth = 11;
        lastMonthYear--;
    }

    let thisMonthTotal = 0;
    let lastMonthTotal = 0;
    let thisWeekTotal = 0;
    let todayTotal = 0;

    transactions.forEach(t => {
        const tDate = new Date(t.date);
        const tMonth = tDate.getMonth();
        const tYear = tDate.getFullYear();
        
        // This Month
        if (tMonth === currentMonth && tYear === currentYear) {
            thisMonthTotal += t.amount;
        }

        // Last Month
        if (tMonth === lastMonth && tYear === lastMonthYear) {
            lastMonthTotal += t.amount;
        }

        // This Week
        if (tDate >= startOfWeek && tDate <= now) {
            thisWeekTotal += t.amount;
        }

        // Today
        if (t.date === todayStr) {
            todayTotal += t.amount;
        }
    });

    document.getElementById('thisMonthSpend').textContent = formatCurrency(thisMonthTotal);
    document.getElementById('lastMonthSpend').textContent = formatCurrency(lastMonthTotal);
    
    const diff = thisMonthTotal - lastMonthTotal;
    const diffEl = document.getElementById('monthDiff');
    diffEl.textContent = (diff > 0 ? '+' : '') + formatCurrency(diff);
    diffEl.className = `card-title mb-0 fw-bold ${diff > 0 ? 'text-danger' : 'text-success'}`; // More spend = bad? Or just neutral. Let's keep it neutral or use color for direction.
    // Actually for spend, more is usually "bad" (more expense), less is "good". But let's just use standard colors or text.
    // Let's stick to white text as the card background handles color, but wait, the diff card has a specific background.
    // The diff card text is white, so text-danger/success might not show well if background is dark.
    // The CSS for .diff-card sets color: white. So I should probably not change text color class unless I change background.
    // Let's just set text.
    diffEl.className = "card-title mb-0 fw-bold"; // Reset classes

    document.getElementById('thisWeekSpend').textContent = formatCurrency(thisWeekTotal);
    document.getElementById('todaySpend').textContent = formatCurrency(todayTotal);
}

function renderTransactions() {
    const list = document.getElementById('transactionsList');
    list.innerHTML = '';

    if (transactions.length === 0) {
        list.innerHTML = '<div class="text-center py-5 text-muted">No transactions found</div>';
        document.getElementById('paginationControls').style.display = 'none';
        return;
    }

    const start = (__trxPage - 1) * __trxPageSize;
    const end = start + __trxPageSize;
    const pageItems = transactions.slice(start, end);

    pageItems.forEach(t => {
        const item = document.createElement('div');
        item.className = 'list-group-item list-group-item-action py-3 transaction-item';
        const date = new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        
        item.innerHTML = `
            <div class="d-flex w-100 justify-content-between align-items-center">
                <div>
                    <h6 class="mb-1 fw-bold">${t.description || 'Ad Spend'}</h6>
                    <small class="text-muted"><i class="bi bi-calendar3 me-1"></i>${date}</small>
                </div>
                <div class="text-end">
                    <h5 class="mb-0 fw-bold text-primary">${formatCurrency(t.amount)}</h5>
                    <button class="btn btn-sm btn-link text-danger p-0 mt-1 delete-btn" data-id="${t.id}">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        `;
        
        // Add delete listener
        item.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if(confirm('Delete this transaction?')) {
                deleteDoc(doc(db, 'adTransactions', t.id));
            }
        });

        list.appendChild(item);
    });

    // Pagination
    const totalPages = Math.ceil(transactions.length / __trxPageSize);
    document.getElementById('paginationControls').style.display = totalPages > 1 ? 'flex' : 'none';
    document.getElementById('pageInfo').textContent = `Page ${__trxPage} of ${totalPages}`;
    document.getElementById('prevBtn').disabled = __trxPage === 1;
    document.getElementById('nextBtn').disabled = __trxPage === totalPages;
}

async function handleTransactionSubmit(e) {
    e.preventDefault();
    if (__submitting) return;
    __submitting = true;
    
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

    const data = {
        amount: parseFloat(document.getElementById('trxAmount').value),
        date: document.getElementById('trxDate').value,
        description: document.getElementById('trxDescription').value,
        timestamp: serverTimestamp(),
        createdBy: currentUser.uid
    };

    try {
        await addDoc(collection(db, 'adTransactions'), data);
        
        // Reset form and close modal
        e.target.reset();
        document.getElementById('trxDate').valueAsDate = new Date();
        
        const modalEl = document.getElementById('addTransactionModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
        
        showToast('Transaction added successfully');
    } catch (error) {
        console.error("Error adding transaction:", error);
        showToast('Error saving transaction', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
        __submitting = false;
    }
}

async function handleLogout(e) {
    e.preventDefault();
    try {
        await auth.signOut();
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Logout error:', error);
    }
}
