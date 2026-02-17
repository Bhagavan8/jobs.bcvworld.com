import { auth, db } from './firebase-config.js';
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, serverTimestamp, query, orderBy, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let currentUser = null;
let problems = [];
let current = null;
let worker = null;
let currentLang = 'JavaScript';

const qs = (s)=> document.querySelector(s);
const codeEditor = ()=> qs('#codeEditor');

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = 'login.html'; return; }
  currentUser = user;
  init();
});

function init() {
  const q = query(collection(db,'dsaProblems'), orderBy('createdAt','desc'));
  onSnapshot(q, snap => {
    problems = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.createdBy === currentUser.uid || p.seed === true);
    renderProblemList();
    if (!current && problems.length) selectProblem(problems[0].id);
  });
  qs('#seedProblemsBtn').addEventListener('click', seedProblems);
  qs('#resetProblemsBtn').addEventListener('click', resetProblems);
  qs('#runBtn').addEventListener('click', () => currentLang === 'Java' ? runTestsJava() : runTests());
  qs('#submitBtn').addEventListener('click', submitSolution);
  qs('#resetCodeBtn').addEventListener('click', ()=> { if(current){ codeEditor().value = currentLang === 'Java' ? (current.starterJava || '') : (current.starter || ''); } });
  qs('#categoryFilter').addEventListener('change', renderProblemList);
  qs('#difficultyFilter').addEventListener('change', renderProblemList);
  const langSel = qs('#languageSelect');
  if (langSel) {
    currentLang = langSel.value;
    langSel.addEventListener('change', () => {
      currentLang = langSel.value;
      if (current) codeEditor().value = currentLang === 'Java' ? (current.starterJava || '') : (current.starter || '');
      qs('#results').textContent = 'No runs yet';
    });
  }
}

function renderProblemList() {
  const pf = qs('#categoryFilter').value;
  const df = qs('#difficultyFilter').value;
  const list = qs('#problemList');
  const items = problems
    .filter(p => !pf || p.category === pf)
    .filter(p => !df || p.difficulty === df);
  qs('#problemCount').textContent = items.length;
  list.innerHTML = items.map(p => `
    <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
      <div>
        <a href="#" class="text-decoration-none" onclick="window.__dsaSel('${p.id}')">${escapeHtml(p.title)}</a><br/>
        <small class="text-muted">${p.category} • <span class="badge text-bg-${badgeFor(p.difficulty)} badge-difficulty">${p.difficulty}</span></small>
      </div>
      <i class="bi bi-chevron-right"></i>
    </div>
  `).join('') || `<div class="text-muted">No problems</div>`;
}

function badgeFor(diff) {
  return diff === 'Easy' ? 'success' : diff === 'Medium' ? 'warning' : 'danger';
}

function escapeHtml(s){ return (s||'').replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

window.__dsaSel = (id)=> selectProblem(id);

function selectProblem(id) {
  current = problems.find(p => p.id === id);
  if (!current) return;
  qs('#problemTitle').textContent = current.title;
  qs('#problemMeta').textContent = `${current.category} • ${current.difficulty}`;
  qs('#problemDesc').innerHTML = current.description || '';
  const langSel = qs('#languageSelect');
  if (langSel) currentLang = langSel.value;
  codeEditor().value = currentLang === 'Java' ? (current.starterJava || '') : (current.starter || '');
  qs('#results').textContent = 'No runs yet';
}

async function seedProblems() {
  const defaults = [
    {
      title: 'Two Sum',
      category: 'Arrays',
      difficulty: 'Easy',
      description: 'Return indices of the two numbers that add up to target.',
      functionName: 'twoSum',
      starter:
`// nums: number[], target: number
function twoSum(nums, target) {
  const map = new Map();
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    if (map.has(need)) return [map.get(need), i];
    map.set(nums[i], i);
  }
  return [];
}`,
      starterJava:
`public class Solution {
  public int[] twoSum(int[] nums, int target) {
    java.util.Map<Integer,Integer> map = new java.util.HashMap<>();
    for (int i=0;i<nums.length;i++) {
      int need = target - nums[i];
      if (map.containsKey(need)) return new int[]{ map.get(need), i };
      map.put(nums[i], i);
    }
    return new int[0];
  }
}`,
      tests: [
        { input: [[2,7,11,15], 9], output: [0,1] },
        { input: [[3,2,4], 6], output: [1,2] },
        { input: [[3,3], 6], output: [0,1] }
      ]
    },
    {
      title: 'Valid Parentheses',
      category: 'Stack',
      difficulty: 'Easy',
      description: 'Given a string s containing (), {}, [], determine if it is valid.',
      functionName: 'isValid',
      starter:
`function isValid(s) {
  const st = [];
  const m = {')':'(',']':'[','}':'{'};
  for (const c of s) {
    if (c==='('||c==='['||c==='{') st.push(c);
    else {
      if (!st.length || st.pop() !== m[c]) return false;
    }
  }
  return st.length===0;
}`,
      starterJava:
`public class Solution {
  public boolean isValid(String s) {
    java.util.Deque<Character> st = new java.util.ArrayDeque<>();
    java.util.Map<Character,Character> m = new java.util.HashMap<>();
    m.put(')', '('); m.put(']', '['); m.put('}', '{');
    for (char c: s.toCharArray()) {
      if (c=='('||c=='['||c=='{') st.push(c);
      else { if (st.isEmpty() || st.pop()!=m.get(c)) return false; }
    }
    return st.isEmpty();
  }
}`,
      tests: [
        { input: ['()'], output: true },
        { input: ['()[]{}'], output: true },
        { input: ['(]'], output: false }
      ]
    }
  ];
  for (const p of defaults) {
    await addDoc(collection(db,'dsaProblems'), {
      ...p,
      seed: true,
      createdBy: currentUser.uid,
      createdAt: serverTimestamp()
    });
  }
}

async function resetProblems() {
  const snap = await getDocs(query(collection(db,'dsaProblems'), where('createdBy','==', currentUser.uid)));
  for (const d of snap.docs) await deleteDoc(doc(db,'dsaProblems', d.id));
  problems = [];
  renderProblemList();
  current = null;
  qs('#problemTitle').textContent = 'Select a problem';
  qs('#problemMeta').textContent = '';
  qs('#problemDesc').textContent = '';
  codeEditor().value = '';
  qs('#results').textContent = 'No runs yet';
}

function makeWorker() {
  const src = `
  self.onmessage = async (e) => {
    const { code, func, tests } = e.data;
    let results = [];
    try {
      const wrapped = code + "\\n;self.__userFn = " + (func) + ";";
      const blob = new Blob([wrapped], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      importScripts(url);
      const start = Date.now();
      for (let i=0;i<tests.length;i++) {
        let ok=false, out, err=null;
        try {
          out = self.__userFn.apply(null, tests[i].input);
          ok = JSON.stringify(out) === JSON.stringify(tests[i].output);
        } catch (ex) { err = String(ex); }
        results.push({ ok, expected: tests[i].output, got: out, err });
      }
      const runtime = Date.now() - start;
      postMessage({ ok: results.every(r=>r.ok), results, runtime });
    } catch (ex) {
      postMessage({ ok:false, error:String(ex) });
    }
  };
  `;
  const blob = new Blob([src], { type: 'text/javascript' });
  return new Worker(URL.createObjectURL(blob));
}

function runTests() {
  if (!current) { alert('Select a problem'); return; }
  const code = codeEditor().value;
  // Expect user to define function with the given name; wrap and pass a reference
  const funcRef = current.functionName;
  const harness = `
    ${code}
    (${funcRef})
  `;
  if (worker) worker.terminate();
  worker = makeWorker();
  qs('#results').textContent = 'Running...';
  worker.onmessage = (ev) => {
    const { ok, error, results, runtime } = ev.data;
    if (error) {
      qs('#results').innerHTML = '<span class="text-danger">'+escapeHtml(error)+'</span>';
      return;
    }
    const passed = results.filter(r=>r.ok).length;
    const total = results.length;
    const list = results.map((r,i)=> {
      if (r.ok) return `<div class="test-pass">✔ Test #${i+1}</div>`;
      return `<div class="test-fail">✖ Test #${i+1} • expected ${escapeHtml(JSON.stringify(r.expected))}, got ${escapeHtml(JSON.stringify(r.got))} ${r.err ? ' • '+escapeHtml(r.err):''}</div>`;
    }).join('');
    qs('#results').innerHTML = `<div><strong>${passed}/${total} tests passed</strong> • ${runtime} ms</div>` + list;
  };
  worker.postMessage({ code, func: current.functionName, tests: current.tests || [] });
}

async function submitSolution() {
  if (!current) { alert('Select a problem'); return; }
  const code = codeEditor().value;
  if (currentLang === 'JavaScript' && !worker) runTests();
  // Lightweight: log a submission with code snapshot; results will be from last run in UI
  await addDoc(collection(db,'dsaSubmissions'), {
    problemId: current.id,
    title: current.title,
    language: currentLang,
    code,
    createdBy: currentUser.uid,
    createdAt: serverTimestamp()
  });
  alert('Submission saved');
}

async function runTestsJava() {
  if (!current) { alert('Select a problem'); return; }
  const code = codeEditor().value;
  const tests = current.tests || [];
  const fn = current.functionName;
  let calls = '';
  if (fn === 'twoSum') {
    calls = tests.map((t,i)=> {
      const arr = JSON.stringify(t.input[0]).replace(/\s+/g,'');
      const target = t.input[1];
      const exp = JSON.stringify(t.output).replace(/\s+/g,'');
      return `{
        int[] got = new Solution().twoSum(new int[]${arr}, ${target});
        int[] exp = new int[]${exp};
        boolean ok = java.util.Arrays.equals(got, exp);
        System.out.println("CASE ${i+1} " + (ok ? "OK" : "FAIL") + " " + java.util.Arrays.toString(got));
      }`;
    }).join('\n');
  } else if (fn === 'isValid') {
    calls = tests.map((t,i)=> {
      const s = JSON.stringify(t.input[0]);
      const exp = t.output ? 'true' : 'false';
      return `{
        boolean got = new Solution().isValid(${s});
        boolean ok = (got == ${exp});
        System.out.println("CASE ${i+1} " + (ok ? "OK" : "FAIL") + " " + got);
      }`;
    }).join('\n');
  } else {
    qs('#results').innerHTML = '<span class="text-danger">Java harness not defined for this problem.</span>';
    return;
  }
  const main = `
import java.util.*;
public class Main {
  public static void main(String[] args) throws Exception {
    ${calls}
  }
}
${code}
`;
  qs('#results').textContent = 'Running on Java...';
  const res = await fetch('https://emkc.org/api/v2/piston/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: 'java',
      version: '17',
      files: [{ name: 'Main.java', content: main }]
    })
  });
  const out = await res.json();
  const stdout = (out.run && out.run.stdout) ? String(out.run.stdout) : '';
  const stderr = (out.run && out.run.stderr) ? String(out.run.stderr) : '';
  if (stderr && !stdout) {
    qs('#results').innerHTML = '<span class="text-danger">'+escapeHtml(stderr)+'</span>';
    return;
  }
  const lines = stdout.trim().split(/[\r\n]+/);
  let pass = 0;
  lines.forEach(l => { if (/CASE\s+\d+\s+OK/.test(l)) pass++; });
  const total = tests.length;
  const detail = lines.map(l => /OK/.test(l) ? '<div class="test-pass">✔ '+escapeHtml(l)+'</div>' : '<div class="test-fail">✖ '+escapeHtml(l)+'</div>').join('');
  qs('#results').innerHTML = `<div><strong>${pass}/${total} tests passed</strong></div>` + detail;
}
