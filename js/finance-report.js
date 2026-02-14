import { auth, db } from './firebase-config.js';
import { collection, onSnapshot, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let transactions = [];
let adTransactions = [];
let investments = [];
let loans = [];
let subscriptions = [];
let websiteTransactions = [];
let creditCards = [];
let creditCardTransactions = [];
let currentUser = null;

const charts = {};

const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount || 0);
};

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
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
    const sidebar = document.querySelector('.sidebar');
    const toggle = document.querySelector('.sidebar-toggle');
    if(sidebar && toggle) {
        toggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });
    }
    const adminEmployerContent = document.getElementById('adminEmployerContent');
    if (adminEmployerContent) adminEmployerContent.style.display = 'block';
}

function initializeData() {
    onSnapshot(collection(db, 'financialRecords'), (snap) => {
        transactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        calculateAndRender();
    });
    onSnapshot(collection(db, 'adTransactions'), (snap) => {
        adTransactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        calculateAndRender();
    });
    onSnapshot(collection(db, 'financialInvestments'), (snap) => {
        investments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        calculateAndRender();
    });
    onSnapshot(collection(db, 'financialLoans'), (snap) => {
        loans = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        calculateAndRender();
    });
    onSnapshot(collection(db, 'adSubscriptions'), (snap) => {
        subscriptions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        calculateAndRender();
    });
    onSnapshot(collection(db, 'websiteTransactions'), (snap) => {
        websiteTransactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        calculateAndRender();
    });
    onSnapshot(collection(db, 'financialCreditCards'), (snap) => {
        creditCards = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        calculateAndRender();
    });
    onSnapshot(collection(db, 'financialCreditCardTransactions'), (snap) => {
        creditCardTransactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        calculateAndRender();
    });
}

function lastNMonthsLabels(n) {
    const labels = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        labels.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    }
    return labels;
}

function monthKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function calculateAndRender() {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0,0,0,0);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const labels = lastNMonthsLabels(12);
    const incomeByMonth = Object.fromEntries(labels.map(l => [l, 0]));
    const spendByMonth = Object.fromEntries(labels.map(l => [l, 0]));
    const balanceByMonth = Object.fromEntries(labels.map(l => [l, 0]));
    let totalIncome = 0;
    let totalSpend = 0;
    let totalAdSpend = 0;
    let totalWebsiteRevenue = 0;
    let totalWebsiteExpenses = 0;
    let totalCreditPurchases = 0;
    let creditOutstanding = 0;
    let investmentsValue = 0;
    let loansOutstanding = 0;

    transactions.forEach(t => {
        const amt = parseFloat(t.amount) || 0;
        const d = new Date(t.date);
        const k = monthKey(d);
        if (t.type === 'income') {
            totalIncome += amt;
            if (k in incomeByMonth) incomeByMonth[k] += amt;
        } else if (t.type === 'expense') {
            totalSpend += amt;
            if (k in spendByMonth) spendByMonth[k] += amt;
        }
    });

    adTransactions.forEach(t => {
        const amt = parseFloat(t.amount) || 0;
        const d = new Date(t.date);
        const k = monthKey(d);
        totalAdSpend += amt;
        totalSpend += amt;
        if (k in spendByMonth) spendByMonth[k] += amt;
    });

    websiteTransactions.forEach(t => {
        const amt = parseFloat(t.amount) || 0;
        const d = new Date(t.date);
        const k = monthKey(d);
        if (t.type === 'revenue') {
            totalWebsiteRevenue += amt;
            totalIncome += amt;
            if (k in incomeByMonth) incomeByMonth[k] += amt;
        } else {
            totalWebsiteExpenses += amt;
            totalSpend += amt;
            if (k in spendByMonth) spendByMonth[k] += amt;
        }
    });

    creditCardTransactions.forEach(t => {
        if (t.type === 'purchase') {
            const amt = parseFloat(t.amount) || 0;
            const d = new Date(t.date);
            const k = monthKey(d);
            totalCreditPurchases += amt;
            totalSpend += amt;
            if (k in spendByMonth) spendByMonth[k] += amt;
        }
    });

    creditCards.forEach(c => {
        const txns = creditCardTransactions.filter(t => t.cardId === c.id);
        const allPurchases = txns.filter(t => t.type === 'purchase').reduce((a,b)=>a+(parseFloat(b.amount)||0),0);
        const allPayments = txns.filter(t => t.type === 'payment').reduce((a,b)=>a+(parseFloat(b.amount)||0),0);
        const spent = (parseFloat(c.spent)||0) + allPurchases;
        const paid = (parseFloat(c.paid)||0) + allPayments;
        creditOutstanding += Math.max(0, spent - paid);
    });

    investments.forEach(i => { investmentsValue += (parseFloat(i.currentValue) || parseFloat(i.investedAmount) || 0); });
    loans.forEach(l => { if (l.status === 'active') loansOutstanding += (parseFloat(l.remainingBalance) || 0); });

    const netBalance = totalIncome - totalSpend;
    labels.forEach(l => { balanceByMonth[l] = Math.max(0, (incomeByMonth[l] || 0) - (spendByMonth[l] || 0)); });

    document.getElementById('rptTotalIncome').textContent = formatCurrency(totalIncome);
    document.getElementById('rptTotalSpend').textContent = formatCurrency(totalSpend);
    document.getElementById('rptNetBalance').textContent = formatCurrency(netBalance);
    document.getElementById('rptCreditOutstanding').textContent = formatCurrency(creditOutstanding);
    document.getElementById('rptLoansOutstanding').textContent = formatCurrency(loansOutstanding);
    document.getElementById('rptInvestmentsValue').textContent = formatCurrency(investmentsValue);

    const incomeData = labels.map(l => incomeByMonth[l] || 0);
    const spendData = labels.map(l => spendByMonth[l] || 0);
    const balanceData = labels.map(l => balanceByMonth[l] || 0);

    renderBar('chartIncomeVsSpend', labels, [
        { label: 'Income', data: incomeData, backgroundColor: 'rgba(25,135,84,.8)' },
        { label: 'Spend', data: spendData, backgroundColor: 'rgba(220,53,69,.8)' }
    ]);

    renderPie('chartSpendBreakdown', [
        totalCreditPurchases, totalAdSpend, totalWebsiteExpenses, Math.max(0, totalSpend - totalCreditPurchases - totalAdSpend - totalWebsiteExpenses)
    ], ['Credit Card', 'Ad Spend', 'Website Expenses', 'Other Expenses']);

    renderLine('chartBalanceTrend', labels, balanceData, 'Net Balance');

    const ccByCardMap = {};
    creditCardTransactions.forEach(t => {
        if (t.type === 'purchase') {
            const amt = parseFloat(t.amount) || 0;
            const name = creditCards.find(c => c.id === t.cardId)?.name || 'Unknown';
            ccByCardMap[name] = (ccByCardMap[name] || 0) + amt;
        }
    });
    const ccLabels = Object.keys(ccByCardMap);
    const ccValues = Object.values(ccByCardMap);
    renderBar('chartCCByCard', ccLabels, [{ label: 'Purchases', data: ccValues, backgroundColor: 'rgba(54,162,235,.8)' }]);

    renderBar('chartWebsite', ['Revenue', 'Expenses'], [{
        label: 'Website',
        data: [totalWebsiteRevenue, totalWebsiteExpenses],
        backgroundColor: ['rgba(25,135,84,.8)', 'rgba(220,53,69,.8)']
    }], { indexAxis: 'y' });

    renderTables();
}

function renderTables() {
    const trxBody = document.getElementById('tblTransactions');
    const ccBody = document.getElementById('tblCC');
    const adsBody = document.getElementById('tblAds');
    const webBody = document.getElementById('tblWebsite');
    if (trxBody) {
        const sorted = transactions.slice().sort((a,b)=> new Date(b.date) - new Date(a.date)).slice(0,100);
        trxBody.innerHTML = sorted.map(t => {
            const amt = formatCurrency(parseFloat(t.amount) || 0);
            const type = t.type || '';
            const cat = t.category || '';
            return `<tr><td>${t.date || ''}</td><td>${type}</td><td>${cat}</td><td class="text-end ${type==='income'?'text-success':'text-danger'}">${amt}</td></tr>`;
        }).join('');
    }
    if (ccBody) {
        const sorted = creditCardTransactions.slice().sort((a,b)=> new Date(b.date) - new Date(a.date)).slice(0,100);
        ccBody.innerHTML = sorted.map(t => {
            const amt = formatCurrency(parseFloat(t.amount) || 0);
            const cardName = creditCards.find(c => c.id === t.cardId)?.name || '';
            const type = t.type || '';
            const desc = t.description || '';
            const cls = type === 'payment' ? 'text-success' : 'text-danger';
            return `<tr><td>${t.date || ''}</td><td>${cardName}</td><td>${type}</td><td>${desc}</td><td class="text-end ${cls}">${amt}</td></tr>`;
        }).join('');
    }
    if (adsBody) {
        const sorted = adTransactions.slice().sort((a,b)=> new Date(b.date) - new Date(a.date)).slice(0,100);
        adsBody.innerHTML = sorted.map(t => {
            const amt = formatCurrency(parseFloat(t.amount) || 0);
            return `<tr><td>${t.date || ''}</td><td>${t.platform || ''}</td><td>${t.description || ''}</td><td class="text-end text-danger">${amt}</td></tr>`;
        }).join('');
    }
    if (webBody) {
        const sorted = websiteTransactions.slice().sort((a,b)=> new Date(b.date) - new Date(a.date)).slice(0,100);
        webBody.innerHTML = sorted.map(t => {
            const amt = formatCurrency(parseFloat(t.amount) || 0);
            const cls = t.type === 'revenue' ? 'text-success' : 'text-danger';
            return `<tr><td>${t.date || ''}</td><td>${t.type || ''}</td><td>${t.description || ''}</td><td class="text-end ${cls}">${amt}</td></tr>`;
        }).join('');
    }
}

function renderBar(id, labels, datasets, extraOpts={}) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } }, ...extraOpts }
    });
}

function renderPie(id, data, labels) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: ['#0d6efd', '#6610f2', '#dc3545', '#20c997']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } } }
    });
}

function renderLine(id, labels, data, label) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label,
                data,
                borderColor: '#198754',
                backgroundColor: 'rgba(25,135,84,.2)',
                tension: .25,
                fill: true
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } }
    });
}
