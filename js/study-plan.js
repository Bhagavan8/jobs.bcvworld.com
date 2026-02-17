import { auth, db } from './firebase-config.js';
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let tasks = [];
let habits = {};
let currentUser = null;
let schedule = [];
let timeLogs = [];
let runningTimer = null;

const todayStr = new Date().toISOString().split('T')[0];
const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));
let charts = { pie: null, bar: null };

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  currentUser = user;
  updateUserUI(user);
  init();
});

function init() {
  // Tasks
  const qTasks = query(collection(db, 'studyTasks'), orderBy('createdAt', 'desc'));
  onSnapshot(qTasks, (snap) => {
    tasks = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(t => t.createdBy === currentUser.uid);
    render();
  });
  // Habits
  const qHabits = query(collection(db, 'dailyHabits'), orderBy('date', 'desc'));
  onSnapshot(qHabits, (snap) => {
    habits = {};
    snap.docs.forEach(d => {
      const h = d.data();
      if (h.createdBy === currentUser.uid) habits[h.date] = { id: d.id, ...h };
    });
    renderHabits();
  });
  // Schedule
  const qSched = query(collection(db, 'studySchedule'), orderBy('start'));
  onSnapshot(qSched, (snap) => {
    schedule = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(s => s.createdBy === currentUser.uid);
    renderSchedule();
  });
  const qLogs = query(collection(db, 'timeLogs'), orderBy('start','desc'));
  onSnapshot(qLogs, (snap) => {
    timeLogs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(l => l.createdBy === currentUser.uid);
    renderSchedule();
    render();
    renderReports();
  });

  // Form
  const form = document.getElementById('taskForm');
  form.addEventListener('submit', handleTaskSubmit);
  const logForm = document.getElementById('logTimeForm');
  if (logForm) {
    const now = new Date();
    const pad = (n)=> String(n).padStart(2,'0');
    const h = pad(now.getHours());
    const m = pad(now.getMinutes());
    const m30 = pad((now.getMinutes()+30>59)?59:now.getMinutes());
    logForm.querySelector('#logStart').value = `${h}:${pad(Math.max(0, now.getMinutes()-30))}`;
    logForm.querySelector('#logEnd').value = `${h}:${m}`;
    logForm.addEventListener('submit', handleLogSubmit);
  }
  // Habit buttons
  qsa('.habit-btn').forEach(btn => btn.addEventListener('click', () => toggleHabit(btn.dataset.habit)));
  // Set habit date label
  const d = new Date();
  qs('#habitDate').textContent = d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  const btnApply = document.getElementById('applyScheduleBtn');
  if (btnApply) btnApply.addEventListener('click', applyRecommendedSchedule);
  const btnReset = document.getElementById('resetScheduleBtn');
  if (btnReset) btnReset.addEventListener('click', resetScheduleAndSeed);
}

async function handleTaskSubmit(e) {
  e.preventDefault();
  const data = {
    title: qs('#taskTitle').value.trim(),
    category: qs('#taskCategory').value,
    priority: qs('#taskPriority').value,
    dueDate: qs('#taskDueDate').value || null,
    estimate: parseInt(qs('#taskEstimate').value) || 0,
    status: 'backlog', // backlog, week, progress, done
    createdBy: currentUser.uid,
    createdAt: serverTimestamp()
  };
  await addDoc(collection(db, 'studyTasks'), data);
  e.target.reset();
  bootstrap.Modal.getInstance(document.getElementById('addTaskModal')).hide();
}

function render() {
  // Buckets
  const backlog = tasks.filter(t => t.status === 'backlog');
  const week = tasks.filter(t => t.status === 'week');
  const progress = tasks.filter(t => t.status === 'progress');
  const done = tasks.filter(t => t.status === 'done');

  qs('#listBacklog').innerHTML = backlog.map(renderItem).join('');
  qs('#listWeek').innerHTML = week.map(renderItem).join('');
  qs('#listInProgress').innerHTML = progress.map(renderItem).join('');
  qs('#listCompleted').innerHTML = done.map(renderItem).join('');

  qs('#countBacklog').textContent = backlog.length;
  qs('#countWeek').textContent = week.length;
  qs('#countInProgress').textContent = progress.length;
  qs('#countCompleted').textContent = done.length;

  const studyTypes = new Set(['Study','DSA','System Design','Coding']);
  const todays = schedule.filter(s => s.day === new Date().getDay());
  const completedKeys = new Set(timeLogs.filter(l => l.date === todayStr && l.blockKey).map(l => l.blockKey));
  const scheduleCandidates = todays.filter(s => studyTypes.has(s.type));
  const todayCandidates = tasks.filter(t => t.status !== 'done' && ((t.dueDate && t.dueDate === todayStr) || t.status === 'week' || t.status === 'progress'));
  const doneTasks = todayCandidates.filter(t => t.status === 'done').length;
  const doneSchedule = scheduleCandidates.filter(s => completedKeys.has(blockKeyOf(s))).length;
  const totalCount = todayCandidates.length + scheduleCandidates.length;
  const doneCount = doneTasks + doneSchedule;
  const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
  const todayCountEl = qs('#todayCount'); if (todayCountEl) todayCountEl.textContent = `${totalCount} Tasks`;
  qs('#todayProgress').style.width = pct + '%';
  qs('#todaySummary').textContent = `${doneCount}/${totalCount} completed`;

  // Study quick list
  const studyCats = ['Interview Prep','DSA','System Design','Coding Practice','Projects','Resume/Portfolio','Mock Interview'];
  const studyFromTasks = tasks.filter(t => t.status !== 'done' && studyCats.includes(t.category)).slice(0, 4);
  const studyFromSchedule = scheduleCandidates.slice(0, 2).map(s => ({ _schedule: true, title: s.label, category: s.type, priority: '', dueDate: '' }));
  const study = [...studyFromSchedule, ...studyFromTasks].slice(0, 6);
  const studyListEl = qs('#studyQuickList');
  studyListEl.innerHTML = study.map(s => `
    <li class="task-item">
      <div>
        <div class="task-title">${escapeHtml(s.title)}</div>
        <div class="task-meta">${s.category} · ${s.priority} ${s.dueDate ? '· due ' + s.dueDate : ''}</div>
      </div>
      <div class="btn-group btn-group-sm">
        ${s._schedule ? `
          <button class="btn btn-outline-secondary" onclick="window.__sp.startLabel('${s.title}')"><i class="bi bi-play"></i></button>
          <button class="btn btn-outline-success" onclick="window.__sp.completeLabel('${s.title}')"><i class="bi bi-check2"></i></button>
        ` : `
          <button class="btn btn-outline-secondary" onclick="window.__sp.move('${s.id}','progress')"><i class="bi bi-play"></i></button>
          <button class="btn btn-outline-success" onclick="window.__sp.move('${s.id}','done')"><i class="bi bi-check2"></i></button>
        `}
      </div>
    </li>
  `).join('');
  const studyCountEl = qs('#studyCount'); if (studyCountEl) studyCountEl.textContent = `${study.length} Tasks`;
}

function renderItem(t) {
  const color = t.priority === 'High' ? 'danger' : (t.priority === 'Low' ? 'secondary' : 'warning');
  return `
    <div class="task-item">
      <div>
        <div class="task-title">${escapeHtml(t.title)}</div>
        <div class="task-meta">
          <span class="badge text-bg-${color}">${t.priority}</span>
          <span class="ms-2">${t.category}</span>
          ${t.dueDate ? `<span class="ms-2">due ${t.dueDate}</span>` : ''}
          ${t.estimate ? `<span class="ms-2">${t.estimate}m</span>` : ''}
        </div>
      </div>
      <div class="btn-group btn-group-sm">
        ${t.status !== 'backlog' ? `<button class="btn btn-outline-secondary" onclick="window.__sp.move('${t.id}','backlog')"><i class="bi bi-arrow-90deg-left"></i></button>` : `<button class="btn btn-outline-primary" onclick="window.__sp.move('${t.id}','week')"><i class="bi bi-calendar-week"></i></button>`}
        ${t.status !== 'progress' ? `<button class="btn btn-outline-warning" onclick="window.__sp.move('${t.id}','progress')"><i class="bi bi-play"></i></button>` : ''}
        ${t.status !== 'done' ? `<button class="btn btn-outline-success" onclick="window.__sp.move('${t.id}','done')"><i class="bi bi-check2"></i></button>` : ''}
        <button class="btn btn-outline-danger" onclick="window.__sp.removeTask('${t.id}')"><i class="bi bi-trash"></i></button>
      </div>
    </div>
  `;
}

function renderHabits() {
  const day = habits[todayStr] || { breakfast:false, lunch:false, dinner:false, workout:false };
  qsa('.habit-btn').forEach(btn => {
    const key = btn.dataset.habit;
    btn.classList.toggle('active', !!day[key]);
  });
  const dietDone = (day.breakfast?1:0) + (day.lunch?1:0) + (day.dinner?1:0);
  qs('#dietScore').textContent = `Diet: ${dietDone}/3`;
  const workoutDone = day.workout ? 1 : 0;
  qs('#workoutScore').textContent = `Workout: ${workoutDone}/1`;
}

async function toggleHabit(key) {
  const day = habits[todayStr];
  if (day && day.id) {
    const newValue = !day[key];
    await updateDoc(doc(db, 'dailyHabits', day.id), { [key]: newValue });
  } else {
    const base = { date: todayStr, createdBy: currentUser.uid, createdAt: serverTimestamp(), breakfast:false,lunch:false,dinner:false,workout:false };
    base[key] = true;
    await addDoc(collection(db, 'dailyHabits'), base);
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

window.__sp = {
  async move(id, status) {
    await updateDoc(doc(db, 'studyTasks', id), { status });
  },
  async removeTask(id) {
    if (!confirm('Delete this task?')) return;
    await deleteDoc(doc(db, 'studyTasks', id));
  }
};

function renderSchedule() {
  const weekly = Array.from({length:7},(_,i)=>({day:i,items:[]}));
  // de-duplicate schedule items by day|start|end|label
  const seen = new Set();
  const unique = [];
  for (const s of schedule) {
    const key = `${s.day}|${s.start}|${s.end}|${s.label}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(s);
    }
  }
  unique.forEach(s=> weekly[s.day]?.items.push(s));
  weekly.forEach(w => w.items.sort((a,b)=> a.start.localeCompare(b.start)));

  const acc = qs('#weeklyAccordion');
  if (!acc) return;
  const empty = qs('#scheduleEmptyState');
  if (empty) empty.style.display = schedule.length ? 'none':'block';
  acc.innerHTML = weekly.map(w => {
    const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][w.day];
    const body = w.items.map(i => `
      <div class="d-flex justify-content-between align-items-center py-1 border-bottom">
        <div>${i.start}–${i.end} · ${escapeHtml(i.label)}</div>
        <div class="d-flex align-items-center gap-2">
          <span class="badge rounded-pill text-bg-${badgeFor(i.type)}">${i.type}</span>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary" onclick="window.__sp.startKey('${blockKeyOf(i)}')"><i class="bi bi-play"></i></button>
            <button class="btn btn-outline-secondary" onclick="window.__sp.stop()"><i class="bi bi-stop"></i></button>
            <button class="btn btn-outline-success" onclick="window.__sp.completeKey('${blockKeyOf(i)}')"><i class="bi bi-check2"></i></button>
          </div>
        </div>
      </div>
    `).join('') || `<div class="text-muted p-2">No items</div>`;
    const id = `day${w.day}`;
    return `
      <div class="accordion-item">
        <h2 class="accordion-header">
          <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${id}">
            ${dayName}
          </button>
        </h2>
        <div id="${id}" class="accordion-collapse collapse">
          <div class="accordion-body">${body}</div>
        </div>
      </div>
    `;
  }).join('');

  const today = new Date().getDay();
  const todays = weekly[today].items;
  const now = timeToMinutes(new Date());
  const tl = qs('#todayTimeline');
  if (tl) {
    const completed = new Set(timeLogs.filter(l => l.date === todayStr && l.blockKey).map(l => l.blockKey));
    tl.innerHTML = todays.map(i => {
      const active = isNowBetween(now, i.start, i.end);
      const done = completed.has(blockKeyOf(i));
      return `
        <div class="list-group-item d-flex justify-content-between align-items-center ${active ? 'active':''}">
          <div>${i.start}–${i.end} · ${escapeHtml(i.label)}</div>
          <div class="d-flex align-items-center gap-2">
            <span class="badge rounded-pill text-bg-${badgeFor(i.type)}">${i.type}</span>
            ${done ? '<span class="badge text-bg-success">Completed</span>' : `
              <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-secondary" onclick="window.__sp.startKey('${blockKeyOf(i)}')"><i class="bi bi-play"></i></button>
                <button class="btn btn-outline-secondary" onclick="window.__sp.stop()"><i class="bi bi-stop"></i></button>
                <button class="btn btn-outline-success" onclick="window.__sp.completeKey('${blockKeyOf(i)}')"><i class="bi bi-check2"></i></button>
              </div>
            `}
          </div>
        </div>
      `;
    }).join('') || `<div class="list-group-item text-muted">No items today</div>`;
    const cur = todays.find(i => isNowBetween(now, i.start, i.end));
    const curEl = qs('#currentBlockLabel');
    if (curEl) curEl.textContent = cur ? `${cur.label}` : 'Now';
  }
}

function badgeFor(t) {
  if (!t) return 'secondary';
  const map = { Study:'primary', DSA:'warning', 'System Design':'info', Coding:'dark', Office:'secondary', Personal:'success', Workout:'success', Diet:'danger', Rest:'secondary', Break:'secondary', Travel:'secondary', Sleep:'secondary', Family:'success', Mobile:'secondary', 'New Skill':'primary' };
  return map[t] || 'secondary';
}

function timeToMinutes(d) {
  return d.getHours()*60 + d.getMinutes();
}
function hhmmToMin(s) {
  const [h,m]=s.split(':').map(x=>parseInt(x));
  return h*60+m;
}
function isNowBetween(nowMin, start, end) {
  const s = hhmmToMin(start), e = hhmmToMin(end);
  return nowMin >= s && nowMin < e;
}

async function applyRecommendedSchedule() {
  if (!confirm('Apply recommended weekly schedule? Existing items remain.')) return;
  const blocks = recommendedBlocks();
  for (const b of blocks) {
    await addDoc(collection(db, 'studySchedule'), {
      day: b.day,
      start: b.start,
      end: b.end,
      label: b.label,
      type: b.type,
      createdBy: currentUser.uid,
      createdAt: serverTimestamp()
    });
  }
}

function recommendedBlocks() {
  const wk = [];
  const workDays = [1,2,3,4,5];
  for (const d of workDays) {
    // Sleep split across midnight
    wk.push({day:(d===1?0:d-1),start:'22:30',end:'23:59',label:'Sleep',type:'Sleep'});
    wk.push({day:d,start:'00:00',end:'06:30',label:'Sleep',type:'Sleep'});
    // Morning routine
    wk.push({day:d,start:'06:30',end:'07:15',label:'Workout',type:'Workout'});
    wk.push({day:d,start:'07:15',end:'07:45',label:'Breakfast',type:'Diet'});
    wk.push({day:d,start:'07:45',end:'09:00',label:'DSA Practice',type:'DSA'});
    // Office with breaks
    wk.push({day:d,start:'09:00',end:'11:00',label:'Office Work (Deep Work)',type:'Office'});
    wk.push({day:d,start:'11:00',end:'11:10',label:'Break',type:'Break'});
    wk.push({day:d,start:'11:10',end:'12:30',label:'Office Work (Deep Work)',type:'Office'});
    wk.push({day:d,start:'12:30',end:'13:15',label:'Lunch',type:'Diet'});
    wk.push({day:d,start:'13:15',end:'15:30',label:'Office Work (Execution)',type:'Office'});
    wk.push({day:d,start:'15:30',end:'15:45',label:'Break',type:'Break'});
    wk.push({day:d,start:'15:45',end:'18:00',label:'Office Work (Execution)',type:'Office'});
    // Travel + evening
    wk.push({day:d,start:'18:00',end:'18:30',label:'Travel / Commute',type:'Travel'});
    wk.push({day:d,start:'18:30',end:'19:30',label:'System Design',type:'System Design'});
    wk.push({day:d,start:'19:30',end:'20:00',label:'Dinner',type:'Diet'});
    wk.push({day:d,start:'20:00',end:'21:00',label:'Coding Practice',type:'Coding'});
    wk.push({day:d,start:'21:00',end:'21:30',label:'Review & Plan',type:'Personal'});
  }
  // Saturday
  wk.push({day:6,start:'00:00',end:'07:30',label:'Sleep',type:'Sleep'});
  wk.push({day:5,start:'22:30',end:'23:59',label:'Sleep',type:'Sleep'});
  wk.push({day:6,start:'07:30',end:'08:15',label:'Workout',type:'Workout'});
  wk.push({day:6,start:'08:15',end:'08:45',label:'Breakfast',type:'Diet'});
  wk.push({day:6,start:'09:00',end:'11:00',label:'Mock Interview / Projects',type:'Study'});
  wk.push({day:6,start:'11:00',end:'11:15',label:'Break',type:'Break'});
  wk.push({day:6,start:'11:15',end:'12:00',label:'DSA Focus',type:'DSA'});
  wk.push({day:6,start:'12:30',end:'13:15',label:'Lunch',type:'Diet'});
  wk.push({day:6,start:'14:00',end:'16:00',label:'System Design Case',type:'System Design'});
  wk.push({day:6,start:'16:00',end:'17:30',label:'Rest / Personal',type:'Rest'});
  wk.push({day:6,start:'19:00',end:'20:00',label:'Coding Practice',type:'Coding'});
  wk.push({day:6,start:'22:30',end:'23:59',label:'Sleep',type:'Sleep'});
  // Sunday
  wk.push({day:0,start:'00:00',end:'08:00',label:'Sleep',type:'Sleep'});
  wk.push({day:0,start:'08:00',end:'08:45',label:'Workout',type:'Workout'});
  wk.push({day:0,start:'09:00',end:'10:30',label:'Project Work',type:'Study'});
  wk.push({day:0,start:'10:30',end:'10:45',label:'Break',type:'Break'});
  wk.push({day:0,start:'11:00',end:'12:00',label:'Resume/Portfolio',type:'Personal'});
  wk.push({day:0,start:'12:30',end:'13:15',label:'Lunch',type:'Diet'});
  wk.push({day:0,start:'14:00',end:'15:30',label:'System Design Reading',type:'System Design'});
  wk.push({day:0,start:'16:00',end:'17:00',label:'Week Review & Plan',type:'Personal'});
  wk.push({day:0,start:'22:30',end:'23:59',label:'Sleep',type:'Sleep'});
  return wk;
}

function updateUserUI(user) {
  const menu = document.getElementById('userMenuDropdown');
  if (menu) {
    const firstName = (user.displayName || user.email.split('@')[0]);
    const profileImage = user.photoURL || '/images/default.webp';
    menu.innerHTML = `
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
          <li><a class="dropdown-item" href="#" id="signOutLink">Sign Out</a></li>
        </ul>
      </div>
    `;
    const signOutLink = document.getElementById('signOutLink');
    if (signOutLink) signOutLink.addEventListener('click', () => auth.signOut());
  }
  const sidebar = document.querySelector('.sidebar');
  const toggle = document.querySelectorAll('.sidebar-toggle');
  toggle.forEach(t => t.addEventListener('click', () => sidebar?.classList.toggle('active')));
}

function blockKeyOf(i) {
  return `${i.day}|${i.start}|${i.end}|${i.label}`;
}
function blockKeyOfLabel(label) {
  const day = new Date().getDay();
  const item = schedule.find(s => s.day === day && s.label === label);
  return item ? blockKeyOf(item) : `${day}|${label}`;
}

async function handleLogSubmit(e) {
  e.preventDefault();
  const title = qs('#logTitle').value.trim();
  const type = qs('#logType').value;
  const start = qs('#logStart').value;
  const end = qs('#logEnd').value;
  const dur = hhmmToMin(end) - hhmmToMin(start);
  await addDoc(collection(db, 'timeLogs'), {
    date: todayStr,
    label: title,
    type,
    start: start,
    end: end,
    durationMinutes: Math.max(0, dur),
    createdBy: currentUser.uid,
    createdAt: serverTimestamp()
  });
  bootstrap.Modal.getInstance(document.getElementById('logTimeModal')).hide();
}

async function startTimerForKey(key) {
  const now = new Date();
  runningTimer = { key, start: `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}` };
}
async function stopTimer() {
  if (!runningTimer) return;
  const now = new Date();
  const end = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const dur = hhmmToMin(end) - hhmmToMin(runningTimer.start);
  const parts = runningTimer.key.split('|');
  const label = parts[3] || 'Session';
  const item = schedule.find(s => blockKeyOf(s) === runningTimer.key);
  const type = item ? item.type : 'Personal';
  await addDoc(collection(db, 'timeLogs'), {
    date: todayStr,
    label,
    type,
    start: runningTimer.start,
    end,
    durationMinutes: Math.max(0, dur),
    blockKey: runningTimer.key,
    createdBy: currentUser.uid,
    createdAt: serverTimestamp()
  });
  runningTimer = null;
}
async function completeByKey(key) {
  const item = schedule.find(s => blockKeyOf(s) === key);
  if (!item) return;
  const dur = hhmmToMin(item.end) - hhmmToMin(item.start);
  await addDoc(collection(db, 'timeLogs'), {
    date: todayStr,
    label: item.label,
    type: item.type,
    start: item.start,
    end: item.end,
    durationMinutes: Math.max(0, dur),
    blockKey: key,
    createdBy: currentUser.uid,
    createdAt: serverTimestamp()
  });
}

window.__sp.startKey = (key) => startTimerForKey(key);
window.__sp.stop = () => stopTimer();
window.__sp.completeKey = (key) => completeByKey(key);
window.__sp.startLabel = (label) => {
  const day = new Date().getDay();
  const item = schedule.find(s => s.day === day && s.label === label);
  if (item) startTimerForKey(blockKeyOf(item));
};
window.__sp.completeLabel = async (label) => {
  const day = new Date().getDay();
  const item = schedule.find(s => s.day === day && s.label === label);
  if (item) await completeByKey(blockKeyOf(item));
};

function renderReports() {
  const today = todayStr;
  const yest = new Date(new Date(today).getTime() - 86400000).toISOString().split('T')[0];
  const agg = (date) => {
    const map = {};
    timeLogs.filter(l => l.date === date).forEach(l => {
      const k = l.type || 'Other';
      map[k] = (map[k] || 0) + (parseFloat(l.durationMinutes) || 0);
    });
    return map;
  };
  const tMap = agg(today);
  const yMap = agg(yest);
  const types = Array.from(new Set([...Object.keys(tMap), ...Object.keys(yMap)]));
  const tVals = types.map(k => tMap[k] || 0);
  const yVals = types.map(k => yMap[k] || 0);
  const focusTypes = ['Study','DSA','System Design','Coding'];
  const focusMin = types.reduce((s,k)=> s + (focusTypes.includes(k)? (tMap[k]||0) : 0), 0);
  const mobileMin = tMap['Mobile'] || 0;
  const todayDay = new Date(today).getDay();
  const todays = schedule.filter(s => s.day === todayDay);
  const completed = new Set(timeLogs.filter(l => l.date === today && l.blockKey).map(l => l.blockKey));
  const totalSched = todays.length;
  const done = todays.filter(s => completed.has(blockKeyOf(s))).length;
  const missed = Math.max(0, totalSched - done);
  const elC = qs('#kpiCompleted'); if (elC) elC.textContent = String(done);
  const elM = qs('#kpiMissed'); if (elM) elM.textContent = String(missed);
  const elF = qs('#kpiFocus'); if (elF) elF.textContent = String(focusMin);
  const elMb = qs('#kpiMobile'); if (elMb) elMb.textContent = String(mobileMin);
  const pieEl = qs('#todayPie');
  if (pieEl) {
    if (charts.pie) charts.pie.destroy();
    charts.pie = new Chart(pieEl, {
      type: 'pie',
      data: { labels: Object.keys(tMap), datasets: [{ data: Object.values(tMap) }] },
      options: { plugins: { legend: { position: 'bottom' } } }
    });
  }
  const barEl = qs('#todayYesterdayBar');
  if (barEl) {
    if (charts.bar) charts.bar.destroy();
    charts.bar = new Chart(barEl, {
      type: 'bar',
      data: {
        labels: types,
        datasets: [
          { label: 'Today', data: tVals, backgroundColor: 'rgba(54, 162, 235, 0.6)' },
          { label: 'Yesterday', data: yVals, backgroundColor: 'rgba(201, 203, 207, 0.6)' }
        ]
      },
      options: { plugins: { legend: { position: 'bottom' } }, responsive: true, maintainAspectRatio: false }
    });
  }
  const plan = [];
  focusTypes.forEach(ft => {
    const tv = tMap[ft] || 0;
    if (tv < 60) plan.push(`Add ${60 - tv} min ${ft} tomorrow`);
  });
  if (mobileMin > 60) plan.push('Reduce Mobile by 30+ min');
  if (missed > 0) plan.push(`Reschedule ${missed} missed blocks`);
  const tList = qs('#tomorrowList');
  if (tList) {
    tList.innerHTML = plan.length ? plan.map(p => `<div class="d-flex align-items-center gap-2 mb-1"><i class="bi bi-lightbulb"></i><span>${p}</span></div>`).join('') : '<div class="text-muted">All good today</div>';
  }
}

async function resetScheduleAndSeed() {
  if (!confirm('This will remove your current weekly schedule and re-apply the default. Continue?')) return;
  // delete current user's schedule docs using in-memory filtered schedule list
  for (const s of schedule) {
    await deleteDoc(doc(db, 'studySchedule', s.id));
  }
  await applyRecommendedSchedule();
}
