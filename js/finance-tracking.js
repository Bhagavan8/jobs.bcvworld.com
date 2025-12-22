import { auth, db } from './firebase-config.js';
import { 
    collection, 
    addDoc, 
    setDoc,
    query, 
    orderBy, 
    onSnapshot, 
    doc, 
    deleteDoc,
    getDoc,
    getDocs,
    updateDoc,
    serverTimestamp,
    where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let currentUser = null;
let transactions = [];
let loans = [];
let investments = [];
let recurringItems = [];
let creditCards = [];
let creditCardTransactions = [];
let expenseChart = null;
let __financeEventBound = false;
let __financeSnapshotsBound = false;
let __submitting = { transaction: false, loan: false, investment: false, recurring: false };
let __processingRecurring = false;
let __processingLoanEmi = false;
let __processingSip = false;
let __trxPage = 1;
const __trxPageSize = 5;
let __trxCurrentList = [];
let __ccPage = 1;
const __ccPageSize = 5;
let __ccCurrentList = [];

async function addUniqueRecord(uniqueKey, data) {
    try {
        await setDoc(doc(collection(db, 'financialRecords'), uniqueKey), data);
        return true;
    } catch (e) {
        console.error('Unique record write failed', e);
        return false;
    }
}

async function cleanupDuplicateRecords(matchField, matchValue, period, keepId) {
    try {
        const q = query(
            collection(db, 'financialRecords'),
            where(matchField, '==', matchValue),
            where('period', '==', period)
        );
        const snap = await getDocs(q);
        const deletions = [];
        snap.forEach(d => {
            if (d.id !== keepId) {
                deletions.push(deleteDoc(doc(db, 'financialRecords', d.id)));
            }
        });
        if (deletions.length) await Promise.all(deletions);
    } catch (e) {
        console.error('Cleanup duplicates failed', e);
    }
}
// Categories config for icons/colors
const categoryConfig = {
    salary: { icon: 'bi-cash-coin', color: '#2ec4b6' },
    food: { icon: 'bi-cup-straw', color: '#ef476f' },
    transport: { icon: 'bi-car-front', color: '#118ab2' },
    utilities: { icon: 'bi-lightning', color: '#ffd166' },
    shopping: { icon: 'bi-bag', color: '#06d6a0' },
    health: { icon: 'bi-heart-pulse', color: '#f72585' },
    investment: { icon: 'bi-graph-up-arrow', color: '#4361ee' },
    loan: { icon: 'bi-bank', color: '#7209b7' },
    other: { icon: 'bi-three-dots', color: '#6c757d' }
};

document.addEventListener('DOMContentLoaded', () => {
    // Set default date to today
    document.getElementById('trxDate').valueAsDate = new Date();
    const ccTxnDate = document.getElementById('ccTxnDate');
    if (ccTxnDate) ccTxnDate.valueAsDate = new Date();

    // Sidebar Logic
    setupSidebar();
    initTopToggle();

    // Form Submit
    if (!__financeEventBound) {
        __financeEventBound = true;
        document.getElementById('transactionForm').addEventListener('submit', handleTransactionSubmit);
        document.getElementById('loanForm').addEventListener('submit', handleLoanSubmit);
        document.getElementById('investmentForm').addEventListener('submit', handleInvestmentSubmit);
        document.getElementById('recurringForm').addEventListener('submit', handleRecurringSubmit);
        const ccForm = document.getElementById('creditCardForm');
    if (ccForm) ccForm.addEventListener('submit', handleCreditCardSubmit);
        const ccTxnForm = document.getElementById('creditCardTransactionForm');
        if (ccTxnForm) ccTxnForm.addEventListener('submit', handleCreditCardTransactionSubmit);
        const ccFilterRadios = document.querySelectorAll('input[name="ccFilterType"]');
        ccFilterRadios.forEach(r => r.addEventListener('change', () => { __ccPage = 1; renderCreditCardTransactions(creditCardTransactions); }));
        const ccFilterCard = document.getElementById('ccFilterCard');
        if (ccFilterCard) ccFilterCard.addEventListener('change', () => { __ccPage = 1; renderCreditCardTransactions(creditCardTransactions); });
        const ccMetricsCardSelect = document.getElementById('ccMetricsCardSelect');
        if (ccMetricsCardSelect) ccMetricsCardSelect.addEventListener('change', updateCreditCardSummary);
        const ccPrev = document.getElementById('ccTransactionsPrevBtn');
        const ccNext = document.getElementById('ccTransactionsNextBtn');
        if (ccPrev) ccPrev.addEventListener('click', () => { if (__ccPage > 1) { __ccPage--; renderCreditCardTransactions(__ccCurrentList); } });
        if (ccNext) ccNext.addEventListener('click', () => { const totalPages = Math.max(1, Math.ceil(__ccCurrentList.length / __ccPageSize)); if (__ccPage < totalPages) { __ccPage++; renderCreditCardTransactions(__ccCurrentList); } });
    }

    // Filter Logic
    document.querySelectorAll('input[name="filterType"]').forEach(radio => {
        radio.addEventListener('change', (e) => filterTransactions(e.target.value));
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
    if (!__financeSnapshotsBound) {
        __financeSnapshotsBound = true;
        initializeFinance();
    }
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

    // Update top navigation user menu (consistent with index page)
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
                    <li><a class="dropdown-item" href="profile.html">
                        <i class="bi bi-person-circle me-2"></i>My Profile
                    </a></li>
                    <li><a class="dropdown-item" href="settings.html">
                        <i class="bi bi-gear me-2"></i>Settings
                    </a></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><a class="dropdown-item" href="#" id="logoutBtn">
                        <i class="bi bi-box-arrow-right me-2"></i>Sign Out
                    </a></li>
                </ul>
            </div>
        `;
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    }
}

function initTopToggle() {
    const track = document.getElementById('topToggle');
    if (!track) return;
    const options = track.querySelectorAll('.toggle-option');
    options.forEach(btn => {
        btn.addEventListener('click', () => {
            options.forEach(o => o.classList.remove('active'));
            btn.classList.add('active');
            const isCredit = btn.dataset.target === '#tabCreditCards';
            track.classList.toggle('credit-active', isCredit);
            const panes = document.querySelectorAll('.tab-pane');
            panes.forEach(p => p.classList.remove('show', 'active'));
            const pane = document.querySelector(btn.dataset.target);
            if (pane) pane.classList.add('show', 'active');
        });
    });
}

function initializeFinance() {
    // 1. Transactions
    const qTrx = query(collection(db, 'financialRecords'), orderBy('date', 'desc'), orderBy('timestamp', 'desc'));
    onSnapshot(qTrx, (snapshot) => {
        transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateDashboard();
        __trxPage = 1;
        renderTransactions(transactions);
        updateCharts();
    }, (error) => console.error("Error fetching transactions:", error));

    // 2. Loans
    const qLoans = query(collection(db, 'financialLoans'), orderBy('createdAt', 'desc'));
    onSnapshot(qLoans, (snapshot) => {
        loans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        checkLoanEMIs(); // Check for due EMIs whenever loans load/update
        updateDashboard();
        // Only render active loans in the sidebar list
        renderLoans(loans.filter(l => l.status === 'active' && l.remainingBalance > 0));
    }, (error) => console.error("Error fetching loans:", error));

    // 3. Investments
    const qInvest = query(collection(db, 'financialInvestments'), orderBy('createdAt', 'desc'));
    onSnapshot(qInvest, (snapshot) => {
        investments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderInvestments(investments);
        checkInvestmentSIPs(); // Check for due SIPs
        checkInvestmentInterest(); // Check for Annual Interest (Mar 31)
        updateDashboard();
    }, (error) => console.error("Error fetching investments:", error));

    // 4. Recurring
    const qRec = query(collection(db, 'financialRecurring'), orderBy('createdAt', 'desc'));
    onSnapshot(qRec, (snapshot) => {
        recurringItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderRecurring(recurringItems);
        checkRecurringItems(); // Check for due recurring items
        updateDashboard(); // Update dashboard to reflect configured salary
    }, (error) => console.error("Error fetching recurring:", error));

    // 5. Credit Cards (Separate tracking; does not affect balance cards)
    const qCC = query(collection(db, 'financialCreditCards'), orderBy('createdAt', 'desc'));
    onSnapshot(qCC, (snapshot) => {
        creditCards = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCreditCards(creditCards);
        populateCcCardOptions(creditCards);
        updateCreditCardSummary();
    }, (error) => console.error("Error fetching credit cards:", error));
    
    const qCCT = query(collection(db, 'financialCreditCardTransactions'), orderBy('createdAt', 'desc'));
    onSnapshot(qCCT, (snapshot) => {
        creditCardTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCreditCardTransactions(creditCardTransactions);
        renderCreditCards(creditCards);
        updateCreditCardSummary();
    }, (error) => console.error("Error fetching credit card transactions:", error));
}

async function handleTransactionSubmit(e) {
    e.preventDefault();
    if (__submitting.transaction) return;
    __submitting.transaction = true;
    
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

    const data = {
        type: document.getElementById('trxType').value,
        amount: parseFloat(document.getElementById('trxAmount').value),
        category: document.getElementById('trxCategory').value,
        date: document.getElementById('trxDate').value,
        description: document.getElementById('trxDescription').value,
        timestamp: serverTimestamp(),
        createdBy: currentUser.uid
    };

    try {
        await addDoc(collection(db, 'financialRecords'), data);
        
        // Reset form and close modal
        e.target.reset();
        document.getElementById('trxDate').valueAsDate = new Date();
        const modal = bootstrap.Modal.getInstance(document.getElementById('addTransactionModal'));
        modal.hide();
        
        showToast('Transaction added successfully');
    } catch (error) {
        console.error("Error adding transaction:", error);
        showToast('Error saving transaction', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
        __submitting.transaction = false;
    }
}

async function handleLoanSubmit(e) {
    e.preventDefault();
    if (__submitting.loan) return;
    __submitting.loan = true;
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

    const totalAmount = parseFloat(document.getElementById('loanAmount').value);
    const emiAmount = parseFloat(document.getElementById('loanEMI').value);
    const emiDate = parseInt(document.getElementById('loanEMIDate').value);
    const startDateStr = document.getElementById('loanStartDate').value;
    const annualRate = parseFloat(document.getElementById('loanROI').value) || 0;
    
    // Calculate initial balance by deducting past EMIs with correct Interest/Principal split
    let remainingBalance = totalAmount;
    let lastEmiPaidMonth = null;
    let paidEmiCount = 0;
    
    // Stats for the user
    let totalInterestPaid = 0;
    let totalPrincipalPaid = 0;

    if (startDateStr) {
        // Parse "YYYY-MM-DD" manually to avoid UTC/Local timezone shifts
        const [sYear, sMonth, sDay] = startDateStr.split('-').map(Number);
        
        // Create Local Date Objects (Month is 0-indexed in JS Date)
        // Set time to noon to avoid any daylight saving edge cases
        const start = new Date(sYear, sMonth - 1, sDay, 12, 0, 0);
        
        const now = new Date();
        now.setHours(12, 0, 0, 0); // Compare at noon
        
        // Start checking from the EMI date in the START MONTH
        let iterDate = new Date(sYear, sMonth - 1, emiDate, 12, 0, 0);
        
        // If the EMI date in the start month is BEFORE the actual start date,
        // then the first EMI is due the NEXT month.
        if (iterDate < start) {
            iterDate.setMonth(iterDate.getMonth() + 1);
        }

        // Iterate until today
        // We use a safety counter to prevent infinite loops
        let maxLoops = 1200; // 100 years
        
        // Monthly Interest Rate = Annual Rate / 12 / 100
        const monthlyRate = annualRate / 12 / 100;

        // Batch writes for transactions
        const batchTransactions = [];
        
        while (iterDate <= now && maxLoops > 0) {
            // Amortization Logic:
            // 1. Calculate Interest for this month on the current outstanding balance
            const interestForMonth = remainingBalance * monthlyRate;
            
            // 2. Calculate Principal component
            // If EMI < Interest (which shouldn't happen in standard loans), we assume it just covers interest
            let principalForMonth = emiAmount - interestForMonth;
            
            if (principalForMonth < 0) principalForMonth = 0; // Negative amortization protection
            
            // 3. Update Balance
            remainingBalance -= principalForMonth;
            
            // 4. Update Stats
            totalInterestPaid += interestForMonth;
            totalPrincipalPaid += principalForMonth;
            
            lastEmiPaidMonth = `${iterDate.getFullYear()}-${iterDate.getMonth()}`;
            paidEmiCount++;

            // 5. Create Historical Transaction
            batchTransactions.push({
                type: 'expense',
                amount: emiAmount,
                category: 'loan',
                date: iterDate.toISOString().split('T')[0],
                description: `Auto-EMI: ${document.getElementById('loanName').value} (Past)`,
                timestamp: serverTimestamp(), // This will show they were added now, but 'date' field is past
                createdBy: currentUser.uid,
                isAutoEmi: true
            });
            
            // Move to next month safely (handling 31st vs 28th/30th)
            // Current month of iteration
            let currentM = iterDate.getMonth();
            let currentY = iterDate.getFullYear();
            
            // Target next month
            let nextM = currentM + 1;
            let nextY = currentY;
            if (nextM > 11) {
                nextM = 0;
                nextY++;
            }
            
            // Clamp day to valid range for next month
            const daysInNextMonth = new Date(nextY, nextM + 1, 0).getDate();
            const nextDay = Math.min(emiDate, daysInNextMonth);
            
            iterDate = new Date(nextY, nextM, nextDay, 12, 0, 0);
            
            maxLoops--;
            
            // Break if loan is fully paid
            if (remainingBalance <= 0) {
                remainingBalance = 0;
                break;
            }
        }
        
        // Save all historical transactions
        if (batchTransactions.length > 0) {
            try {
                // We use Promise.all for parallel adds (Batch write is better but requires doc refs, addDoc is easier here)
                await Promise.all(batchTransactions.map(t => addDoc(collection(db, 'financialRecords'), t)));
            } catch (err) {
                console.error("Error creating past loan transactions:", err);
            }
        }
    }
    
    // Ensure balance doesn't go negative
    if (remainingBalance < 0) remainingBalance = 0;

    const data = {
        name: document.getElementById('loanName').value,
        totalAmount: totalAmount,
        interestRate: annualRate,
        tenureMonths: parseInt(document.getElementById('loanTenure').value) || 0,
        emiAmount: emiAmount,
        emiDate: emiDate,
        startDate: startDateStr,
        remainingBalance: remainingBalance, // Adjusted balance (Principal only)
        lastEmiPaidMonth: lastEmiPaidMonth, // Updated to prevent double deduction
        totalInterestPaid: totalInterestPaid, // Store these for records
        totalPrincipalPaid: totalPrincipalPaid,
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid,
        status: remainingBalance <= 0 ? 'completed' : 'active'
    };

    try {
        await addDoc(collection(db, 'financialLoans'), data);
        e.target.reset();
        bootstrap.Modal.getInstance(document.getElementById('addLoanModal')).hide();
        
        if (paidEmiCount > 0) {
            showToast(`Loan created. Adjusted for ${paidEmiCount} past EMIs. Interest Paid: ${formatCompact(totalInterestPaid)}`);
        } else {
            showToast('Loan tracker created successfully');
        }
    } catch (error) {
        console.error("Error adding loan:", error);
        showToast('Error saving loan', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
        __submitting.loan = false;
    }
}

function toggleInvFields() {
    const type = document.getElementById('invType').value;
    const roiGroup = document.getElementById('invRoiGroup');
    const sipGroup = document.getElementById('invSipGroup');
    
    // Show ROI for PPF, PF, and FD
    if (type === 'ppf' || type === 'pf' || type === 'fd') {
        roiGroup.style.display = 'block';
    } else {
        roiGroup.style.display = 'none';
        document.getElementById('invROI').value = '';
    }

    // Hide SIP for FD (One-time investment)
    if (type === 'fd') {
        sipGroup.style.display = 'none';
        document.getElementById('invMonthlyAmount').value = '';
    } else {
        sipGroup.style.display = 'flex';
    }
}

async function handleInvestmentSubmit(e) {
    e.preventDefault();
    if (__submitting.investment) return;
    __submitting.investment = true;
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

    const type = document.getElementById('invType').value;
    const sipAmount = parseFloat(document.getElementById('invMonthlyAmount').value) || 0;
    
    const data = {
        name: document.getElementById('invName').value,
        type: type,
        investedAmount: parseFloat(document.getElementById('invAmount').value),
        currentValue: parseFloat(document.getElementById('invCurrentValue').value),
        interestRate: parseFloat(document.getElementById('invROI').value) || 0,
        startDate: document.getElementById('invStartDate').value,
        sipAmount: sipAmount,
        sipDate: parseInt(document.getElementById('invSipDate').value) || 1,
        lastSipPaidMonth: null, // Initialize
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid,
        lastUpdated: serverTimestamp()
    };
    
    // If SIP is set, we might need to mark current month as paid if date passed?
    // Let's leave it null so the auto-checker handles it or user manually triggers?
    // Better: If Start Date is in past, the auto-checker will catch up.
    // If Start Date is today/future, it waits.
    
    // Determine initial lastInterestPaidYear to prevent immediate back-dated interest
    // Financial Year ends March 31.
    // If today is Dec 2023, current completed FY is 2023 (ended Mar 2023). Next is 2024.
    // So we set lastInterestPaidYear = 2023.
    // If today is Jan 2024, current completed FY is 2023. Next is 2024 (in Mar).
    const today = new Date();
    const currentFinYear = (today.getMonth() > 2 || (today.getMonth() === 2 && today.getDate() >= 31)) 
        ? today.getFullYear() 
        : today.getFullYear() - 1;

    try {
        // Add lastInterestPaidYear to data
        data.lastInterestPaidYear = currentFinYear;

        await addDoc(collection(db, 'financialInvestments'), data);
        e.target.reset();
        bootstrap.Modal.getInstance(document.getElementById('addInvestmentModal')).hide();
        showToast('Investment added successfully');
    } catch (error) {
        console.error("Error adding investment:", error);
        showToast('Error saving investment', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
        __submitting.investment = false;
    }
}

async function handleRecurringSubmit(e) {
    e.preventDefault();
    if (__submitting.recurring) return;
    __submitting.recurring = true;
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

    const shouldAddNow = document.getElementById('recAddNow').checked;
    const todayInit = new Date();
    const currentPeriodInit = `${todayInit.getFullYear()}-${todayInit.getMonth()}`;

    const data = {
        name: document.getElementById('recName').value,
        type: document.getElementById('recType').value,
        amount: parseFloat(document.getElementById('recAmount').value),
        day: parseInt(document.getElementById('recDay').value),
        lastProcessedMonth: shouldAddNow ? currentPeriodInit : null,
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid,
        active: true
    };

    try {
        const docRef = await addDoc(collection(db, 'financialRecurring'), data);
        e.target.reset();

        if (shouldAddNow) {
            const today = new Date();
            const currentPeriod = `${today.getFullYear()}-${today.getMonth()}`;

            // Idempotency: skip if already added for this period
            const uniqueKey = `rec_${docRef.id}_${currentPeriod}`;
            await addUniqueRecord(uniqueKey, {
                type: data.type,
                amount: data.amount,
                category: data.type === 'income' ? 'salary' : 'utilities',
                date: today.toISOString().split('T')[0],
                description: `Auto-Recurring: ${data.name} (Initial)`,
                timestamp: serverTimestamp(),
                createdBy: currentUser.uid,
                isRecurring: true,
                recurringId: docRef.id,
                period: currentPeriod
            });
            await cleanupDuplicateRecords('recurringId', docRef.id, currentPeriod, uniqueKey);
            showToast('Recurring setup & added for this month');
        } else {
            showToast('Recurring item set up successfully');
        }
        
        // Reset checkbox to checked for next time
        document.getElementById('recAddNow').checked = true;

    } catch (error) {
        console.error("Error adding recurring:", error);
        showToast('Error saving recurring item', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
        __submitting.recurring = false;
    }
}

async function deleteTransaction(id) {
    if (!confirm('Are you sure you want to delete this transaction?')) return;

    try {
        await deleteDoc(doc(db, 'financialRecords', id));
        showToast('Transaction deleted');
    } catch (error) {
        console.error("Error deleting:", error);
        showToast('Error deleting transaction', 'error');
    }
}

async function deleteLoan(id) {
    if (!confirm('Delete this loan tracker?')) return;
    try {
        await deleteDoc(doc(db, 'financialLoans', id));
        showToast('Loan deleted');
    } catch (error) { console.error(error); showToast('Error deleting', 'error'); }
}

async function deleteInvestment(id) {
    if (!confirm('Delete this investment?')) return;
    try {
        await deleteDoc(doc(db, 'financialInvestments', id));
        showToast('Investment deleted');
    } catch (error) { console.error(error); showToast('Error deleting', 'error'); }
}

async function deleteRecurring(id) {
    if (!confirm('Stop this recurring transaction?')) return;
    try {
        await deleteDoc(doc(db, 'financialRecurring', id));
        showToast('Recurring item stopped');
    } catch (error) { console.error(error); showToast('Error deleting', 'error'); }
}

async function processRecurringNow(id) {
    if (!confirm('Add this transaction to the current month now?')) return;
    
    const item = recurringItems.find(i => i.id === id);
    if (!item) return;
    
    const today = new Date();
    const currentPeriod = `${today.getFullYear()}-${today.getMonth()}`;
    
    try {
        // Idempotency: skip if already added for this period
        const uniqueKey = `rec_${item.id}_${currentPeriod}`;
        await addUniqueRecord(uniqueKey, {
            type: item.type,
            amount: item.amount,
            category: item.type === 'income' ? 'salary' : 'utilities',
            date: today.toISOString().split('T')[0],
            description: `Auto-Recurring: ${item.name} (Manual)`,
            timestamp: serverTimestamp(),
            createdBy: currentUser.uid,
            isRecurring: true,
            recurringId: item.id,
            period: currentPeriod
        });
        await cleanupDuplicateRecords('recurringId', item.id, currentPeriod, uniqueKey);

        await updateDoc(doc(db, 'financialRecurring', item.id), {
            lastProcessedMonth: currentPeriod
        });

        showToast(`${item.name} processed successfully`);
    } catch (err) {
        console.error("Error processing recurring item:", err);
        showToast("Error processing item", "error");
    }
}

async function handleCreditCardSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

    const data = {
        name: document.getElementById('ccName').value,
        limit: parseFloat(document.getElementById('ccLimit').value),
        spent: parseFloat(document.getElementById('ccSpent').value) || 0,
        paid: parseFloat(document.getElementById('ccPaid').value) || 0,
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid
    };

    try {
        await addDoc(collection(db, 'financialCreditCards'), data);
        e.target.reset();
        bootstrap.Modal.getInstance(document.getElementById('addCreditCardModal')).hide();
        showToast('Credit card added');
    } catch (error) {
        console.error("Error adding credit card:", error);
        showToast('Error saving credit card', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

async function handleCreditCardTransactionSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
    const data = {
        cardId: document.getElementById('ccTxnCard').value,
        type: document.getElementById('ccTxnType').value,
        amount: parseFloat(document.getElementById('ccTxnAmount').value),
        date: document.getElementById('ccTxnDate').value,
        description: document.getElementById('ccTxnDesc').value,
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid
    };
    try {
        await addDoc(collection(db, 'financialCreditCardTransactions'), data);
        e.target.reset();
        document.getElementById('ccTxnDate').valueAsDate = new Date();
        bootstrap.Modal.getInstance(document.getElementById('addCreditCardTransactionModal')).hide();
        showToast('Credit card transaction added');
    } catch (err) {
        console.error("Error adding credit card transaction:", err);
        showToast('Error saving transaction', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

async function updateCreditCardUsage(id, currentSpent, currentPaid) {
    const spentStr = prompt("Enter new 'Spent (this cycle)' amount:", currentSpent ?? 0);
    if (spentStr === null) return;
    const paidStr = prompt("Enter new 'Paid (this cycle)' amount:", currentPaid ?? 0);
    if (paidStr === null) return;
    const spent = parseFloat(spentStr);
    const paid = parseFloat(paidStr);
    if (isNaN(spent) || isNaN(paid)) { alert('Invalid amounts'); return; }
    try {
        await updateDoc(doc(db, 'financialCreditCards', id), { spent, paid });
        showToast('Credit card usage updated');
    } catch (err) {
        console.error(err);
        showToast('Error updating card', 'error');
    }
}

async function deleteCreditCard(id) {
    if (!confirm('Delete this credit card?')) return;
    try {
        await deleteDoc(doc(db, 'financialCreditCards', id));
        showToast('Credit card deleted');
    } catch (err) {
        console.error(err);
        showToast('Error deleting card', 'error');
    }
}

function renderCreditCards(list) {
    const container = document.getElementById('creditCardsList');
    if (!container) return;
    if (list.length === 0) {
        container.innerHTML = '<div class="text-center py-3 text-muted"><small>No credit cards added</small></div>';
        return;
    }
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    container.innerHTML = list.map(c => {
        const txns = creditCardTransactions.filter(t => t.cardId === c.id);
        const monthPurchases = txns.filter(t => t.type === 'purchase' && new Date(t.date) >= startOfMonth).reduce((a, b) => a + (parseFloat(b.amount) || 0), 0);
        const monthPayments = txns.filter(t => t.type === 'payment' && new Date(t.date) >= startOfMonth).reduce((a, b) => a + (parseFloat(b.amount) || 0), 0);
        const spent = (c.spent || 0) + monthPurchases;
        const paid = (c.paid || 0) + monthPayments;
        const used = Math.max(0, spent - paid);
        const remaining = Math.max(0, (c.limit || 0) - used);
        const usagePct = c.limit > 0 ? Math.min(100, (used / c.limit) * 100) : 0;
        return `
            <div class="list-group-item p-3 border-bottom">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <div>
                        <h6 class="mb-1 fw-bold"><i class="bi bi-credit-card-2-front me-2"></i>${c.name}</h6>
                        <small class="text-muted">Limit: ${formatCurrency(c.limit || 0)}</small>
                    </div>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-outline-secondary" onclick="updateCreditCardUsage('${c.id}', ${c.spent || 0}, ${c.paid || 0})">Update</button>
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteCreditCard('${c.id}')"><i class="bi bi-trash"></i></button>
                    </div>
                </div>
                <div class="row g-2 small mb-2">
                    <div class="col-6">
                        <div class="text-muted">Spent</div>
                        <div class="fw-bold text-danger">${formatCurrency(spent)}</div>
                    </div>
                    <div class="col-6 text-end">
                        <div class="text-muted">Paid</div>
                        <div class="fw-bold text-success">${formatCurrency(paid)}</div>
                    </div>
                    <div class="col-6">
                        <div class="text-muted">Used</div>
                        <div class="fw-bold">${formatCurrency(used)}</div>
                    </div>
                    <div class="col-6 text-end">
                        <div class="text-muted">Remaining</div>
                        <div class="fw-bold">${formatCurrency(remaining)}</div>
                    </div>
                </div>
                <div class="d-flex justify-content-between small text-muted mb-1">
                    <span>Usage</span><span>${usagePct.toFixed(1)}%</span>
                </div>
                <div class="progress" style="height: 6px;">
                    <div class="progress-bar ${usagePct > 80 ? 'bg-danger' : 'bg-primary'}" role="progressbar" style="width: ${usagePct}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

function populateCcCardOptions(cards) {
    const select1 = document.getElementById('ccTxnCard');
    const select2 = document.getElementById('ccFilterCard');
    const select3 = document.getElementById('ccMetricsCardSelect');
    const opts = cards.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    if (select1) {
        const current = select1.value;
        select1.innerHTML = '<option value="">Select card...</option>' + opts;
        if (current) select1.value = current;
    }
    if (select2) {
        const currentF = select2.value;
        select2.innerHTML = '<option value="">All Cards</option>' + opts;
        if (currentF) select2.value = currentF;
    }
    if (select3) {
        const currentM = select3.value;
        select3.innerHTML = '<option value="">All Cards</option>' + opts;
        if (currentM) select3.value = currentM;
    }
}

function renderCreditCardTransactions(list) {
    const container = document.getElementById('creditCardTransactionsList');
    if (!container) return;
    const type = document.querySelector('input[name="ccFilterType"]:checked')?.value || 'all';
    const cardFilter = document.getElementById('ccFilterCard')?.value || '';
    let filtered = list.slice();
    if (type !== 'all') filtered = filtered.filter(t => t.type === type);
    if (cardFilter) filtered = filtered.filter(t => t.cardId === cardFilter);
    __ccCurrentList = filtered;
    const totalPages = Math.max(1, Math.ceil(filtered.length / __ccPageSize));
    const startIndex = (__ccPage - 1) * __ccPageSize;
    const endIndex = startIndex + __ccPageSize;
    const pageSlice = filtered.slice(startIndex, endIndex);
    const pagEl = document.getElementById('ccTransactionsPagination');
    const pageInfoEl = document.getElementById('ccTransactionsPageInfo');
    if (pagEl) pagEl.style.display = filtered.length > __ccPageSize ? '' : 'none';
    if (pageInfoEl) pageInfoEl.textContent = `Page ${Math.min(__ccPage, totalPages)} of ${totalPages}`;
    const prevBtn = document.getElementById('ccTransactionsPrevBtn');
    const nextBtn = document.getElementById('ccTransactionsNextBtn');
    if (prevBtn) prevBtn.disabled = __ccPage <= 1;
    if (nextBtn) nextBtn.disabled = __ccPage >= totalPages;
    if (pageSlice.length === 0) {
        container.innerHTML = '<div class="text-center py-3 text-muted"><small>No transactions</small></div>';
        return;
    }
    container.innerHTML = pageSlice.map(t => {
        const cardName = creditCards.find(c => c.id === t.cardId)?.name || '';
        const isPay = t.type === 'payment';
        return `
            <div class="list-group-item transaction-item ${isPay ? 'type-income' : 'type-expense'} p-3 d-flex justify-content-between align-items-center">
                <div class="d-flex align-items-center">
                    <div class="category-icon me-3" style="background-color: ${isPay ? 'rgba(25,135,84,.1)' : 'rgba(220,53,69,.1)'};">
                        <i class="bi ${isPay ? 'bi-bank' : 'bi-bag'}" style="color: ${isPay ? '#198754' : '#dc3545'}"></i>
                    </div>
                    <div>
                        <div class="fw-bold">${isPay ? 'Payment' : 'Purchase'} • ${cardName}</div>
                        <div class="text-muted small">${t.description || ''}</div>
                        <div class="text-muted small">${t.date}</div>
                    </div>
                </div>
                <div class="fw-bold ${isPay ? 'text-success' : 'text-danger'}">${formatCurrency(parseFloat(t.amount) || 0)}</div>
            </div>
        `;
    }).join('');
}

function updateCreditCardSummary() {
    const sel = document.getElementById('ccMetricsCardSelect');
    const cardId = sel ? sel.value : '';
    const today = new Date();
    today.setHours(0,0,0,0);
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0,0,0,0);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonthDateObj = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    const monthLabelText = `${today.toLocaleString(undefined, { month: 'long' })} ${today.getFullYear()}`;
    const lastMonthLabelText = `${lastMonthDateObj.toLocaleString(undefined, { month: 'long' })} ${lastMonthDateObj.getFullYear()}`;
    const txns = creditCardTransactions.filter(t => !cardId || t.cardId === cardId);
    let daily = 0, weekly = 0, monthly = 0, lastMonth = 0;
    txns.forEach(t => {
        if (t.type !== 'purchase') return;
        const amt = parseFloat(t.amount) || 0;
        const d = new Date(t.date);
        d.setHours(0,0,0,0);
        if (d.getTime() === today.getTime()) daily += amt;
        if (d >= startOfWeek) weekly += amt;
        if (d >= startOfMonth) monthly += amt;
        if (d >= startOfLastMonth && d <= endOfLastMonth) lastMonth += amt;
    });
    const diff = monthly - lastMonth;
    const dailyEl = document.getElementById('ccDailySpent');
    const weeklyEl = document.getElementById('ccWeeklySpent');
    const monthlyEl = document.getElementById('ccMonthlySpent');
    const lastMonthEl = document.getElementById('ccLastMonthSpent');
    const diffEl = document.getElementById('ccSpentDiff');
    const mLabelEl = document.getElementById('ccMonthlyLabel');
    const lmLabelEl = document.getElementById('ccLastMonthLabel');
    if (dailyEl) dailyEl.innerHTML = formatCurrency(daily);
    if (weeklyEl) weeklyEl.innerHTML = formatCurrency(weekly);
    if (monthlyEl) monthlyEl.innerHTML = formatCurrency(monthly);
    if (lastMonthEl) lastMonthEl.innerHTML = formatCurrency(lastMonth);
    if (diffEl) diffEl.innerHTML = formatCurrency(diff);
    if (mLabelEl) mLabelEl.textContent = monthLabelText;
    if (lmLabelEl) lmLabelEl.textContent = lastMonthLabelText;
}

window.updateCreditCardUsage = updateCreditCardUsage;
window.deleteCreditCard = deleteCreditCard;
async function updateInvestmentValue(id, currentVal) {
    const newVal = prompt("Enter new current value:", currentVal);
    if (newVal === null) return;
    
    const val = parseFloat(newVal);
    if (isNaN(val)) {
        alert("Invalid amount");
        return;
    }

    try {
        await updateDoc(doc(db, 'financialInvestments', id), {
            currentValue: val,
            lastUpdated: serverTimestamp()
        });
        showToast('Investment value updated');
    } catch (error) {
        console.error(error);
        showToast('Error updating value', 'error');
    }
}

async function setInitialBalance() {
    const amountStr = prompt("Enter your current cash/bank balance to start with (Opening Balance):");
    if (!amountStr) return;
    const amount = parseFloat(amountStr);
    if (isNaN(amount)) {
        alert("Please enter a valid number");
        return;
    }
    
    // We simply add an 'Income' transaction for this amount
    try {
         await addDoc(collection(db, 'financialRecords'), {
            type: 'income',
            amount: amount,
            category: 'other', 
            date: new Date().toISOString().split('T')[0],
            description: 'Opening Balance',
            timestamp: serverTimestamp(),
            createdBy: currentUser.uid
        });
        showToast('Opening balance set successfully');
    } catch(e) {
        console.error("Error setting opening balance:", e);
        showToast('Error saving opening balance', 'error');
    }
}

// Make global for onclick
window.deleteTransaction = deleteTransaction;
window.deleteLoan = deleteLoan;
window.deleteInvestment = deleteInvestment;
window.deleteRecurring = deleteRecurring;
window.processRecurringNow = processRecurringNow;
window.updateInvestmentValue = updateInvestmentValue;
window.setInitialBalance = setInitialBalance;
window.toggleInvFields = toggleInvFields;

function updateDashboard() {
    let totalIncome = 0;
    let totalExpense = 0; // Displayed Expenses (Excluding EMIs)
    let totalEMI = 0;     // EMIs (deducted from balance but not shown in Total Expenses)
    let totalPending = 0;
    
    // Time-based breakdowns
    let dailyExp = 0;
    let weeklyExp = 0;
    let monthlyExp = 0;

    const today = new Date();
    today.setHours(0,0,0,0);
    
    // Calculate start of week (Sunday)
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0,0,0,0);
    
    // Calculate start of month
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthDateObj = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const monthLabelText = `${today.toLocaleString(undefined, { month: 'long' })} ${today.getFullYear()}`;
    const lastMonthLabelText = `${lastMonthDateObj.toLocaleString(undefined, { month: 'long' })} ${lastMonthDateObj.getFullYear()}`;

    // Calculate from Transactions
    let totalPastEMI = 0; // Historical/Past EMIs that shouldn't affect current balance
    let monthlyIncome = 0;
    let monthlyRegularExp = 0;
    let monthlyEmi = 0;
    let monthlyInvestOutflowExp = 0;
    let lastMonthIncome = 0;
    let lastMonthExp = 0;
    let lastMonthRegularExp = 0;
    let lastMonthEmi = 0;
    let lastMonthInvestOutflowExp = 0;
    
    transactions.forEach(t => {
        const amount = parseFloat(t.amount) || 0;
        const tDate = new Date(t.date);
        tDate.setHours(0,0,0,0);

        if (t.type === 'income') {
            totalIncome += amount;
            if (tDate >= startOfMonth) monthlyIncome += amount;
            if (tDate >= startOfLastMonth && tDate < startOfMonth) lastMonthIncome += amount;
        }
        else if (t.type === 'expense') {
            // Check if it's an EMI
            // We use isAutoEmi flag (set by system) or category 'loan' (for manual entries)
            const isEMI = t.isAutoEmi === true || t.category === 'loan';
            
            if (isEMI) {
                totalEMI += amount;
                if (tDate >= startOfMonth) monthlyEmi += amount;
                if (tDate >= startOfLastMonth && tDate < startOfMonth) lastMonthEmi += amount;
                
                // Identify if this is a "Past" EMI generated for history
                // We ONLY exclude it from Balance if it's from a previous month.
                // If it falls in the current month, it should reduce the current balance.
                if (t.description && t.description.includes('(Past)') && tDate < startOfMonth) {
                    totalPastEMI += amount;
                }
            } else {
                totalExpense += amount; // Only regular spending
                if (tDate >= startOfMonth) monthlyRegularExp += amount;
                if (tDate >= startOfLastMonth && tDate < startOfMonth) lastMonthRegularExp += amount;
            }
            
            // Add to time-based stats (Include EMIs as they are expenses too)
            if (tDate.getTime() === today.getTime()) {
                dailyExp += amount;
            }
            if (tDate >= startOfWeek) {
                weeklyExp += amount;
            }
            if (tDate >= startOfMonth) {
                monthlyExp += amount;
            }
            if (tDate >= startOfLastMonth && tDate < startOfMonth) {
                lastMonthExp += amount;
            }
            
            if (t.category === 'investment') {
                if (tDate >= startOfMonth) monthlyInvestOutflowExp += amount;
                if (tDate >= startOfLastMonth && tDate < startOfMonth) lastMonthInvestOutflowExp += amount;
            }
        }
        else if (t.type === 'pending') {
            totalPending += amount;
        }
        
        // Note: Investments are calculated separately for the Balance, 
        // but NOT added to "Total Expenses" display.
    });

    // Calculate Real-time Loan Stats
    let totalOutstandingLoan = 0;
    let totalLoanPrincipal = 0;
    let monthlyEmiCommitment = 0;

    loans.forEach(l => {
        // Total Borrowed (All loans)
        totalLoanPrincipal += (l.totalAmount || 0);

        // Active Loans Stats
        if (l.status === 'active') {
            totalOutstandingLoan += l.remainingBalance;
            monthlyEmiCommitment += (l.emiAmount || 0);
        }
    });

    // Calculate Real-time Investment Value
    let currentPortfolioValue = 0;
    investments.forEach(i => {
        currentPortfolioValue += i.currentValue;
    });

    // Total Balance (Cash in Hand)
    // = Income - (Regular Expenses + Current EMIs + Investments)
    // We EXCLUDE "Past" EMIs from Balance calculation because they were paid before tracking started.
    
    let totalInvestedOutflow = 0;
    transactions.forEach(t => {
        if (t.type === 'investment') totalInvestedOutflow += parseFloat(t.amount);
    });

    // Current EMI Load = Total EMI recorded - Past Historical EMIs
    const currentEmiLoad = totalEMI - totalPastEMI;

    const balance = totalIncome - totalExpense - currentEmiLoad - totalInvestedOutflow;

    // Animate numbers
    animateValue('totalIncome', totalIncome);
    animateValue('totalLoanExpenses', totalEMI);   // Loan Expenses (Paid EMIs)
    animateValue('totalOtherExpenses', totalExpense); // Regular Expenses
    
    // New Cards
    animateValue('monthlyEmiCommitment', monthlyEmiCommitment);
    animateValue('totalLoanPrincipal', totalLoanPrincipal);
    animateValue('totalOutstandingLoan', totalOutstandingLoan);
    
    animateValue('totalPending', totalPending); // Just pending transactions
    animateValue('totalBalance', balance);
    
    // Update Breakdown Text
    const breakdownEl = document.getElementById('balanceBreakdown');
    if (breakdownEl) {
        let bText = `Inc: ${formatCompact(totalIncome)} - Exp: ${formatCompact(totalExpense)} - Loan Paid: ${formatCompact(totalEMI)}`;
        if (totalInvestedOutflow > 0) bText += ` - Inv: ${formatCompact(totalInvestedOutflow)}`;
        breakdownEl.innerHTML = bText;
    }
    
    // Update Breakdown Cards
    if(document.getElementById('dailyExpense')) animateValue('dailyExpense', dailyExp);
    if(document.getElementById('weeklyExpense')) animateValue('weeklyExpense', weeklyExp);
    if(document.getElementById('monthlyExpense')) animateValue('monthlyExpense', monthlyExp);
    const mLabelEl = document.getElementById('monthlyExpenseLabel');
    if (mLabelEl) mLabelEl.textContent = monthLabelText;
    
    const thisMonthSaving = monthlyIncome - monthlyRegularExp - monthlyEmi - monthlyInvestOutflowExp;
    const prevMonthSaving = lastMonthIncome - lastMonthRegularExp - lastMonthEmi - lastMonthInvestOutflowExp;
    const savingDiff = thisMonthSaving - prevMonthSaving;
    
    if (document.getElementById('lastMonthExpense')) animateValue('lastMonthExpense', lastMonthExp);
    const lmExpLabelEl = document.getElementById('lastMonthExpenseLabel');
    if (lmExpLabelEl) lmExpLabelEl.textContent = lastMonthLabelText;
    if (document.getElementById('lastMonthSaving')) animateValue('lastMonthSaving', prevMonthSaving);
    const lmSavLabelEl = document.getElementById('lastMonthSavingLabel');
    if (lmSavLabelEl) lmSavLabelEl.textContent = lastMonthLabelText;
    const diffEl = document.getElementById('savingDiff');
    if (diffEl) {
        const positive = savingDiff >= 0;
        diffEl.classList.toggle('text-success', positive);
        diffEl.classList.toggle('text-danger', !positive);
        diffEl.textContent = formatCurrency(savingDiff);
    }

    // Update Progress Bars / Quick Stats
    
    // 1. Salary Stat: Show Configured Monthly Salary OR Actual Salary Received
    let configuredSalary = 0;
    recurringItems.forEach(item => {
        if (item.active && item.type === 'income') {
            configuredSalary += item.amount;
        }
    });
    
    // Calculate actual received salary this month
    let salaryReceivedThisMonth = 0;
    transactions.forEach(t => {
        if (t.type === 'income' && (t.category === 'salary' || t.isRecurring || (t.description && t.description.toLowerCase().includes('salary')))) {
            const tDate = new Date(t.date);
            if (tDate >= startOfMonth) {
                salaryReceivedThisMonth += parseFloat(t.amount);
            }
        }
    });
    
    // If user hasn't set up recurring salary, show the actual salary received as the stat
    const displaySalary = configuredSalary > 0 ? configuredSalary : salaryReceivedThisMonth;
    document.getElementById('statSalary').textContent = formatCurrency(displaySalary);
    
    // Progress Bar
    let salaryProgress = 0;
    if (configuredSalary > 0) {
        salaryProgress = (salaryReceivedThisMonth / configuredSalary) * 100;
    } else if (salaryReceivedThisMonth > 0) {
        salaryProgress = 100; // Full bar if we have salary but no target
    }
    
    const salaryProgEl = document.getElementById('progSalary');
    if (salaryProgEl) salaryProgEl.style.width = `${Math.min(salaryProgress, 100)}%`;

    
    // Show Current Portfolio Value instead of just historical invested amount
    document.getElementById('statInvestment').textContent = formatCurrency(currentPortfolioValue);
    
    // Show Outstanding Loan Balance
    document.getElementById('statLoan').textContent = formatCurrency(totalOutstandingLoan);
}

function renderTransactions(list) {
    const container = document.getElementById('transactionsList');
    __trxCurrentList = list || [];
    const total = __trxCurrentList.length;
    const totalPages = Math.max(1, Math.ceil(total / __trxPageSize));
    if (__trxPage > totalPages) __trxPage = totalPages;
    const startIdx = (__trxPage - 1) * __trxPageSize;
    const pageItems = __trxCurrentList.slice(startIdx, startIdx + __trxPageSize);
    
    if (pageItems.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5 text-muted">
                <i class="bi bi-receipt display-4 opacity-25"></i>
                <p class="mt-2">No transactions found</p>
            </div>
        `;
    } else {
        container.innerHTML = pageItems.map(t => {
            const config = categoryConfig[t.category] || categoryConfig['other'];
            const isPositive = t.type === 'income';
            const amountClass = isPositive ? 'text-success' : 'text-danger';
            const sign = isPositive ? '+' : '-';
            
            return `
                <div class="list-group-item transaction-item type-${t.type} p-3 border-bottom">
                    <div class="d-flex align-items-center justify-content-between">
                        <div class="d-flex align-items-center gap-3">
                            <div class="category-icon" style="background-color: ${config.color}20; color: ${config.color}">
                                <i class="bi ${config.icon}"></i>
                            </div>
                            <div>
                                <h6 class="mb-0 fw-bold text-capitalize">${t.description || t.category}</h6>
                                <small class="text-muted">
                                    ${new Date(t.date).toLocaleDateString()} • <span class="badge bg-light text-dark border">${t.type}</span>
                                </small>
                            </div>
                        </div>
                        <div class="text-end">
                            <h6 class="mb-0 fw-bold ${amountClass}">${sign}${formatCurrency(t.amount)}</h6>
                            <button class="btn btn-link btn-sm text-muted p-0 text-decoration-none" onclick="deleteTransaction('${t.id}')">
                                <small>Delete</small>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
    const pagEl = document.getElementById('transactionsPagination');
    const infoEl = document.getElementById('transactionsPageInfo');
    const prevBtn = document.getElementById('transactionsPrevBtn');
    const nextBtn = document.getElementById('transactionsNextBtn');
    if (pagEl && infoEl && prevBtn && nextBtn) {
        pagEl.style.display = total > __trxPageSize ? 'flex' : 'none';
        infoEl.textContent = `Page ${__trxPage} of ${totalPages}`;
        prevBtn.disabled = __trxPage <= 1;
        nextBtn.disabled = __trxPage >= totalPages;
        prevBtn.onclick = () => { if (__trxPage > 1) { __trxPage--; renderTransactions(__trxCurrentList); } };
        nextBtn.onclick = () => { if (__trxPage < totalPages) { __trxPage++; renderTransactions(__trxCurrentList); } };
    }
}

function renderLoans(list) {
    const container = document.getElementById('loansList');
    if (list.length === 0) {
        container.innerHTML = '<div class="text-center py-3 text-muted"><small>No active loans</small></div>';
        return;
    }
    
    container.innerHTML = list.map(l => {
        // Calculate derived stats
        const start = new Date(l.startDate);
        const now = new Date();
        // Calculate duration accurately considering years and months
        let durationMonths = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
        if (now.getDate() < start.getDate()) durationMonths--; // Adjust if current month isn't fully elapsed relative to start day
        if (durationMonths < 0) durationMonths = 0;

        // Progress based on Principal
        const progress = ((l.totalAmount - l.remainingBalance) / l.totalAmount) * 100;
        
        // Safety for old records or partial data
        const interestPaid = l.totalInterestPaid || 0;
        // If principalPaid is not stored, infer it from balance diff
        const principalPaid = l.totalPrincipalPaid !== undefined ? l.totalPrincipalPaid : (l.totalAmount - l.remainingBalance);
        
        return `
            <div class="list-group-item p-3 border-bottom bg-white">
                <div class="d-flex justify-content-between align-items-start mb-3">
                    <div>
                        <h6 class="mb-1 fw-bold text-primary"><i class="bi bi-bank me-2"></i>${l.name}</h6>
                        <div class="small text-muted">
                            <span class="me-2"><i class="bi bi-calendar3"></i> ${start.toLocaleDateString()}</span>
                            <span class="badge bg-light text-dark border">${durationMonths} mo elapsed</span>
                        </div>
                    </div>
                    <div class="text-end">
                        <div class="badge bg-primary mb-1" style="font-size: 0.9em;">EMI: ${formatCurrency(l.emiAmount)}</div>
                        <div class="small fw-bold text-muted">ROI: ${l.interestRate}%</div>
                    </div>
                </div>

                <div class="row g-2 mb-3 small">
                    <div class="col-6">
                        <div class="text-uppercase text-muted" style="font-size: 0.75rem;">Total Loan</div>
                        <div class="fw-bold">${formatCurrency(l.totalAmount)}</div>
                    </div>
                     <div class="col-6 text-end">
                        <div class="text-uppercase text-muted" style="font-size: 0.75rem;">Outstanding</div>
                        <div class="fw-bold text-danger fs-6">${formatCurrency(l.remainingBalance)}</div>
                    </div>
                    <div class="col-6">
                        <div class="text-uppercase text-muted" style="font-size: 0.75rem;">Principal Paid</div>
                        <div class="fw-bold text-success">${formatCurrency(principalPaid)}</div>
                    </div>
                    <div class="col-6 text-end">
                        <div class="text-uppercase text-muted" style="font-size: 0.75rem;">Interest Paid</div>
                        <div class="fw-bold text-warning">${formatCurrency(interestPaid)}</div>
                    </div>
                </div>

                <div class="d-flex justify-content-between small text-muted mb-1">
                    <span>Progress</span>
                    <span>${progress.toFixed(1)}%</span>
                </div>
                <div class="progress mb-3" style="height: 6px;">
                    <div class="progress-bar bg-success" role="progressbar" style="width: ${progress}%" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"></div>
                </div>
                
                <div class="d-flex justify-content-between align-items-center pt-2 border-top">
                     <small class="text-muted fw-medium">
                        <i class="bi bi-clock-history"></i> Next Due: ${l.emiDate}th
                     </small>
                     <button class="btn btn-link btn-sm text-danger p-0 text-decoration-none" onclick="deleteLoan('${l.id}')">
                        <small><i class="bi bi-trash"></i> Remove</small>
                     </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderInvestments(list) {
    const container = document.getElementById('investmentsList');
    if (list.length === 0) {
        container.innerHTML = '<div class="text-center py-3 text-muted"><small>No investments</small></div>';
        return;
    }
    container.innerHTML = list.map(i => {
        const profit = i.currentValue - i.investedAmount;
        const profitPercent = i.investedAmount > 0 ? ((profit / i.investedAmount) * 100).toFixed(1) : 0;
        const isProfit = profit >= 0;
        const colorClass = isProfit ? 'text-success' : 'text-danger';
        const icon = isProfit ? 'bi-graph-up-arrow' : 'bi-graph-down-arrow';
        
        const showRoi = (i.type === 'ppf' || i.type === 'pf' || i.type === 'fd') && i.interestRate;
        
        return `
            <div class="list-group-item p-3 border-bottom">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <div>
                        <h6 class="mb-0 fw-bold">${i.name} <span class="badge bg-light text-dark border ms-2">${i.type}</span></h6>
                        ${i.startDate ? `<small class="text-muted" style="font-size: 0.75em;"><i class="bi bi-calendar3"></i> Since ${new Date(i.startDate).toLocaleDateString()}</small>` : ''}
                    </div>
                    <button class="btn btn-sm btn-outline-secondary py-0 px-2" onclick="updateInvestmentValue('${i.id}', ${i.currentValue})">Update Value</button>
                </div>
                
                <div class="row g-2 mb-2">
                    <div class="col-6">
                        <small class="text-muted d-block">Invested</small>
                        <span class="fw-medium">${formatCurrency(i.investedAmount)}</span>
                    </div>
                    <div class="col-6 text-end">
                        <small class="text-muted d-block">Current Value</small>
                        <span class="fw-bold">${formatCurrency(i.currentValue)}</span>
                    </div>
                </div>

                ${(showRoi || i.sipAmount) ? `
                <div class="d-flex gap-3 mb-2 small text-muted bg-light p-2 rounded">
                    ${showRoi ? `<span><strong>ROI:</strong> ${i.interestRate}%</span>` : ''}
                    ${i.sipAmount ? `<span><strong>SIP:</strong> ${formatCurrency(i.sipAmount)} / mo</span>` : ''}
                </div>
                ` : ''}

                <div class="mt-2 pt-2 border-top d-flex justify-content-between align-items-center">
                    <span class="${colorClass} small fw-bold">
                        <i class="bi ${icon}"></i> ${isProfit ? '+' : ''}${formatCurrency(profit)} (${profitPercent}%)
                    </span>
                    <button class="btn btn-link btn-sm text-danger p-0 text-decoration-none" onclick="deleteInvestment('${i.id}')">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderRecurring(list) {
    // 1. Update Dashboard List
    const dashContainer = document.getElementById('dashboardRecurringList');
    const today = new Date();
    const currentPeriod = `${today.getFullYear()}-${today.getMonth()}`;

    if (dashContainer) {
        if (list.length === 0) {
            dashContainer.innerHTML = '<div class="text-center py-3 text-muted small">No active recurring items</div>';
        } else {
            dashContainer.innerHTML = list.map(item => {
                const isProcessed = item.lastProcessedMonth === currentPeriod;
                const statusBadge = isProcessed 
                    ? '<span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill">Paid/Received</span>' 
                    : `<span class="badge bg-warning-subtle text-warning border border-warning-subtle rounded-pill">Due: ${item.day}th</span>`;
                
                const actionBtn = !isProcessed 
                    ? `<button class="btn btn-sm btn-primary ms-2" onclick="processRecurringNow('${item.id}')" title="Process Now">
                         <i class="bi bi-check2-circle"></i> Add Now
                       </button>` 
                    : '';

                const icon = item.type === 'income' ? 'bi-cash-coin text-success' : 'bi-receipt text-danger';

                return `
                    <div class="list-group-item d-flex justify-content-between align-items-center">
                        <div class="d-flex align-items-center gap-3">
                            <div class="fs-4"><i class="bi ${icon}"></i></div>
                            <div>
                                <h6 class="mb-0 fw-bold">${item.name}</h6>
                                <small class="text-muted">${formatCurrency(item.amount)} • ${statusBadge}</small>
                            </div>
                        </div>
                        <div>
                            ${actionBtn}
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    // 2. Update Modal List (if open)
    const modalContainer = document.getElementById('recurringList');
    if (modalContainer) {
        if (list.length === 0) {
            modalContainer.innerHTML = '<div class="text-center py-3 text-muted"><small>No recurring items</small></div>';
        } else {
             modalContainer.innerHTML = list.map(item => {
                return `
                    <div class="list-group-item d-flex justify-content-between align-items-center">
                        <div>
                            <h6 class="mb-0 fw-bold">${item.name}</h6>
                            <small class="text-muted">${item.type} • ${formatCurrency(item.amount)} • Day: ${item.day}</small>
                        </div>
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteRecurring('${item.id}')">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                `;
            }).join('');
        }
    }
}

async function checkLoanEMIs() {
    if (__processingLoanEmi) return;
    __processingLoanEmi = true;
    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth(); // 0-11
    const currentYear = today.getFullYear();

    for (const loan of loans) {
        if (loan.status !== 'active' || loan.remainingBalance <= 0) continue;

        // Check if EMI is due:
        // 1. Day matches or passed
        // 2. Not paid this month (check lastEmiPaidMonth)
        // 3. Loan start date is in past
        
        const lastPaid = loan.lastEmiPaidMonth; // We should store "Year-Month" string to be safe, or just check logic
        // Assuming lastEmiPaidMonth is stored as "YYYY-MM" string for robustness, or just timestamp
        // Let's use a composite string for simple checking: `${currentYear}-${currentMonth}`
        
        const currentPeriod = `${currentYear}-${currentMonth}`;
        
        // Safety: If lastEmiPaidMonth is null, it's never paid.
        // Also check if start date is passed
        const startDate = new Date(loan.startDate);
        if (startDate > today) continue;

        if (currentDay >= loan.emiDate && loan.lastEmiPaidMonth !== currentPeriod) {
            // Process EMI
            try {
                const uniqueKey = `emi_${loan.id}_${currentPeriod}`;
                await addUniqueRecord(uniqueKey, {
                    type: 'expense',
                    amount: loan.emiAmount,
                    category: 'loan',
                    date: today.toISOString().split('T')[0],
                    description: `Auto-EMI: ${loan.name}`,
                    timestamp: serverTimestamp(),
                    createdBy: currentUser.uid,
                    isAutoEmi: true,
                    loanId: loan.id,
                    period: currentPeriod
                });
                await cleanupDuplicateRecords('loanId', loan.id, currentPeriod, uniqueKey);

                // 2. Update Loan with Interest Logic
                const annualRate = loan.interestRate || 0;
                const monthlyRate = annualRate / 12 / 100;
                
                const interestForMonth = loan.remainingBalance * monthlyRate;
                let principalForMonth = loan.emiAmount - interestForMonth;
                if (principalForMonth < 0) principalForMonth = 0;
                
                const newBalance = loan.remainingBalance - principalForMonth;
                const status = newBalance <= 0 ? 'completed' : 'active';
                
                // Accumulate totals (handle if undefined for old loans)
                const currentInterestPaid = loan.totalInterestPaid || 0;
                const currentPrincipalPaid = loan.totalPrincipalPaid || 0;
                
                await updateDoc(doc(db, 'financialLoans', loan.id), {
                    remainingBalance: newBalance,
                    lastEmiPaidMonth: currentPeriod,
                    status: status,
                    totalInterestPaid: currentInterestPaid + interestForMonth,
                    totalPrincipalPaid: currentPrincipalPaid + principalForMonth
                });

                showToast(`EMI deducted for ${loan.name}`);
            } catch (err) {
                console.error("Error processing EMI:", err);
            }
        }
    }
    __processingLoanEmi = false;
}

async function checkRecurringItems() {
    if (__processingRecurring) return;
    __processingRecurring = true;
    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth(); // 0-11
    const currentYear = today.getFullYear();
    const currentPeriod = `${currentYear}-${currentMonth}`;

    for (const item of recurringItems) {
        if (!item.active) continue;

        // Check if due:
        // 1. Day matches or passed
        // 2. Not processed this month
        
        if (currentDay >= item.day && item.lastProcessedMonth !== currentPeriod) {
            try {
                const uniqueKey = `rec_${item.id}_${currentPeriod}`;
                await addUniqueRecord(uniqueKey, {
                    type: item.type,
                    amount: item.amount,
                    category: item.type === 'income' ? 'salary' : 'utilities',
                    date: today.toISOString().split('T')[0],
                    description: `Auto-Recurring: ${item.name}`,
                    timestamp: serverTimestamp(),
                    createdBy: currentUser.uid,
                    isRecurring: true,
                    recurringId: item.id,
                    period: currentPeriod
                });
                await cleanupDuplicateRecords('recurringId', item.id, currentPeriod, uniqueKey);

                // Update Item
                await updateDoc(doc(db, 'financialRecurring', item.id), {
                    lastProcessedMonth: currentPeriod
                });

                showToast(`Recurring ${item.type}: ${item.name} processed`);
            } catch (err) {
                console.error("Error processing recurring item:", err);
            }
        }
    }
    __processingRecurring = false;
}

async function checkInvestmentSIPs() {
    if (__processingSip) return;
    __processingSip = true;
    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const currentPeriod = `${currentYear}-${currentMonth}`;

    for (const inv of investments) {
        if (!inv.sipAmount || inv.sipAmount <= 0) continue;

        // Check start date if exists
        if (inv.startDate) {
            const start = new Date(inv.startDate);
            if (start > today) continue;
        }

        // Check if due:
        // 1. Day matches or passed
        // 2. Not processed this month
        const sipDay = inv.sipDate || 1;
        
        if (currentDay >= sipDay && inv.lastSipPaidMonth !== currentPeriod) {
            try {
                const uniqueKey = `sip_${inv.id}_${currentPeriod}`;
                await addUniqueRecord(uniqueKey, {
                    type: 'expense',
                    amount: inv.sipAmount,
                    category: 'investment',
                    date: today.toISOString().split('T')[0],
                    description: `Auto-SIP: ${inv.name}`,
                    timestamp: serverTimestamp(),
                    createdBy: currentUser.uid,
                    isAutoSip: true,
                    investmentId: inv.id,
                    period: currentPeriod
                });
                await cleanupDuplicateRecords('investmentId', inv.id, currentPeriod, uniqueKey);

                // 2. Update Investment
                // Assume 1:1 growth for cash injection (Amount + SIP, Current + SIP)
                const newInvested = (inv.investedAmount || 0) + inv.sipAmount;
                const newCurrent = (inv.currentValue || 0) + inv.sipAmount;

                await updateDoc(doc(db, 'financialInvestments', inv.id), {
                    investedAmount: newInvested,
                    currentValue: newCurrent,
                    lastSipPaidMonth: currentPeriod,
                    lastUpdated: serverTimestamp()
                });

                showToast(`SIP deducted for ${inv.name}`);
            } catch (err) {
                console.error("Error processing SIP:", err);
            }
        }
    }
    __processingSip = false;
}

async function checkInvestmentInterest() {
    const today = new Date();
    // Determine the "Current Financial Year End" we have passed
    // If today is March 31, 2025 or later, the 2025 interest is due.
    // If today is Jan 2025, the last due was 2024.
    
    const passedFinYear = (today.getMonth() > 2 || (today.getMonth() === 2 && today.getDate() >= 31)) 
        ? today.getFullYear() 
        : today.getFullYear() - 1;

    for (const inv of investments) {
        // Only for PPF / PF / FD and if Interest Rate is set
        if ((inv.type !== 'ppf' && inv.type !== 'pf' && inv.type !== 'fd') || !inv.interestRate) continue;

        const lastPaidYear = inv.lastInterestPaidYear || 0;

        // If we have passed a financial year end that hasn't been paid yet
        if (passedFinYear > lastPaidYear) {
            try {
                // Calculate Interest
                // Simple logic: Current Value * (ROI / 100)
                // Since this runs once a year, it acts as annual compounding
                const interestAmount = (inv.currentValue || 0) * (inv.interestRate / 100);
                
                if (interestAmount <= 0) continue;

                // 1. Update Investment Value
                const newCurrent = (inv.currentValue || 0) + interestAmount;

                await updateDoc(doc(db, 'financialInvestments', inv.id), {
                    currentValue: newCurrent,
                    lastInterestPaidYear: passedFinYear,
                    lastUpdated: serverTimestamp()
                });

                // 2. Add a Transaction Record (Type: 'Income' but maybe special category?)
                // Or 'Adjustment'? Let's use 'income' -> 'interest'
                // But wait, if we add 'income', it will increase the Cash Balance in updateDashboard
                // because: balance = totalIncome - ...
                // PPF interest is NOT cash in hand.
                // So we should use a type that is NOT 'income' or filter it out.
                // Let's use type: 'growth' or 'interest_credit' which updateDashboard ignores for Cash Balance.
                
                await addDoc(collection(db, 'financialRecords'), {
                    type: 'interest_credit', // Custom type, ignored by cash balance calc
                    amount: interestAmount,
                    category: 'investment',
                    date: today.toISOString().split('T')[0],
                    description: `Annual Interest Credit: ${inv.name} (${inv.interestRate}%)`,
                    timestamp: serverTimestamp(),
                    createdBy: currentUser.uid
                });

                showToast(`Interest credited for ${inv.name}: ${formatCurrency(interestAmount)}`);
            } catch (err) {
                console.error("Error processing Interest:", err);
            }
        }
    }
}

function filterTransactions(type) {
    if (type === 'all') {
        __trxPage = 1;
        renderTransactions(transactions);
    } else if (type === 'loan') {
        // Show explicit loan types AND expenses categorized as loan
        const filtered = transactions.filter(t => 
            t.type === 'loan' || 
            (t.type === 'expense' && t.category === 'loan')
        );
        __trxPage = 1;
        renderTransactions(filtered);
    } else if (type === 'expense') {
        // Show only expenses that are NOT loans (exclude legacy loan-expenses)
        const filtered = transactions.filter(t => 
            t.type === 'expense' && t.category !== 'loan'
        );
        __trxPage = 1;
        renderTransactions(filtered);
    } else {
        const filtered = transactions.filter(t => t.type === type);
        __trxPage = 1;
        renderTransactions(filtered);
    }
}

function updateCharts() {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    
    // Group expenses by category (Include EMIs now to match Total Expenses card)
    const expenses = transactions.filter(t => t.type === 'expense' || t.type === 'loan');
    const categoryTotals = {};
    
    expenses.forEach(t => {
        categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
    });

    const labels = Object.keys(categoryTotals).map(k => k.charAt(0).toUpperCase() + k.slice(1));
    const data = Object.values(categoryTotals);
    const backgroundColors = Object.keys(categoryTotals).map(k => 
        (categoryConfig[k] || categoryConfig.other).color
    );

    if (expenseChart) {
        expenseChart.destroy();
    }

    if (data.length === 0) {
        // Handle empty chart
        return;
    }

    expenseChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: 20
                    }
                }
            },
            cutout: '70%'
        }
    });
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR'
    }).format(amount);
}

function formatCompact(amount) {
    return new Intl.NumberFormat('en-IN', {
        notation: "compact",
        compactDisplay: "short",
        maximumFractionDigits: 1
    }).format(amount);
}

function animateValue(id, end) {
    const obj = document.getElementById(id);
    const start = 0; // You could store previous value if needed
    const duration = 1000;
    let startTimestamp = null;
    
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const current = Math.floor(progress * (end - start) + start);
        obj.innerHTML = formatCurrency(current);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerHTML = formatCurrency(end);
        }
    };
    window.requestAnimationFrame(step);
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

async function handleLogout(e) {
    e.preventDefault();
    try {
        await auth.signOut();
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Error signing out:', error);
    }
}
