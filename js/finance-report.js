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
let recurringItems = [];
let currentUser = null;

const charts = {};
const rptState = { trxPage: 1, ccPage: 1, adsPage: 1, webPage: 1, pageSize: 10, horizon: '6m' };

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
    onSnapshot(collection(db, 'financialRecurring'), (snap) => {
        recurringItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
    const startOfYear = new Date(today.getFullYear(), 0, 1);
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
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    let monthlySalaryActual = 0;
    transactions.forEach(t => {
        if (t.type !== 'income') return;
        const desc = (t.description || '').toLowerCase();
        const cat = (t.category || '').toLowerCase();
        const d = new Date(t.date);
        if (d >= thisMonth && (cat === 'salary' || desc.includes('salary'))) {
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
    const msEl = document.getElementById('rptMonthlySalary');
    if (msEl) msEl.textContent = formatCurrency(monthlySalary);

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
            let name = creditCards.find(c => c.id === t.cardId)?.name 
                || t.cardName || t.card || t.name || t.cardIssuer || '';
            if (!name) name = (t.cardId || '').trim();
            // Remove likely Firestore ID tokens from concatenated names
            name = name.replace(/\b[a-zA-Z0-9_-]{18,}\b/g, '').trim().replace(/\s{2,}/g,' ');
            if (!name) name = 'Unassigned';
            ccByCardMap[name] = (ccByCardMap[name] || 0) + amt;
        }
    });
    const ccLabels = Object.keys(ccByCardMap);
    const ccValues = Object.values(ccByCardMap);
    renderBar('chartCCByCard', ccLabels, [{ label: 'Purchases', data: ccValues, backgroundColor: 'rgba(54,162,235,.8)' }]);
    const ccNotice = document.getElementById('ccNotice');
    if (ccNotice) {
        const hasUnassigned = ccLabels.some(l => l.toLowerCase().includes('unassigned'));
        ccNotice.classList.toggle('d-none', !hasUnassigned);
    }

    renderBar('chartWebsite', ['Revenue', 'Expenses'], [{
        label: 'Website',
        data: [totalWebsiteRevenue, totalWebsiteExpenses],
        backgroundColor: ['rgba(25,135,84,.8)', 'rgba(220,53,69,.8)']
    }], { indexAxis: 'y' });

    renderTables();
    renderTopCategoriesAndInsights();
    renderLoanPlan();
    renderClosedLoans();

    // Time range spends
    let weekSpend = 0, monthSpend = 0, yearSpend = 0;
    const sixMonthsKeys = lastNMonthsLabels(6);
    let sixMonthsSpend = 0;

    function addIfRanges(d, amount) {
        if (d >= startOfWeek) weekSpend += amount;
        if (d >= startOfMonth) monthSpend += amount;
        if (d >= startOfYear) yearSpend += amount;
        const k = monthKey(d);
        if (sixMonthsKeys.includes(k)) sixMonthsSpend += amount;
    }

    transactions.forEach(t => {
        if (t.type === 'expense') {
            const amt = parseFloat(t.amount) || 0;
            addIfRanges(new Date(t.date), amt);
        }
    });
    adTransactions.forEach(t => addIfRanges(new Date(t.date), parseFloat(t.amount) || 0));
    websiteTransactions.forEach(t => {
        const amt = parseFloat(t.amount) || 0;
        if (t.type !== 'revenue') addIfRanges(new Date(t.date), amt);
    });
    creditCardTransactions.forEach(t => {
        if (t.type === 'purchase') addIfRanges(new Date(t.date), parseFloat(t.amount) || 0);
    });

    const wEl = document.getElementById('rptWeekSpend');
    const mEl = document.getElementById('rptMonthSpend');
    const yEl = document.getElementById('rptYearSpend');
    const sEl = document.getElementById('rptSixMonthsSpend');
    if (wEl) wEl.textContent = formatCurrency(weekSpend);
    if (mEl) mEl.textContent = formatCurrency(monthSpend);
    if (yEl) yEl.textContent = formatCurrency(yearSpend);
    if (sEl) sEl.textContent = formatCurrency(sixMonthsSpend);
}

function renderTables() {
    const trxBody = document.getElementById('tblTransactions');
    const ccBody = document.getElementById('tblCC');
    const adsBody = document.getElementById('tblAds');
    const webBody = document.getElementById('tblWebsite');
    if (trxBody) {
        const sorted = transactions.slice().sort((a,b)=> new Date(b.date) - new Date(a.date));
        const totalPages = Math.max(1, Math.ceil(sorted.length / rptState.pageSize));
        rptState.trxPage = Math.min(rptState.trxPage, totalPages);
        const start = (rptState.trxPage - 1) * rptState.pageSize;
        const pageSlice = sorted.slice(start, start + rptState.pageSize);
        trxBody.innerHTML = pageSlice.map(t => {
            const amt = formatCurrency(parseFloat(t.amount) || 0);
            const type = t.type || '';
            const cat = t.category || '';
            return `<tr><td>${t.date || ''}</td><td>${type}</td><td>${cat}</td><td class="text-end ${type==='income'?'text-success':'text-danger'}">${amt}</td></tr>`;
        }).join('');
        const info = document.getElementById('trxPageInfo');
        if (info) info.textContent = `Page ${rptState.trxPage} of ${totalPages}`;
        document.getElementById('trxPrevBtn')?.addEventListener('click', ()=> { if (rptState.trxPage > 1) { rptState.trxPage--; renderTables(); }});
        document.getElementById('trxNextBtn')?.addEventListener('click', ()=> { if (rptState.trxPage < totalPages) { rptState.trxPage++; renderTables(); }});
    }
    if (ccBody) {
        const sorted = creditCardTransactions.slice().sort((a,b)=> new Date(b.date) - new Date(a.date));
        const totalPages = Math.max(1, Math.ceil(sorted.length / rptState.pageSize));
        rptState.ccPage = Math.min(rptState.ccPage, totalPages);
        const start = (rptState.ccPage - 1) * rptState.pageSize;
        const pageSlice = sorted.slice(start, start + rptState.pageSize);
        ccBody.innerHTML = pageSlice.map(t => {
            const amt = formatCurrency(parseFloat(t.amount) || 0);
            let cardName = creditCards.find(c => c.id === t.cardId)?.name 
                || t.cardName || t.card || t.name || t.cardIssuer || (t.cardId || 'Unassigned');
            cardName = (cardName || '').replace(/\b[a-zA-Z0-9_-]{18,}\b/g, '').trim() || 'Unassigned';
            const type = t.type || '';
            const desc = t.description || '';
            const cls = type === 'payment' ? 'text-success' : 'text-danger';
            return `<tr><td>${t.date || ''}</td><td>${cardName}</td><td>${type}</td><td>${desc}</td><td class="text-end ${cls}">${amt}</td></tr>`;
        }).join('');
        const info = document.getElementById('ccPageInfo');
        if (info) info.textContent = `Page ${rptState.ccPage} of ${totalPages}`;
        document.getElementById('ccPrevBtn')?.addEventListener('click', ()=> { if (rptState.ccPage > 1) { rptState.ccPage--; renderTables(); }});
        document.getElementById('ccNextBtn')?.addEventListener('click', ()=> { if (rptState.ccPage < totalPages) { rptState.ccPage++; renderTables(); }});
    }
    if (adsBody) {
        const sorted = adTransactions.slice().sort((a,b)=> new Date(b.date) - new Date(a.date));
        const totalPages = Math.max(1, Math.ceil(sorted.length / rptState.pageSize));
        rptState.adsPage = Math.min(rptState.adsPage, totalPages);
        const start = (rptState.adsPage - 1) * rptState.pageSize;
        const pageSlice = sorted.slice(start, start + rptState.pageSize);
        adsBody.innerHTML = pageSlice.map(t => {
            const amt = formatCurrency(parseFloat(t.amount) || 0);
            return `<tr><td>${t.date || ''}</td><td>${t.platform || ''}</td><td>${t.description || ''}</td><td class="text-end text-danger">${amt}</td></tr>`;
        }).join('');
        const info = document.getElementById('adsPageInfo');
        if (info) info.textContent = `Page ${rptState.adsPage} of ${totalPages}`;
        document.getElementById('adsPrevBtn')?.addEventListener('click', ()=> { if (rptState.adsPage > 1) { rptState.adsPage--; renderTables(); }});
        document.getElementById('adsNextBtn')?.addEventListener('click', ()=> { if (rptState.adsPage < totalPages) { rptState.adsPage++; renderTables(); }});
    }
    if (webBody) {
        const sorted = websiteTransactions.slice().sort((a,b)=> new Date(b.date) - new Date(a.date));
        const totalPages = Math.max(1, Math.ceil(sorted.length / rptState.pageSize));
        rptState.webPage = Math.min(rptState.webPage, totalPages);
        const start = (rptState.webPage - 1) * rptState.pageSize;
        const pageSlice = sorted.slice(start, start + rptState.pageSize);
        webBody.innerHTML = pageSlice.map(t => {
            const amt = formatCurrency(parseFloat(t.amount) || 0);
            const cls = t.type === 'revenue' ? 'text-success' : 'text-danger';
            return `<tr><td>${t.date || ''}</td><td>${t.type || ''}</td><td>${t.description || ''}</td><td class="text-end ${cls}">${amt}</td></tr>`;
        }).join('');
        const info = document.getElementById('webPageInfo');
        if (info) info.textContent = `Page ${rptState.webPage} of ${totalPages}`;
        document.getElementById('webPrevBtn')?.addEventListener('click', ()=> { if (rptState.webPage > 1) { rptState.webPage--; renderTables(); }});
        document.getElementById('webNextBtn')?.addEventListener('click', ()=> { if (rptState.webPage < totalPages) { rptState.webPage++; renderTables(); }});
    }
}

function renderBar(id, labels, datasets, extraOpts={}) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'top' } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } }, ...extraOpts }
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
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'top' } } }
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
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } }
    });
}

function renderTopCategoriesAndInsights() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - 90);
    const catTotals = {};
    const addAmt = (k, v) => { if (!k) return; catTotals[k] = (catTotals[k] || 0) + v; };
    transactions.forEach(t => {
        if (t.type === 'expense') {
            const d = new Date(t.date);
            if (d >= start) addAmt((t.category || 'other').toLowerCase(), parseFloat(t.amount) || 0);
        }
    });
    const keywordMap = [
        { keys: ['milk','grocery','food','restaurant','swiggy','zomato'], cat: 'food' },
        { keys: ['amazon','flipkart','myntra','shopping','purchase','mall'], cat: 'shopping' },
        { keys: ['electric','power','water','gas','utility','utilities','recharge'], cat: 'utilities' },
        { keys: ['fuel','uber','ola','travel','hotel','flight','train','metro','bus'], cat: 'travel' },
        { keys: ['doctor','medical','medicine','hospital','pharmacy'], cat: 'health' },
        { keys: ['netflix','prime','spotify','subscription','hostinger','domain','server'], cat: 'subscriptions' }
    ];
    creditCardTransactions.forEach(t => {
        if (t.type !== 'purchase') return;
        const d = new Date(t.date);
        if (d < start) return;
        const desc = (t.description || '').toLowerCase();
        let cat = '';
        for (const m of keywordMap) {
            if (m.keys.some(k => desc.includes(k))) { cat = m.cat; break; }
        }
        addAmt(cat || 'other', parseFloat(t.amount) || 0);
    });
    // Top 6 categories
    const entries = Object.entries(catTotals).sort((a,b)=> b[1]-a[1]).slice(0,6);
    const labels = entries.map(e => e[0].replace(/\b\w/g, c=>c.toUpperCase()));
    const data = entries.map(e => e[1]);
    renderPie('chartTopCategories', data, labels);
    // AI-style insights (rule-based)
    const monthlyAvgIncome = averageMonthlyAmount(transactions.filter(t => t.type==='income'));
    const monthlyAvgExpense = averageMonthlyAmount(transactions.filter(t => t.type==='expense')) 
        + averageMonthlyAmount(creditCardTransactions.filter(t => t.type==='purchase'), true);
    const surplus = monthlyAvgIncome - monthlyAvgExpense;
    const top2 = entries.slice(0,2);
    const suggestions = [];
    if (top2[0]) suggestions.push(`Reduce ${title(top2[0][0])} by 15% → save ~${formatCurrency(top2[0][1]*0.15/3)} per month (last 90 days avg).`);
    if (top2[1]) suggestions.push(`Cut ${title(top2[1][0])} by 10% → save ~${formatCurrency(top2[1][1]*0.10/3)} per month.`);
    suggestions.push(`Review subscriptions quarterly; target 10% reduction → ~${formatCurrency((catTotals['subscriptions']||0)*0.1/3)} per month.`);
    suggestions.push(`Allocate surplus to SIP: ${formatCurrency(Math.max(0, surplus*0.6))}/mo equity, ${formatCurrency(Math.max(0, surplus*0.4))}/mo debt.`);
    const horizons = [
        { id:'6m', months:6, equityRate:0.10, debtRate:0.06 },
        { id:'10y', months:120, equityRate:0.10, debtRate:0.06 },
        { id:'15y', months:180, equityRate:0.10, debtRate:0.06 },
        { id:'20y', months:240, equityRate:0.10, debtRate:0.06 }
    ];
    const sipEquity = Math.max(0, surplus*0.6);
    const sipDebt = Math.max(0, surplus*0.4);
    const hSel = horizons.find(h => h.id === rptState.horizon) || horizons[0];
    const eqFutureSel = sipFutureValue(sipEquity, hSel.months, hSel.equityRate/12);
    const debtFutureSel = sipFutureValue(sipDebt, hSel.months, hSel.debtRate/12);
    const totalFutureSel = eqFutureSel + debtFutureSel;
    const insightsEl = document.getElementById('aiInsights');
    if (insightsEl) {
        insightsEl.innerHTML = `
            <ul class="mb-2">${suggestions.map(s=>`<li>${s}</li>`).join('')}</ul>
            <div class="small">
              <div><strong>Selected horizon:</strong> ${labelH(hSel.id)}</div>
              <div>Monthly surplus estimate: ${formatCurrency(surplus)}</div>
              <div>Projected corpus → Equity: ${formatCurrency(eqFutureSel)}, Debt: ${formatCurrency(debtFutureSel)}, Total: ${formatCurrency(totalFutureSel)}</div>
            </div>
        `;
        const container = insightsEl.parentElement.parentElement;
        const btns = container.querySelectorAll('[data-horizon]');
        btns.forEach(btn=>{
            btn.classList.toggle('active', btn.dataset.horizon === rptState.horizon);
            btn.addEventListener('click', ()=> {
                rptState.horizon = btn.dataset.horizon;
                renderTopCategoriesAndInsights();
                renderLoanPlan();
            }, { once: true });
        });
    }
}

function averageMonthlyAmount(list, isCC=false) {
    if (!list.length) return 0;
    const byMonth = {};
    list.forEach(t => {
        const d = new Date(t.date);
        const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        const amt = parseFloat(t.amount) || 0;
        byMonth[k] = (byMonth[k] || 0) + amt;
    });
    const vals = Object.values(byMonth);
    if (!vals.length) return 0;
    const sum = vals.reduce((a,b)=>a+b,0);
    return sum / vals.length;
}

function sipFutureValue(sip, nMonths, monthlyRate) {
    if (sip <= 0) return 0;
    if (monthlyRate <= 0) return sip * nMonths;
    return sip * ((Math.pow(1+monthlyRate, nMonths) - 1) / monthlyRate) * (1 + monthlyRate);
}

function title(s) { return (s||'').replace(/\b\w/g, c=>c.toUpperCase()); }
function labelH(id) { return id==='6m'?'6 Months':(id==='10y'?'10 Years':(id==='15y'?'15 Years':'20 Years')); }

function renderLoanPlan() {
    const tbody = document.getElementById('tblLoansPlan');
    if (!tbody) return;
    const activeLoans = loans.filter(l => (l.status||'active').toLowerCase()==='active');
    const rows = [];
    let earliestDate = null;
    let latestDate = null;
    let freedEmi = 0;
    const loanSummaries = [];
    activeLoans.forEach(l => {
        const name = l.name || l.loanName || 'Loan';
        const remaining = parseFloat(l.remainingBalance || l.balance || l.outstanding || 0) || 0;
        // Prefer structured EMI field used by finance-tracking
        let emi = parseFloat(l.emiAmount || l.emi || l.monthlyPayment || l.monthlyEmi || 0) || 0;
        // Per-loan fallback: average of expense records tagged with this loan
        if (!emi) {
            emi = averageMonthlyAmountForLoan(l.id, name);
        }
        const rate = parseFloat(l.interestRate || l.annualInterestRate || l.rate || 0) || 0;
        const r = rate > 0 ? rate/12/100 : 0;
        let months;
        if (emi > 0 && r > 0 && (emi > r * remaining)) {
            months = Math.ceil(-Math.log(1 - r * remaining / emi) / Math.log(1 + r));
        } else if (emi > 0) {
            months = Math.ceil(remaining / emi);
        } else {
            months = 0;
        }
        const payoff = addMonths(new Date(), Math.max(0, months));
        if (!earliestDate || payoff < earliestDate) earliestDate = payoff;
        if (!latestDate || payoff > latestDate) latestDate = payoff;
        freedEmi += emi;
        loanSummaries.push({ name, remaining, emi, rate, months, payoff });
        rows.push(`<tr>
            <td>${name}</td>
            <td class="text-end">${formatCurrency(remaining)}</td>
            <td class="text-end">${formatCurrency(emi)}</td>
            <td class="text-end">${rate ? rate.toFixed(2)+'%' : '—'}</td>
            <td>${months ? payoff.toISOString().slice(0,10) : '—'}</td>
        </tr>`);
    });
    tbody.innerHTML = rows.join('') || `<tr><td colspan="5" class="text-muted">No active loans found.</td></tr>`;
    const fmtDate = d => d ? d.toISOString().slice(0,10) : '—';
    const elEarliest = document.getElementById('loanEarliest');
    const elLatest = document.getElementById('loanLatest');
    const elFreed = document.getElementById('loanFreedEmi');
    if (elEarliest) elEarliest.textContent = fmtDate(earliestDate);
    if (elLatest) elLatest.textContent = fmtDate(latestDate);
    if (elFreed) elFreed.textContent = formatCurrency(freedEmi);

    const horizonMonths = rptState.horizon==='6m'?6:(rptState.horizon==='10y'?120:(rptState.horizon==='15y'?180:240));
    const equityRate = 0.10/12, debtRate = 0.06/12;
    const equityPart = Math.max(0, freedEmi * 0.6);
    const debtPart = Math.max(0, freedEmi * 0.4);
    let latestMonthsDelay = 0;
    if (latestDate) {
        latestMonthsDelay = Math.max(0, (latestDate.getFullYear()-new Date().getFullYear())*12 + (latestDate.getMonth()-new Date().getMonth()));
    }
    const investAllFV = sipFutureValueWithDelay(equityPart, horizonMonths, equityRate, latestMonthsDelay)
        + sipFutureValueWithDelay(debtPart, horizonMonths, debtRate, latestMonthsDelay);
    const elInvestAll = document.getElementById('loanInvestAll');
    const elInvestAllDetail = document.getElementById('loanInvestAllDetail');
    if (elInvestAll) elInvestAll.textContent = formatCurrency(investAllFV);
    if (elInvestAllDetail) elInvestAllDetail.textContent = `Start after ${fmtDate(latestDate)} with ${formatCurrency(freedEmi)}/mo for ${Math.max(0, horizonMonths-latestMonthsDelay)} months.`;

    // Staggered plan: each loan's EMI starts after its payoff
    let staggeredFV = 0;
    const parts = [];
    loanSummaries.forEach(s => {
        const delay = s.months;
        if (delay <= 0 || s.emi <= 0) return;
        const eqFV = sipFutureValueWithDelay(s.emi*0.6, horizonMonths, equityRate, delay);
        const dbFV = sipFutureValueWithDelay(s.emi*0.4, horizonMonths, debtRate, delay);
        staggeredFV += eqFV + dbFV;
        parts.push(`${s.name}: start ${s.months}m, EMI ${formatCurrency(s.emi)} → ${formatCurrency(eqFV+dbFV)}`);
    });
    const elInvestStag = document.getElementById('loanInvestStaggered');
    const elInvestStagDetail = document.getElementById('loanInvestStaggeredDetail');
    if (elInvestStag) elInvestStag.textContent = formatCurrency(staggeredFV);
    if (elInvestStagDetail) elInvestStagDetail.innerHTML = parts.length ? parts.join('<br/>') : 'No EMIs found to stagger.';
}

function renderClosedLoans() {
    const tbody = document.getElementById('tblClosedLoans');
    if (!tbody) return;
    const closed = loans.filter(l => ((l.status||'').toLowerCase()==='completed') || (parseFloat(l.remainingBalance||0) <= 0));
    const rows = [];
    closed.forEach(l => {
        const name = l.name || l.loanName || 'Loan';
        const principalPaid = l.totalPrincipalPaid !== undefined ? (parseFloat(l.totalPrincipalPaid)||0) : (parseFloat(l.totalAmount)||0);
        const interestPaid = parseFloat(l.totalInterestPaid||0) || 0;
        const closedOn = l.closedDate ? new Date(l.closedDate).toISOString().slice(0,10) : (l.lastEmiPaidMonth ? l.lastEmiPaidMonth : '—');
        rows.push(`<tr>
            <td>${name}</td>
            <td class="text-end">${formatCurrency(principalPaid)}</td>
            <td class="text-end">${formatCurrency(interestPaid)}</td>
            <td>${closedOn}</td>
        </tr>`);
    });
    tbody.innerHTML = rows.join('') || `<tr><td colspan="4" class="text-muted">No closed loans yet.</td></tr>`;
}
function averageMonthlyAmountForLoan(loanId, loanName) {
    const byMonth = {};
    transactions.forEach(t => {
        if (t.type !== 'expense') return;
        const cat = (t.category || '').toLowerCase();
        if (!cat.includes('loan')) return;
        const matchLoan = (t.loanId && loanId && t.loanId === loanId) ||
            (loanName && (t.description || '').toLowerCase().includes(loanName.toLowerCase()));
        if (!matchLoan) return;
        const d = new Date(t.date);
        const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        const amt = parseFloat(t.amount) || 0;
        byMonth[k] = (byMonth[k] || 0) + amt;
    });
    const vals = Object.values(byMonth);
    if (!vals.length) return 0;
    const sum = vals.reduce((a,b)=>a+b,0);
    return sum / vals.length;
}

function sipFutureValueWithDelay(sip, nMonths, monthlyRate, delayMonths) {
    if (sip <= 0) return 0;
    const monthsActive = Math.max(0, nMonths - (delayMonths||0));
    if (monthsActive === 0) return 0;
    // money grows for monthsActive; contributions start after delay
    if (monthlyRate <= 0) return sip * monthsActive;
    return sip * ((Math.pow(1+monthlyRate, monthsActive) - 1) / monthlyRate) * (1 + monthlyRate);
}

function addMonths(date, n) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + n);
    return d;
}
