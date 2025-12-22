// Update the imports to use the correct paths
import { auth, db } from './firebase-config.js';
import { 
    collection, 
    query, 
    where, 
    orderBy, 
    limit, 
    onSnapshot, 
    updateDoc,
    doc,
    getDocs,
    writeBatch,
    getDoc,
    Timestamp,
    addDoc,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const notificationsDropdown = document.getElementById('notificationsDropdownContainer');
const userMenuDropdown = document.getElementById('userMenuDropdown');

// Global state for notifications
let windowNotificationSources = { user: [], suggestion: [], message: [], comment: [] };
// Use a new key to reset state for the user and ensure they see notifications
const NOTIF_STORAGE_KEY = 'lastNotificationReadTime_v3';
let lastReadTimestamp = parseInt(localStorage.getItem(NOTIF_STORAGE_KEY) || '0');
if (isNaN(lastReadTimestamp)) lastReadTimestamp = 0;

// Helper to safely get date object
function getSafeDate(timestamp) {
    if (!timestamp) return new Date();
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
        return timestamp.toDate();
    }
    // Handle string/number timestamps (e.g. from JSON or other sources)
    return new Date(timestamp);
}

// Handle notifications
function initializeNotifications() {
    const limits = 5;
    
    // Listen to Users
    onSnapshot(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(limits)), (snap) => {
        updateGlobalNotifications('user', snap);
    });

    // Listen to Suggestions
    onSnapshot(query(collection(db, 'suggestions'), orderBy('createdAt', 'desc'), limit(limits)), (snap) => {
        updateGlobalNotifications('suggestion', snap);
    });

    // Listen to Contact Messages
    onSnapshot(query(collection(db, 'contact_messages'), orderBy('timestamp', 'desc'), limit(limits)), (snap) => {
        updateGlobalNotifications('message', snap);
    });

    // Listen to Job Comments
    onSnapshot(query(collection(db, 'jobComments'), orderBy('timestamp', 'desc'), limit(limits)), (snap) => {
        updateGlobalNotifications('comment', snap);
    });

    // Handle "Mark all read" button click
    const markReadBtn = document.getElementById('markAllReadBtn');
    if (markReadBtn) {
        // Remove old listener to avoid duplicates if re-initialized
        const newBtn = markReadBtn.cloneNode(true);
        markReadBtn.parentNode.replaceChild(newBtn, markReadBtn);
        newBtn.addEventListener('click', markAllAsRead);
    }
}

function updateGlobalNotifications(type, snapshot) {
    const items = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        // Use the raw timestamp, let renderNotifications handle conversion
        let timestamp = data.createdAt || data.timestamp;

        let message = '';
        let title = '';
        
        if (type === 'user') {
            title = 'New User';
            message = `${data.displayName || data.email || 'A new user'} joined`;
        } else if (type === 'suggestion') {
            title = 'New Suggestion';
            message = `${data.subject || 'Suggestion'} from ${data.name || 'Anonymous'}`;
        } else if (type === 'message') {
            title = 'New Message';
            message = `${data.subject || 'Message'} from ${data.name || 'Anonymous'}`;
        } else if (type === 'comment') {
            title = 'New Comment';
            const target = data.postTitle || (data.jobId ? 'Job #' + data.jobId.substring(0,6) : 'a post');
            message = `${data.userName || 'Someone'} commented on ${target}`;
        }

        items.push({
            id: doc.id,
            type,
            title,
            message,
            timestamp,
            data
        });
    });
    
    windowNotificationSources[type] = items;
    renderNotifications();
}

function renderNotifications() {
    let allItems = [];
    Object.values(windowNotificationSources).forEach(list => allItems.push(...list));
    
    // Sort by timestamp desc
    allItems.sort((a, b) => {
        const t1 = getSafeDate(a.timestamp);
        const t2 = getSafeDate(b.timestamp);
        return t2 - t1;
    });
    
    // Limit to 10
    allItems = allItems.slice(0, 10);
    
    const listEl = document.getElementById('notificationsList');
    const badgeEl = document.getElementById('notificationBadge');
    
    if (!listEl) return;
    
    listEl.innerHTML = '';
    
    let unreadCount = 0;
    
    if (allItems.length === 0) {
        listEl.innerHTML = '<div class="p-3 text-center text-muted small">No notifications</div>';
    } else {
        allItems.forEach(item => {
            const time = getSafeDate(item.timestamp);
            const isUnread = time.getTime() > lastReadTimestamp;
            if (isUnread) unreadCount++;
            
            const div = document.createElement('a');
            div.href = '#';
            div.className = `list-group-item list-group-item-action border-0 py-3 ${isUnread ? 'bg-light fw-bold' : ''}`;
            div.innerHTML = `
                <div class="d-flex align-items-start">
                    <div class="me-3 mt-1">
                        <span class="badge rounded-pill ${getBadgeClass(item.type)} p-2">
                            <i class="bi ${getIconClass(item.type)}"></i>
                        </span>
                    </div>
                    <div class="flex-grow-1">
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <h6 class="mb-0 small fw-bold text-uppercase ${isUnread ? 'text-dark' : 'text-muted'}">${item.title}</h6>
                            <small class="text-muted" style="font-size: 0.7rem;">${formatTimestamp(item.timestamp)}</small>
                        </div>
                        <p class="mb-0 small ${isUnread ? 'text-dark' : 'text-muted'}">${item.message}</p>
                    </div>
                    ${isUnread ? '<span class="ms-2 p-1 bg-danger border border-light rounded-circle"></span>' : ''}
                </div>
            `;
            listEl.appendChild(div);
        });
    }
    
    if (badgeEl) {
        badgeEl.textContent = unreadCount;
        
        // Force show if unreadCount > 0
        if (unreadCount > 0) {
            badgeEl.style.setProperty('display', 'block', 'important');
            badgeEl.classList.remove('d-none');
        } else {
            badgeEl.style.setProperty('display', 'none', 'important');
        }
        
        // Debug info in console
        console.log(`Notifications: ${allItems.length} total, ${unreadCount} unread. Last read: ${new Date(lastReadTimestamp).toLocaleString()}`);
    }
}

function getBadgeClass(type) {
    switch(type) {
        case 'user': return 'bg-success';
        case 'suggestion': return 'bg-info';
        case 'message': return 'bg-warning';
        case 'comment': return 'bg-primary';
        default: return 'bg-secondary';
    }
}

function getIconClass(type) {
    switch(type) {
        case 'user': return 'bi-person-plus';
        case 'suggestion': return 'bi-lightbulb';
        case 'message': return 'bi-envelope';
        case 'comment': return 'bi-chat-dots';
        default: return 'bi-bell';
    }
}

function markAllAsRead() {
    lastReadTimestamp = Date.now();
    localStorage.setItem(NOTIF_STORAGE_KEY, lastReadTimestamp.toString());
    renderNotifications();
}

function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    
    let date;
    try {
        if (timestamp && typeof timestamp.toDate === 'function') {
            date = timestamp.toDate();
        } else if (timestamp instanceof Date) {
            date = timestamp;
        } else {
            // Try to parse string or number
            date = new Date(timestamp);
        }
    } catch (e) {
        console.warn('Error formatting timestamp:', e);
        return '';
    }
    
    // Check if date is valid
    if (isNaN(date.getTime())) return '';

    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
}

function capitalizeFirstLetter(str) {
    if (!str) return '';
    if (str.length <= 5) {
        return str.toUpperCase();
    } else {
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }
}

// Initialize stats cards
function initializeStatsCards() {
    const statsCards = {
        jobs: document.querySelector('.stats-card.bg-primary .card-info h3'),
        users: document.querySelector('.stats-card.bg-success .card-info h3'),
        news: document.querySelector('.stats-card.bg-warning .card-info h3'),
        views: document.querySelector('.stats-card.bg-danger .card-info h3')
    };

    const growthIndicators = {
        jobs: document.querySelector('.stats-card.bg-primary .card-growth'),
        users: document.querySelector('.stats-card.bg-success .card-growth'),
        news: document.querySelector('.stats-card.bg-warning .card-growth'),
        views: document.querySelector('.stats-card.bg-danger .card-growth')
    };

    // Show loading state
    Object.values(statsCards).forEach(card => {
        card.innerHTML = '<div class="spinner-border spinner-border-sm" role="status"></div>';
    });

    const newsRef = collection(db, 'news');
    const newsQ = query(newsRef);
    getDocs(newsQ).then(snapshot => {
        let totalViews = 0;
        snapshot.forEach(doc => {
            const data = doc.data();
            totalViews += data.views || 0;
        });
        document.querySelector('.stats-card.bg-info .card-info h3').textContent = totalViews;
    });
  

    // Get current and last month dates
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // Monitor jobs collection
    const jobsQuery = query(collection(db, 'jobs'));
    const jobsLastMonthQuery = query(collection(db, 'jobs'), where('createdAt', '<', thisMonth));

    // Monitor active users
    const usersQuery = query(collection(db, 'users'));
    const usersLastMonthQuery = query(collection(db, 'users'),
        where('updatedAt', '<', thisMonth)
    );

    // Monitor news articles
    const newsQuery = query(collection(db, 'news'));
    const newsLastMonthQuery = query(collection(db, 'news'), where('createdAt', '<', thisMonth));

    
    // Update stats in real-time
    onSnapshot(jobsQuery, async (snapshot) => {
        try {
            const currentCount = snapshot.size;
            const lastMonthSnapshot = await getDocs(jobsLastMonthQuery);
            const lastMonthCount = lastMonthSnapshot.size;
            updateStats('jobs', currentCount, lastMonthCount, statsCards.jobs, growthIndicators.jobs);
        } catch (error) {
            console.error('Error fetching jobs stats:', error);
            showError(statsCards.jobs, growthIndicators.jobs);
        }
    });

    onSnapshot(usersQuery, async (snapshot) => {
        try {
            const currentCount = snapshot.size;
            const lastMonthSnapshot = await getDocs(usersLastMonthQuery);
            const lastMonthCount = lastMonthSnapshot.size;
            updateStats('users', currentCount, lastMonthCount, statsCards.users, growthIndicators.users);
        } catch (error) {
            console.error('Error fetching users stats:', error);
            showError(statsCards.users, growthIndicators.users);
        }
    });

    onSnapshot(newsQuery, async (snapshot) => {
        try {
            const currentCount = snapshot.size;
            const lastMonthSnapshot = await getDocs(newsLastMonthQuery);
            const lastMonthCount = lastMonthSnapshot.size;
            updateStats('news', currentCount, lastMonthCount, statsCards.news, growthIndicators.news);
        } catch (error) {
            console.error('Error fetching news stats:', error);
            showError(statsCards.news, growthIndicators.news);
        }
    });

    // Replace the comments query with job views query
    const jobViewsQuery = query(collection(db, 'jobs'));
    const jobViewsLastMonthQuery = query(collection(db, 'jobs'), where('createdAt', '<', thisMonth));

    onSnapshot(jobViewsQuery, async (snapshot) => {
        try {
            const currentViews = snapshot.docs.reduce((sum, doc) => sum + (doc.data().views || 0), 0);
            const lastMonthSnapshot = await getDocs(jobViewsLastMonthQuery);
            const lastMonthViews = lastMonthSnapshot.docs.reduce((sum, doc) => sum + (doc.data().views || 0), 0);
            updateStats('views', currentViews, lastMonthViews, statsCards.views, growthIndicators.views);
        } catch (error) {
            console.error('Error fetching job views stats:', error);
            showError(statsCards.views, growthIndicators.views);
        }
    });
}

function updateStats(type, currentCount, lastMonthCount, cardElement, growthElement) {
    // Calculate growth percentage
    const growth = lastMonthCount === 0 ? 100 : ((currentCount - lastMonthCount) / lastMonthCount) * 100;
    const isPositive = growth >= 0;

    // Update count
    cardElement.textContent = currentCount.toLocaleString();

    // Update growth indicator
    growthElement.innerHTML = `
        <i class="bi bi-arrow-${isPositive ? 'up' : 'down'}"></i> 
        ${Math.abs(growth).toFixed(1)}%
    `;
    growthElement.className = `card-growth ${isPositive ? 'positive' : 'negative'}`;
}

function showError(cardElement, growthElement) {
    cardElement.textContent = 'Error';
    growthElement.innerHTML = '<i class="bi bi-exclamation-triangle"></i>';
    growthElement.className = 'card-growth negative';
}

// Apply Stats
async function initializeApplyStats() {
    // Show loading state
    ['totalApplyTotal', 'totalCommentsTotal', 'totalSuggestionsTotal', 'monthlyJobViewsTotal'].forEach(id => {
        const valEl = document.getElementById(id);
        if (valEl) valEl.innerHTML = '<div class="spinner-border spinner-border-sm" role="status"></div>';
    });

    try {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        // 1. Total Applies (Sum of applyCount from all jobs)
        // Since we can't easily query "sum of a field" across multiple collections without reading all docs,
        // we will read all docs from jobs, bankJobs, governmentJobs.
        // This might be expensive for large datasets, but it's the only way without aggregation functions (which might not be enabled or require specific setup).
        
        let totalApplies = 0;
        const jobCollections = ['jobs', 'bankJobs', 'governmentJobs'];
        
        await Promise.all(jobCollections.map(async (colName) => {
            const snapshot = await getDocs(collection(db, colName));
            snapshot.forEach(doc => {
                totalApplies += (doc.data().applyCount || 0);
            });
        }));

        updateApplyStatsCard('totalApplyTotal', totalApplies, "Total Applies");

        // 2. Total Comments (Count of jobComments docs)
        const commentsSnapshot = await getDocs(collection(db, 'jobComments'));
        updateApplyStatsCard('totalCommentsTotal', commentsSnapshot.size, "Total Comments");

        // 3. Total Suggestions (Count of suggestions docs)
        const suggestionsSnapshot = await getDocs(collection(db, 'suggestions'));
        updateApplyStatsCard('totalSuggestionsTotal', suggestionsSnapshot.size, "Total Suggestions");

        // 4. Monthly Job Views
        const monthlyViewsQuery = query(
            collection(db, 'jobViews'), 
            where('timestamp', '>=', Timestamp.fromDate(monthStart))
        );
        const monthlyViewsSnapshot = await getDocs(monthlyViewsQuery);
        updateApplyStatsCard('monthlyJobViewsTotal', monthlyViewsSnapshot.size, "Monthly Job Views");


    } catch (error) {
        console.error('Error initializing secondary stats:', error);
        ['totalApplyTotal', 'totalCommentsTotal', 'totalSuggestionsTotal', 'monthlyJobViewsTotal'].forEach(id => {
            const valEl = document.getElementById(id);
            if (valEl) valEl.textContent = '0';
        });
    }
}

function updateApplyStatsCard(valId, value, label) {
    const valEl = document.getElementById(valId);
    if (valEl) {
        valEl.textContent = value.toLocaleString();
        const container = valEl.closest('.card-info');
        if (container) {
            const labelEl = container.querySelector('p');
            if (labelEl) labelEl.textContent = label;
        }
        
        // Ensure growth element is visible (will be updated by updateGrowthPercentage)
        const card = valEl.closest('.stats-card');
        if (card) {
            const growthEl = card.querySelector('.card-growth');
            if (growthEl) growthEl.style.display = 'block';
        }
    }
}

// Helper function to track a job application (for use in candidate app)
window.trackJobApply = async (jobId, collectionName = 'jobs') => {
    try {
        const jobRef = doc(db, collectionName, jobId);
        
        const jobSnap = await getDoc(jobRef);
        if (jobSnap.exists()) {
            const currentCount = jobSnap.data().applyCount || 0;
            
            // 1. Update job document count
            await updateDoc(jobRef, {
                applyCount: currentCount + 1,
                lastAppliedAt: serverTimestamp()
            });
            
            // 2. Add to job_applications history
            try {
                await addDoc(collection(db, 'job_applications'), {
                    jobId: jobId,
                    jobCollection: collectionName,
                    timestamp: serverTimestamp(),
                    appliedAt: new Date().toISOString()
                });
            } catch (err) {
                console.error("Error creating application history:", err);
            }

            console.log(`Application for job ${jobId} in ${collectionName} tracked successfully.`);
            
            // Refresh stats if function is available
            if (typeof initializeApplyStats === 'function') {
                initializeApplyStats(); 
            }
        } else {
            console.warn(`Job ${jobId} not found in collection ${collectionName}`);
        }
    } catch (error) {
        console.error('Error tracking job apply:', error);
    }
};

// Helper function to generate test data (for debugging)
window.generateTestApplyData = async () => {
    console.log('Generating test data for applyCount field across ALL collections...');
    const collections = ['jobs', 'bankJobs', 'governmentJobs'];
    
    let updatedCount = 0;
    let historyCount = 0;
    const now = new Date();

    for (const colName of collections) {
        const snapshot = await getDocs(collection(db, colName));
        
        if (snapshot.empty) {
            console.log(`No jobs found in ${colName} to update.`);
            continue;
        }

        const batch = writeBatch(db);
        let batchCount = 0;

        for (const docSnapshot of snapshot.docs) {
            // Assign random apply count between 0 and 50
            const randomApplies = Math.floor(Math.random() * 51);
            
            // Assign random date within last 7 days for some, older for others
            const randomDays = Math.floor(Math.random() * 10); // 0-9 days ago
            const randomDate = new Date(now);
            randomDate.setDate(randomDate.getDate() - randomDays);
            
            // Update job doc fields
            batch.update(docSnapshot.ref, { 
                applyCount: randomApplies,
                lastAppliedAt: Timestamp.fromDate(randomDate)
            });
            
            // Create a history entry in job_applications to match this "last apply"
            // This ensures stats work correctly for Today/Yesterday
            if (randomApplies > 0) {
                 await addDoc(collection(db, 'job_applications'), {
                    jobId: docSnapshot.id,
                    jobCollection: colName,
                    timestamp: Timestamp.fromDate(randomDate),
                    appliedAt: randomDate.toISOString()
                });
                historyCount++;
            }

            batchCount++;
            updatedCount++;
        }

        if (batchCount > 0) {
            await batch.commit();
            console.log(`Updated ${batchCount} jobs in ${colName} with random apply counts and timestamps.`);
        }
    }

    if (updatedCount > 0) {
        console.log(`Test data generated: ${updatedCount} jobs updated, ${historyCount} history entries created. Refreshing stats...`);
        initializeApplyStats();
    } else {
        console.log('No jobs found in any collection to generate test data for.');
    }
};


// Add this function to handle jobs overview
async function initializeJobsOverview() {
    const jobsRef = collection(db, 'jobs');
    const statsElements = {
        private: document.querySelector('.jobs-stats .stat-item:nth-child(1) .stat-value'),
        govt: document.querySelector('.jobs-stats .stat-item:nth-child(2) .stat-value'),
        bank: document.querySelector('.jobs-stats .stat-item:nth-child(3) .stat-value')
    };

    // Get date ranges
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now); // Create a new date object
    weekStart.setDate(now.getDate() - now.getDay()); // Modify the copy instead
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    // Update stats based on selected time range
    async function updateJobStats(startDate) {
        try {
            // Convert dates to ISO string format
            const firestoreStartDate = startDate.toISOString();
            const firestoreEndDate = new Date().toISOString();
            
            
            const jobsQuery = query(jobsRef,
                where('createdAt', '>=', firestoreStartDate),
                where('createdAt', '<=', firestoreEndDate)
            );

            const snapshot = await getDocs(jobsQuery);
            
            const stats = {
                private: 0,
                govt: 0,
                bank: 0
            };

            snapshot.forEach(doc => {
                const jobData = doc.data();
                
                switch(jobData.jobType) {
                    case 'private':
                        stats.private++;
                        break;
                    case 'govt':
                        stats.govt++;
                        break;
                    case 'bank':
                        stats.bank++;
                        break;
                }
            });

            console.log('Calculated stats:', stats);

            // Update UI
            Object.keys(stats).forEach(type => {
                if (statsElements[type]) {
                    statsElements[type].textContent = stats[type];
                }
            });

            // Update chart
            updateJobsChart(snapshot.docs.map(doc => doc.data()));
        } catch (error) {
            console.error('Error fetching job stats:', error);
            Object.keys(statsElements).forEach(type => {
                statsElements[type].textContent = 'Error';
            });
        }
    }

    // Update chart date handling
    function updateJobsChart(jobs) {
        const ctx = document.getElementById('jobsChart').getContext('2d');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        const data = {
            private: new Array(6).fill(0),
            govt: new Array(6).fill(0),
            bank: new Array(6).fill(0)
        };

        // Get last 6 months
        const months = [];
        for (let i = 5; i >= 0; i--) {
            const date = new Date();
            date.setMonth(date.getMonth() - i);
            months.push(monthNames[date.getMonth()]);
        }

        // Group jobs by month and type
        jobs.forEach(job => {
            const jobDate = new Date(job.createdAt); // Parse string timestamp
            const monthIndex = months.indexOf(monthNames[jobDate.getMonth()]);
            if (monthIndex !== -1) {
                data[job.jobType][monthIndex]++;
            }
        });

        // Properly handle chart destruction
        const chartStatus = Chart.getChart(ctx.canvas);
        if (chartStatus !== undefined) {
            chartStatus.destroy();
        }

        // Create new chart
        const newChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: months,
                datasets: [
                    {
                        label: 'Private Jobs',
                        data: data.private,
                        backgroundColor: 'rgba(54, 162, 235, 0.7)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Govt Jobs',
                        data: data.govt,
                        backgroundColor: 'rgba(75, 192, 192, 0.7)',
                        borderColor: 'rgba(75, 192, 192, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Bank Jobs',
                        data: data.bank,
                        backgroundColor: 'rgba(255, 159, 64, 0.7)',
                        borderColor: 'rgba(255, 159, 64, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    // Add event listeners for time range buttons
    document.querySelectorAll('.dropdown-menu .dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const range = e.target.textContent.trim(); // Add trim() to clean up whitespace
            let startDate;

            switch(range) {
                case 'Today':
                    startDate = today;
                    break;
                case 'This Week':
                    startDate = weekStart;
                    break;
                case 'This Month':
                    startDate = monthStart;
                    break;
                case 'This Year':
                    startDate = yearStart;
                    break;
            }

            // Update both the stats and the button text
            updateJobStats(startDate);
            // Use more specific selector to target the jobs overview dropdown
            document.querySelector('.jobs-overview-card .dropdown-toggle').textContent = range;
        });
    });

    // Initial load with 'This Month' selected
    updateJobStats(monthStart);
    // Set initial dropdown text
    document.querySelector('.jobs-overview-card .dropdown-toggle').textContent = 'This Month';
}


// Update the auth.onAuthStateChanged handler
auth.onAuthStateChanged((user) => {
    function handleLogout(e) {
        e.preventDefault();
        auth.signOut().then(() => {
            window.location.href = '/';
        });
    }
    
    if (user) {
         // Existing code for logged-in users
        const userRef = doc(db, 'users', user.uid);
        getDoc(userRef).then((doc) => {
            const userData = doc.data() || {};
            const firstName = capitalizeFirstLetter(userData.firstName || user.email.split('@')[0]);
            const profileImage = userData.profileImageUrl || user.profileImageUrl || '/images/default.webp';
            const userRole = userData.role || 'User';
            
            setupRoleBasedMenu(userRole);

            // Update top navigation user menu
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
            }

            // Update sidebar footer
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

            // Add event listeners for both logout buttons
            const logoutBtn = document.getElementById('logoutBtn');
            if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
            
            // Initialize features
            if (userRole.toLowerCase() === 'admin') {
                initializeNotifications();
            } else {
                 // Hide notifications for non-admin
                 const notifContainer = document.getElementById('notificationsDropdownContainer');
                 if (notifContainer) notifContainer.style.display = 'none';
            }
            
            initializeStatsCards();
            initializeJobsOverview();
            setupStatsListeners();
            // Initial update
            updateDailyJobCounts();
            
            // Set up interval to update daily (every hour)
            setInterval(updateDailyJobCounts, 3600000);
            initializeApplyStats();
            setInterval(initializeApplyStats, 3600000);
        });

    } else {
        // Hide all menu items except dashboard
        const adminEmployerContent = document.getElementById('adminEmployerContent');
        const adminOnlyContent = document.getElementById('adminOnlyContent');
        const adminOnlyJobs = document.getElementById('adminOnlyJobs');
        
        if (adminEmployerContent) adminEmployerContent.style.display = 'none';
        if (adminOnlyContent) adminOnlyContent.style.display = 'none';
        if (adminOnlyJobs) adminOnlyJobs.style.display = 'none';

        // Hide user profile and notifications
        const userMenuDropdown = document.getElementById('userMenuDropdown');
        const notificationsDropdown = document.getElementById('notificationsDropdownContainer');
        
        if (userMenuDropdown) userMenuDropdown.style.display = 'none';
        if (notificationsDropdown) notificationsDropdown.style.display = 'none';

        // Show login button in the header
        const topNavActions = document.querySelector('.top-nav-actions');
        if (topNavActions) {
            topNavActions.innerHTML = `
                <a href="login.html" class="btn btn-primary">
                    <i class="bi bi-box-arrow-in-right me-2"></i>Login
                </a>
            `;
        }
    }
});

function setupStatsListeners() {
    // News views listener
    const newsRef = collection(db, 'news');
    onSnapshot(query(newsRef), snapshot => {
        let totalViews = 0;
        snapshot.forEach(doc => {
            const data = doc.data();
            totalViews += data.views || 0;
        });
        document.querySelector('.stats-card.bg-info .card-info h3').textContent = totalViews;
    });
}

// Function to handle role-based menu visibility
// Add this at the beginning of the file
document.addEventListener('DOMContentLoaded', () => {
    // Get user role from localStorage
    const userRole = localStorage.getItem('userRole');
    if (userRole) {
        // Initialize menu visibility
        setupRoleBasedMenu(userRole);
        updateDailyJobCounts();
        
        // Initialize Apply Stats if function exists
        if (typeof initializeApplyStats === 'function') {
            initializeApplyStats();
        }
    }
});

// Make sure this function is exported
export function setupRoleBasedMenu(userRole) {
    const adminEmployerContent = document.getElementById('adminEmployerContent');
    const adminOnlyContent = document.getElementById('adminOnlyContent');
    const adminOnlyJobs = document.getElementById('adminOnlyJobs');
    const quickActionsSection = document.getElementById('quickActionsSection');

    if (!adminEmployerContent || !adminOnlyContent || !adminOnlyJobs) {
        console.error('Menu elements not found');
        return;
    }

    switch(userRole.toLowerCase()) {
        case 'admin':
            // Show all content for admin
            adminEmployerContent.style.display = 'block';
            adminOnlyContent.style.display = 'block';
            adminOnlyJobs.style.display = 'block';
            if (quickActionsSection) quickActionsSection.style.display = 'block';
            break;
        case 'employer':
            // Show limited content for employer
            adminEmployerContent.style.display = 'block';
            adminOnlyContent.style.display = 'none';
            adminOnlyJobs.style.display = 'none';
            if (quickActionsSection) quickActionsSection.style.display = 'none';
            break;
        case 'user':
            // Show only dashboard for regular users
            adminEmployerContent.style.display = 'none';
            adminOnlyContent.style.display = 'none';
            adminOnlyJobs.style.display = 'none';
            if (quickActionsSection) quickActionsSection.style.display = 'none';
            break;
        default:
            console.warn('Unknown user role:', userRole);
            adminEmployerContent.style.display = 'none';
            adminOnlyContent.style.display = 'none';
            adminOnlyJobs.style.display = 'none';
            if (quickActionsSection) quickActionsSection.style.display = 'none';
    }
}


    async function updateDailyJobCounts() {
    // Show loading state
    ['todayJobsCount', 'yesterdayJobsCount', 'weeklyJobsCount'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<div class="spinner-border spinner-border-sm" role="status"></div>';
    });

    const now = new Date();
        
        // Today's date (start of day)
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        // Yesterday's date (start of day)
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        // Start of week (Sunday)
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        
        try {
            // Convert dates to Firestore timestamps
            const todayTimestamp = Timestamp.fromDate(today);
            const yesterdayTimestamp = Timestamp.fromDate(yesterday);
            const weekStartTimestamp = Timestamp.fromDate(weekStart);
            
            // Get today's jobs
            const todayQuery = query(
                collection(db, 'jobViews'),
                where('timestamp', '>=', todayTimestamp)
            );
           
            const todaySnapshot = await getDocs(todayQuery);
            console.log("Total" +todaySnapshot);
            document.getElementById('todayJobsCount').textContent = todaySnapshot.size;
            
            // Get yesterday's jobs
            const yesterdayQuery = query(
                collection(db, 'jobViews'),
                where('timestamp', '>=', yesterdayTimestamp),
                where('timestamp', '<', todayTimestamp)
            );
            const yesterdaySnapshot = await getDocs(yesterdayQuery);
            document.getElementById('yesterdayJobsCount').textContent = yesterdaySnapshot.size;
            
            // Get weekly jobs
            const weeklyQuery = query(
                collection(db, 'jobViews'),
                where('timestamp', '>=', weekStartTimestamp)
            );
            const weeklySnapshot = await getDocs(weeklyQuery);
            document.getElementById('weeklyJobsCount').textContent = weeklySnapshot.size;
            
            // Calculate growth percentages
            updateGrowthPercentage(
                todaySnapshot.size, 
                yesterdaySnapshot.size, 
                'todayJobsCount'
            );
            
            updateGrowthPercentage(
                yesterdaySnapshot.size, 
                weeklySnapshot.size / 7, // Average daily jobs this week
                'yesterdayJobsCount'
            );
            
            const lastWeekStart = new Date(weekStart);
            lastWeekStart.setDate(lastWeekStart.getDate() - 7);
            const lastWeekTimestamp = Timestamp.fromDate(lastWeekStart);
            
            const lastWeekQuery = query(
                collection(db, 'jobViews'),
                where('timestamp', '>=', lastWeekTimestamp),
                where('timestamp', '<', weekStartTimestamp)
            );
            const lastWeekSnapshot = await getDocs(lastWeekQuery);
            
            updateGrowthPercentage(
                weeklySnapshot.size,
                lastWeekSnapshot.size,
                'weeklyJobsCount'
            );
            
        } catch (error) {
            console.error('Error fetching daily job counts:', error);
            document.getElementById('todayJobsCount').textContent = 'Error';
            document.getElementById('yesterdayJobsCount').textContent = 'Error';
            document.getElementById('weeklyJobsCount').textContent = 'Error';
        }
    }
    
    function updateGrowthPercentage(current, previous, elementId) {
        const container = document.getElementById(elementId).closest('.stats-card');
        const growthElement = container.querySelector('.card-growth');
        
        if (previous === 0) {
            growthElement.innerHTML = '<i class="bi bi-dash"></i> N/A';
            growthElement.className = 'card-growth neutral';
            return;
        }
        
        const growth = ((current - previous) / previous) * 100;
        const isPositive = growth >= 0;
        
        growthElement.innerHTML = `
            <i class="bi bi-arrow-${isPositive ? 'up' : 'down'}"></i> 
            ${Math.abs(growth).toFixed(1)}%
        `;
        growthElement.className = `card-growth ${isPositive ? 'positive' : 'negative'}`;
    }
    
    
   
    
    // Set up interval to update daily (every hour)
    setInterval(updateDailyJobCounts, 3600000);
    

// Sidebar Toggle Logic for Mobile
document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.querySelector('.sidebar');
    const sidebarToggles = document.querySelectorAll('.sidebar-toggle');
    
    // Only proceed if sidebar exists
    if (!sidebar) return;

    // Create overlay if it doesn't exist
    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);
    }

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
});
