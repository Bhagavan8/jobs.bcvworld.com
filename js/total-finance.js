import { auth, db } from './firebase-config.js';
import { 
    collection, 
    query, 
    onSnapshot, 
    doc, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// State
let transactions = []; // General Finance
let adTransactions = []; // Ad Spend
let investments = [];
let loans = [];
let subscriptions = [];
let websiteTransactions = [];
let creditCards = [];
let creditCardTransactions = [];
let recurringItems = [];
let currentUser = null;

// Format currency
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR'
    }).format(amount);
};

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
        alert('Access Denied');
        window.location.href = 'dashboard.html';
        return;
    }

    currentUser = user;
    updateUserInterface(userDoc.data(), user);
    initializeData();
});

function updateUserInterface(userData, user) {
    const firstName = (userData.firstName || user.email.split('@')[0]);
    const profileImage = userData.profileImageUrl || user.profileImageUrl || '/images/default.webp';
    
    // Update user menu
    const userMenuDropdown = document.getElementById('userMenuDropdown');
    if (userMenuDropdown) {
        userMenuDropdown.innerHTML = `
            <div class="dropdown">
                <button class="user-dropdown border-0 bg-transparent d-flex align-items-center gap-2" data-bs-toggle="dropdown">
                    <div class="user-avatar" style="width:32px; height:32px; border-radius:50%; overflow:hidden;">
                        <img src="${profileImage}" alt="${firstName}" style="width:100%; height:100%; object-fit:cover;" onerror="this.onerror=null;this.src='/images/default.webp'">
                    </div>
                    <span class="d-none d-md-block fw-medium">${firstName}</span>
                    <i class="bi bi-chevron-down small"></i>
                </button>
                <ul class="dropdown-menu dropdown-menu-end animate slideIn">
                    <li><a class="dropdown-item" href="dashboard.html">Dashboard</a></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><a class="dropdown-item" href="#" onclick="auth.signOut()">Sign Out</a></li>
                </ul>
            </div>
        `;
    }
    
    // Sidebar logic
    const sidebar = document.querySelector('.sidebar');
    const toggle = document.querySelector('.sidebar-toggle');
    if(sidebar && toggle) {
        toggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });
    }

    // Show admin content
    const adminEmployerContent = document.getElementById('adminEmployerContent');
    const adminOnlyContent = document.getElementById('adminOnlyContent');
    const adminOnlyJobs = document.getElementById('adminOnlyJobs');

    if (adminEmployerContent) adminEmployerContent.style.display = 'block';
    if (adminOnlyContent) adminOnlyContent.style.display = 'block';
    if (adminOnlyJobs) adminOnlyJobs.style.display = 'block';
}

function initializeData() {
    // 1. General Financial Records (Income & Expenses)
    onSnapshot(collection(db, 'financialRecords'), (snap) => {
        transactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        calculateAll();
    });

    // 2. Ad Transactions
    onSnapshot(collection(db, 'adTransactions'), (snap) => {
        adTransactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        calculateAll();
    });

    // 3. Investments
    onSnapshot(collection(db, 'financialInvestments'), (snap) => {
        investments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        calculateAll();
    });

    // 4. Loans
    onSnapshot(collection(db, 'financialLoans'), (snap) => {
        loans = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        calculateAll();
    });

    // 5. Subscriptions
    onSnapshot(collection(db, 'adSubscriptions'), (snap) => {
        subscriptions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        calculateAll();
    });

    // 6. Website Transactions
    onSnapshot(collection(db, 'websiteTransactions'), (snap) => {
        websiteTransactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        calculateAll();
    });
    onSnapshot(collection(db, 'financialRecurring'), (snap) => {
        recurringItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        calculateAll();
    });

    // 7. Credit Cards
    onSnapshot(collection(db, 'financialCreditCards'), (snap) => {
        creditCards = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        calculateAll();
    });
    onSnapshot(collection(db, 'financialCreditCardTransactions'), (snap) => {
        creditCardTransactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        calculateAll();
    });
}

function calculateAll() {
    // Dates
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // Start of Week (Sunday)
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0,0,0,0);

    // Last Month
    let lastMonth = currentMonth - 1;
    let lastMonthYear = currentYear;
    if (lastMonth < 0) { lastMonth = 11; lastMonthYear--; }

    // Last Year
    const lastYear = currentYear - 1;

    // --- Aggregators ---
    let totalIncome = 0;
    
    // Expenses (General + Ads)
    let spendAllTime = 0;
    let spendToday = 0;
    let spendWeek = 0;
    let spendMonth = 0;
    let spendLastMonth = 0;
    let spendYear = 0;
    let spendLastYear = 0;

    // Specific Totals
    let totalAdSpend = 0;
    let totalInvValue = 0;
    let totalLoanBalance = 0;
    let totalRecurringMonthly = 0;
    let totalWebsiteRevenue = 0;
    let totalWebsiteExpenses = 0;
    let totalCreditOutstanding = 0;

    // 1. Process General Transactions
    transactions.forEach(t => {
        const amount = parseFloat(t.amount) || 0;
        const date = new Date(t.date);
        const tMonth = date.getMonth();
        const tYear = date.getFullYear();

        if (t.type === 'income') {
            totalIncome += amount;
        } else if (t.type === 'expense') {
            spendAllTime += amount;

            // Today
            if (t.date === todayStr) spendToday += amount;

            // Week
            if (date >= startOfWeek && date <= now) spendWeek += amount;

            // This Month
            if (tMonth === currentMonth && tYear === currentYear) spendMonth += amount;

            // Last Month
            if (tMonth === lastMonth && tYear === lastMonthYear) spendLastMonth += amount;

            // This Year
            if (tYear === currentYear) spendYear += amount;

            // Last Year
            if (tYear === lastYear) spendLastYear += amount;
        }
    });

    // 2. Process Ad Transactions (Treat as Expense)
    adTransactions.forEach(t => {
        const amount = parseFloat(t.amount) || 0;
        const date = new Date(t.date);
        const tMonth = date.getMonth();
        const tYear = date.getFullYear();

        totalAdSpend += amount;
        spendAllTime += amount;

        // Today
        if (t.date === todayStr) spendToday += amount;

        // Week
        if (date >= startOfWeek && date <= now) spendWeek += amount;

        // This Month
        if (tMonth === currentMonth && tYear === currentYear) spendMonth += amount;

        // Last Month
        if (tMonth === lastMonth && tYear === lastMonthYear) spendLastMonth += amount;

        // This Year
        if (tYear === currentYear) spendYear += amount;

        // Last Year
        if (tYear === lastYear) spendLastYear += amount;
    });

    // 3. Investments
    investments.forEach(i => {
        totalInvValue += (parseFloat(i.currentValue) || parseFloat(i.investedAmount) || 0);
    });

    // 4. Loans
    let closedLoansPrincipal = 0;
    let closedLoansCount = 0;
    loans.forEach(l => {
        const remaining = parseFloat(l.remainingBalance) || 0;
        const isClosed = (l.status && l.status.toLowerCase() === 'completed') || remaining <= 0;
        if (l.status === 'active') {
            totalLoanBalance += remaining;
        }
        if (isClosed) {
            closedLoansCount += 1;
            closedLoansPrincipal += (parseFloat(l.totalAmount) || 0);
        }
    });

    // 5. Subscriptions (Calculate Monthly Equivalent)
    subscriptions.forEach(s => {
        const amount = parseFloat(s.amount) || 0;
        if (s.frequency === 'Monthly') {
            totalRecurringMonthly += amount;
        } else if (s.frequency === 'Yearly') {
            totalRecurringMonthly += (amount / 12);
        }
    });

    // 6. Website Transactions
    websiteTransactions.forEach(t => {
        const amount = parseFloat(t.amount) || 0;
        const date = new Date(t.date);
        const tMonth = date.getMonth();
        const tYear = date.getFullYear();

        if (t.type === 'revenue') {
            totalWebsiteRevenue += amount;
            totalIncome += amount;
        } else {
            // Expense
            totalWebsiteExpenses += amount;
            spendAllTime += amount;

            // Update Time-Based Spends for Website Expenses
            // Today
            if (t.date === todayStr) spendToday += amount;

            // Week
            if (date >= startOfWeek && date <= now) spendWeek += amount;

            // This Month
            if (tMonth === currentMonth && tYear === currentYear) spendMonth += amount;

            // Last Month
            if (tMonth === lastMonth && tYear === lastMonthYear) spendLastMonth += amount;

            // This Year
            if (tYear === currentYear) spendYear += amount;

            // Last Year
            if (tYear === lastYear) spendLastYear += amount;
        }
    });

    // 7. Credit Card Purchases (count as spend) and Outstanding
    creditCardTransactions.forEach(t => {
        if (t.type === 'purchase') {
            const amount = parseFloat(t.amount) || 0;
            const date = new Date(t.date);
            const tMonth = date.getMonth();
            const tYear = date.getFullYear();
            spendAllTime += amount;
            if (t.date === todayStr) spendToday += amount;
            if (date >= startOfWeek && date <= now) spendWeek += amount;
            if (tMonth === currentMonth && tYear === currentYear) spendMonth += amount;
            if (tMonth === lastMonth && tYear === lastMonthYear) spendLastMonth += amount;
            if (tYear === currentYear) spendYear += amount;
            if (tYear === lastYear) spendLastYear += amount;
        }
    });
    creditCards.forEach(c => {
        const txns = creditCardTransactions.filter(t => t.cardId === c.id);
        const allPurchases = txns.filter(t => t.type === 'purchase').reduce((a, b) => a + (parseFloat(b.amount) || 0), 0);
        const allPayments = txns.filter(t => t.type === 'payment').reduce((a, b) => a + (parseFloat(b.amount) || 0), 0);
        const spent = (parseFloat(c.spent) || 0) + allPurchases;
        const paid = (parseFloat(c.paid) || 0) + allPayments;
        const used = Math.max(0, spent - paid);
        totalCreditOutstanding += used;
    });

    // Update UI
    // Grand Totals
    document.getElementById('totalAllIncome').textContent = formatCurrency(totalIncome);
    document.getElementById('totalAllSpending').textContent = formatCurrency(spendAllTime);
    document.getElementById('netTotalBalance').textContent = formatCurrency(totalIncome - spendAllTime);

    // Time Based
    document.getElementById('spendToday').textContent = formatCurrency(spendToday);
    document.getElementById('spendWeek').textContent = formatCurrency(spendWeek);
    document.getElementById('spendMonth').textContent = formatCurrency(spendMonth);
    document.getElementById('spendLastMonth').textContent = formatCurrency(spendLastMonth);
    document.getElementById('spendYear').textContent = formatCurrency(spendYear);
    document.getElementById('spendLastYear').textContent = formatCurrency(spendLastYear);

    // Categories
    document.getElementById('totalAdSpend').textContent = formatCurrency(totalAdSpend);
    document.getElementById('totalInvestments').textContent = formatCurrency(totalInvValue);
    document.getElementById('totalLoans').textContent = formatCurrency(totalLoanBalance);
    document.getElementById('totalRecurring').textContent = formatCurrency(totalRecurringMonthly);
    const ccOutEl = document.getElementById('totalCreditOutstanding');
    if (ccOutEl) ccOutEl.textContent = formatCurrency(totalCreditOutstanding);
    const closedPrinEl = document.getElementById('closedLoansPrincipal');
    if (closedPrinEl) closedPrinEl.textContent = formatCurrency(closedLoansPrincipal);
    const closedCntEl = document.getElementById('closedLoansCount');
    if (closedCntEl) closedCntEl.textContent = String(closedLoansCount);

    // Website Finance
    document.getElementById('totalWebsiteRevenue').textContent = formatCurrency(totalWebsiteRevenue);
    document.getElementById('totalWebsiteExpenses').textContent = formatCurrency(totalWebsiteExpenses);
    // Monthly Salary
    let monthlySalaryActual = 0;
    transactions.forEach(t => {
        if (t.type !== 'income') return;
        const desc = (t.description || '').toLowerCase();
        const cat = (t.category || '').toLowerCase();
        const d = new Date(t.date);
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear && (cat === 'salary' || desc.includes('salary'))) {
            monthlySalaryActual += parseFloat(t.amount) || 0;
        }
    });
    let configuredSalary = 0;
    if (recurringItems.length) {
        const activeIncome = recurringItems.filter(r => r.active && r.type === 'income');
        const namedSalary = activeIncome
            .filter(r => (r.name||'').toLowerCase().includes('salary'))
            .reduce((s,r)=> s + (parseFloat(r.amount)||0), 0);
        if (namedSalary > 0) configuredSalary = namedSalary;
        else if (activeIncome.length === 1) configuredSalary = parseFloat(activeIncome[0].amount)||0;
    }
    const monthlySalary = configuredSalary > 0 ? configuredSalary : monthlySalaryActual;
    const salEl = document.getElementById('totalMonthlySalary');
    if (salEl) salEl.textContent = formatCurrency(monthlySalary);
}
