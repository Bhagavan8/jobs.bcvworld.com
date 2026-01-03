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
    deleteDoc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let currentUser = null;
let transactions = [];
let subscriptions = [];
let websiteTransactions = [];
let __trxPage = 1;
let __webTrxPage = 1;
const __trxPageSize = 5; // User requested 5
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
    const trxDate = document.getElementById('trxDate');
    if(trxDate) trxDate.valueAsDate = new Date();
    
    const webTrxDate = document.getElementById('webTrxDate');
    if(webTrxDate) webTrxDate.valueAsDate = new Date();

    // Sidebar Logic
    setupSidebar();
    
    // Toggle Logic
    setupToggle();

    // Form Submit - Transactions
    const trxForm = document.getElementById('transactionForm');
    if(trxForm) trxForm.addEventListener('submit', handleTransactionSubmit);

    // Form Submit - Subscriptions
    const subForm = document.getElementById('subscriptionForm');
    if(subForm) subForm.addEventListener('submit', handleSubscriptionSubmit);

    // Form Submit - Website Transactions
    const webForm = document.getElementById('websiteTransactionForm');
    if(webForm) webForm.addEventListener('submit', handleWebsiteTransactionSubmit);

    // Pagination controls
    const prevBtn = document.getElementById('prevBtn');
    if(prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (__trxPage > 1) {
                __trxPage--;
                renderTransactions();
            }
        });
    }

    const nextBtn = document.getElementById('nextBtn');
    if(nextBtn) {
        nextBtn.addEventListener('click', () => {
            const totalPages = Math.ceil(transactions.length / __trxPageSize);
            if (__trxPage < totalPages) {
                __trxPage++;
                renderTransactions();
            }
        });
    }

    // Website Pagination
    const webPrevBtn = document.getElementById('webPrevBtn');
    if(webPrevBtn) {
        webPrevBtn.addEventListener('click', () => {
            if (__webTrxPage > 1) {
                __webTrxPage--;
                renderWebsiteTransactions();
            }
        });
    }

    const webNextBtn = document.getElementById('webNextBtn');
    if(webNextBtn) {
        webNextBtn.addEventListener('click', () => {
            const totalPages = Math.ceil(websiteTransactions.length / __trxPageSize);
            if (__webTrxPage < totalPages) {
                __webTrxPage++;
                renderWebsiteTransactions();
            }
        });
    }

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

function setupToggle() {
    const track = document.querySelector('.toggle-track');
    if (!track) return;
    
    const options = track.querySelectorAll('.toggle-option');
    const adSpendView = document.getElementById('adSpendView');
    const recurringView = document.getElementById('recurringView');
    const websiteFinanceView = document.getElementById('websiteFinanceView');
    
    options.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            
            // Update buttons
            options.forEach(o => o.classList.remove('active'));
            btn.classList.add('active');
            
            // Reset knob classes
            track.classList.remove('right-active', 'far-right-active');

            // Hide all views
            if(adSpendView) adSpendView.style.display = 'none';
            if(recurringView) recurringView.style.display = 'none';
            if(websiteFinanceView) websiteFinanceView.style.display = 'none';

            // Show selected view
            if (view === 'recurring') {
                track.classList.add('right-active');
                if(recurringView) recurringView.style.display = 'block';
            } else if (view === 'website') {
                track.classList.add('far-right-active'); // Need CSS for this if we want knob movement
                // For now, let's just use simple hiding/showing as knob css might be complex for 3 items
                if(websiteFinanceView) websiteFinanceView.style.display = 'block';
            } else {
                if(adSpendView) adSpendView.style.display = 'block';
            }
        });
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
                <img src="${profileImage}" alt="${firstName}" class="profile-img" onerror="this.onerror=null;this.src='/images/default.webp'">
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
                        <img src="${profileImage}" alt="${firstName}" onerror="this.onerror=null;this.src='/images/default.webp'">
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
                    <li><a class="dropdown-item text-danger" href="#" id="logoutBtn"><i class="bi bi-box-arrow-right me-2"></i>Logout</a></li>
                </ul>
            </div>
        `;
        const logoutBtn = userMenuDropdown.querySelector('#logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    }
}

function initializeFinance() {
    // Transactions
    const q = query(collection(db, 'adTransactions'), orderBy('date', 'desc'), orderBy('timestamp', 'desc'));
    onSnapshot(q, (snapshot) => {
        transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        calculateStats();
        __trxPage = 1;
        renderTransactions();
    }, (error) => console.error("Error fetching transactions:", error));

    // Subscriptions
    const qSub = query(collection(db, 'adSubscriptions'), orderBy('createdAt', 'desc'));
    onSnapshot(qSub, (snapshot) => {
        subscriptions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderSubscriptions();
    }, (error) => console.error("Error fetching subscriptions:", error));

    // Website Transactions
    const qWeb = query(collection(db, 'websiteTransactions'), orderBy('date', 'desc'), orderBy('timestamp', 'desc'));
    onSnapshot(qWeb, (snapshot) => {
        websiteTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        calculateWebsiteStats();
        __webTrxPage = 1;
        renderWebsiteTransactions();
    }, (error) => console.error("Error fetching website transactions:", error));
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
    let totalSpend = 0;

    transactions.forEach(t => {
        const tDate = new Date(t.date);
        const tMonth = tDate.getMonth();
        const tYear = tDate.getFullYear();
        const amount = t.amount || 0;
        
        // Total
        totalSpend += amount;

        // This Month
        if (tMonth === currentMonth && tYear === currentYear) {
            thisMonthTotal += amount;
        }

        // Last Month
        if (tMonth === lastMonth && tYear === lastMonthYear) {
            lastMonthTotal += amount;
        }

        // This Week
        if (tDate >= startOfWeek && tDate <= now) {
            thisWeekTotal += amount;
        }

        // Today
        if (t.date === todayStr) {
            todayTotal += amount;
        }
    });

    document.getElementById('thisMonthSpend').textContent = formatCurrency(thisMonthTotal);
    document.getElementById('totalSpend').textContent = formatCurrency(totalSpend);
    document.getElementById('lastMonthSpend').textContent = formatCurrency(lastMonthTotal);
    
    const diff = thisMonthTotal - lastMonthTotal;
    const diffEl = document.getElementById('monthDiff');
    diffEl.textContent = (diff > 0 ? '+' : '') + formatCurrency(diff);
    diffEl.className = "card-title mb-0 fw-bold"; 

    document.getElementById('thisWeekSpend').textContent = formatCurrency(thisWeekTotal);
    document.getElementById('todaySpend').textContent = formatCurrency(todayTotal);
}

function renderTransactions() {
    const list = document.getElementById('transactionsList');
    if(!list) return;
    list.innerHTML = '';

    if (transactions.length === 0) {
        list.innerHTML = '<div class="text-center py-5 text-muted">No transactions found</div>';
        const pagination = document.getElementById('paginationControls');
        if(pagination) pagination.style.display = 'none';
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
    const pagination = document.getElementById('paginationControls');
    if(pagination) {
        pagination.style.display = totalPages > 1 ? 'flex' : 'none';
        document.getElementById('pageInfo').textContent = `Page ${__trxPage} of ${totalPages}`;
        document.getElementById('prevBtn').disabled = __trxPage === 1;
        document.getElementById('nextBtn').disabled = __trxPage === totalPages;
    }
}

function renderSubscriptions() {
    const list = document.getElementById('subscriptionsList');
    if(!list) return;
    list.innerHTML = '';

    let monthlyTotal = 0;
    let yearlyTotal = 0;

    if (subscriptions.length === 0) {
        list.innerHTML = '<div class="col-12 text-center py-5 text-muted">No active subscriptions</div>';
    } else {
        subscriptions.forEach(sub => {
            const amount = sub.amount || 0;
            const freq = sub.frequency || 'Monthly';
            
            // Calculate recurring totals
            if (freq === 'Monthly') {
                monthlyTotal += amount;
                yearlyTotal += (amount * 12);
            } else if (freq === 'Yearly') {
                yearlyTotal += amount;
                monthlyTotal += (amount / 12);
            }
            
            // Create Card
            const col = document.createElement('div');
            col.className = 'col-12 col-md-6 col-lg-4';
            col.innerHTML = `
                <div class="card subscription-card h-100 p-3">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <h5 class="fw-bold mb-1">${sub.name}</h5>
                            <span class="badge bg-light text-dark border">${freq}</span>
                        </div>
                        <div class="dropdown">
                            <button class="btn btn-link text-muted p-0" data-bs-toggle="dropdown">
                                <i class="bi bi-three-dots-vertical"></i>
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end">
                                <li><a class="dropdown-item text-danger delete-sub" href="#" data-id="${sub.id}">Delete</a></li>
                            </ul>
                        </div>
                    </div>
                    <div class="mt-3">
                        <h3 class="fw-bold text-primary mb-0">${formatCurrency(amount)}</h3>
                        <small class="text-muted">
                            Next due: ${sub.nextDueDate ? new Date(sub.nextDueDate).toLocaleDateString() : 'N/A'}
                        </small>
                    </div>
                </div>
            `;

            // Delete Action
            col.querySelector('.delete-sub').addEventListener('click', (e) => {
                e.preventDefault();
                if(confirm(`Delete subscription "${sub.name}"?`)) {
                    deleteDoc(doc(db, 'adSubscriptions', sub.id));
                }
            });

            list.appendChild(col);
        });
    }

    // Update Totals
    document.getElementById('monthlyRecurringTotal').textContent = formatCurrency(monthlyTotal);
    document.getElementById('yearlyRecurringTotal').textContent = formatCurrency(yearlyTotal);
}

// Handlers
async function handleTransactionSubmit(e) {
    e.preventDefault();
    if (__submitting) return;
    __submitting = true;

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

    try {
        const amount = parseFloat(document.getElementById('trxAmount').value);
        const date = document.getElementById('trxDate').value;
        const description = document.getElementById('trxDescription').value;

        await addDoc(collection(db, 'adTransactions'), {
            amount,
            date,
            description,
            timestamp: serverTimestamp(),
            createdBy: currentUser.uid
        });

        e.target.reset();
        document.getElementById('trxDate').valueAsDate = new Date(); // Reset date to today
        
        // Close modal
        const modalEl = document.getElementById('addTransactionModal');
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        if(modal) modal.hide();

        showToast('Transaction added successfully');
    } catch (error) {
        console.error("Error adding transaction:", error);
        showToast('Error saving transaction', 'error');
    } finally {
        __submitting = false;
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

async function handleSubscriptionSubmit(e) {
    e.preventDefault();
    if (__submitting) return;
    __submitting = true;

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

    try {
        const name = document.getElementById('subName').value;
        const amount = parseFloat(document.getElementById('subAmount').value);
        const frequency = document.getElementById('subFrequency').value;
        const date = document.getElementById('subDate').value;

        await addDoc(collection(db, 'adSubscriptions'), {
            name,
            amount,
            frequency,
            nextDueDate: date || null,
            createdAt: serverTimestamp(),
            createdBy: currentUser.uid
        });

        e.target.reset();
        
        // Close modal
        const modalEl = document.getElementById('addSubscriptionModal');
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        if(modal) modal.hide();

        showToast('Subscription added successfully');
    } catch (error) {
        console.error("Error adding subscription:", error);
        showToast('Error saving subscription', 'error');
    } finally {
        __submitting = false;
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

function calculateWebsiteStats() {
    let totalRevenue = 0;
    let totalExpense = 0;

    websiteTransactions.forEach(t => {
        const amount = parseFloat(t.amount) || 0;
        if (t.type === 'revenue') {
            totalRevenue += amount;
        } else {
            totalExpense += amount;
        }
    });

    const netProfit = totalRevenue - totalExpense;

    document.getElementById('webTotalRevenue').textContent = formatCurrency(totalRevenue);
    document.getElementById('webTotalExpense').textContent = formatCurrency(totalExpense);
    
    const profitEl = document.getElementById('webNetProfit');
    profitEl.textContent = formatCurrency(netProfit);
    profitEl.className = `card-title mb-0 fw-bold ${netProfit >= 0 ? 'text-white' : 'text-warning'}`;
}

function renderWebsiteTransactions() {
    const list = document.getElementById('websiteTransactionsList');
    if(!list) return;
    list.innerHTML = '';

    if (websiteTransactions.length === 0) {
        list.innerHTML = '<div class="text-center py-5 text-muted">No transactions found</div>';
        const pagination = document.getElementById('webPaginationControls');
        if(pagination) pagination.style.display = 'none';
        return;
    }

    const start = (__webTrxPage - 1) * __trxPageSize;
    const end = start + __trxPageSize;
    const pageItems = websiteTransactions.slice(start, end);

    pageItems.forEach(t => {
        const item = document.createElement('div');
        item.className = 'list-group-item list-group-item-action py-3 transaction-item';
        const date = new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        const isRevenue = t.type === 'revenue';
        
        item.style.borderLeftColor = isRevenue ? '#11998e' : '#ef476f';

        item.innerHTML = `
            <div class="d-flex w-100 justify-content-between align-items-center">
                <div>
                    <h6 class="mb-1 fw-bold">${t.description || 'Website Transaction'}</h6>
                    <small class="text-muted">
                        <span class="badge ${isRevenue ? 'bg-success' : 'bg-danger'} me-2">${isRevenue ? 'Revenue' : 'Expense'}</span>
                        <i class="bi bi-calendar3 me-1"></i>${date}
                    </small>
                </div>
                <div class="text-end">
                    <h5 class="mb-0 fw-bold ${isRevenue ? 'text-success' : 'text-danger'}">${isRevenue ? '+' : '-'}${formatCurrency(t.amount)}</h5>
                    <button class="btn btn-sm btn-link text-danger p-0 mt-1 delete-web-btn" data-id="${t.id}">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        `;
        
        // Add delete listener
        item.querySelector('.delete-web-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if(confirm('Delete this transaction?')) {
                deleteDoc(doc(db, 'websiteTransactions', t.id));
            }
        });

        list.appendChild(item);
    });

    // Pagination
    const totalPages = Math.ceil(websiteTransactions.length / __trxPageSize);
    const pagination = document.getElementById('webPaginationControls');
    if(pagination) {
        pagination.style.display = totalPages > 1 ? 'flex' : 'none';
        document.getElementById('webPageInfo').textContent = `Page ${__webTrxPage} of ${totalPages}`;
        document.getElementById('webPrevBtn').disabled = __webTrxPage === 1;
        document.getElementById('webNextBtn').disabled = __webTrxPage === totalPages;
    }
}

async function handleWebsiteTransactionSubmit(e) {
    e.preventDefault();
    if (__submitting) return;
    __submitting = true;

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

    try {
        const type = document.getElementById('webTrxType').value;
        const amount = parseFloat(document.getElementById('webTrxAmount').value);
        const date = document.getElementById('webTrxDate').value;
        const description = document.getElementById('webTrxDescription').value;

        await addDoc(collection(db, 'websiteTransactions'), {
            type,
            amount,
            date,
            description,
            timestamp: serverTimestamp(),
            createdBy: currentUser.uid
        });

        e.target.reset();
        document.getElementById('webTrxDate').valueAsDate = new Date(); // Reset date to today
        
        // Close modal
        const modalEl = document.getElementById('addWebsiteTransactionModal');
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        if(modal) modal.hide();

        showToast('Website transaction added successfully');
    } catch (error) {
        console.error("Error adding website transaction:", error);
        showToast('Error saving transaction', 'error');
    } finally {
        __submitting = false;
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

async function handleLogout(e) {
    e.preventDefault();
    try {
        await auth.signOut();
        window.location.href = 'login.html';
    } catch (error) {
        console.error("Logout error:", error);
    }
}

function showToast(message, type = 'success') {
    const toastEl = document.getElementById('liveToast');
    const toastBody = document.getElementById('toastMessage');
    
    if(toastEl && toastBody) {
        toastBody.textContent = message;
        toastEl.className = `toast align-items-center text-white border-0 ${type === 'error' ? 'bg-danger' : 'bg-success'}`;
        
        const toast = new bootstrap.Toast(toastEl);
        toast.show();
    }
}
