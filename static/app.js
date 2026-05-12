'use strict';

/* ═══════════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════════ */
const state = {
  currentUser:   'Alice',
  sending:       false,
  charts:        {},
  lastDashboard: null,
  pendingImport: null,   // holds parsed JSON waiting for confirm
};

const SCORE_META = [
  { key:'toxicity',        label:'TOX'      },
  { key:'severe_toxicity', label:'SEVERE'   },
  { key:'obscene',         label:'OBSCENE'  },
  { key:'threat',          label:'THREAT'   },
  { key:'insult',          label:'INSULT'   },
  { key:'identity_attack', label:'IDENTITY' },
];

/* ═══════════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════════ */
function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function setText(id, v) { const el=document.getElementById(id); if(el) el.textContent=v; }

function scoreColor(v) {
  if (v >= 75) return 'var(--critical)';
  if (v >= 50) return 'var(--high)';
  if (v >= 20) return 'var(--medium)';
  return 'var(--safe)';
}
function severityColor(sev) {
  return {safe:'var(--safe)',medium:'var(--medium)',high:'var(--high)',critical:'var(--critical)'}[sev]||'var(--text)';
}

function toast(msg, sev='safe') {
  const s = document.getElementById('toastStack');
  const d = document.createElement('div');
  d.className = `toast toast-${sev}`;
  d.textContent = msg;
  s.appendChild(d);
  setTimeout(() => d.remove(), 3200);
}

function updateCharCount() {
  const v = document.getElementById('msgInput').value.length;
  const el = document.getElementById('charCount');
  el.textContent = `${v} / 500`;
  el.style.color = v > 450 ? 'var(--high)' : '';
}

/* ═══════════════════════════════════════════════════════════════
   TAB SWITCHING
═══════════════════════════════════════════════════════════════ */
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === name);
  });
  document.querySelectorAll('.tab-pane').forEach(p => {
    p.classList.toggle('active', p.id === 'tab' + name.charAt(0).toUpperCase() + name.slice(1));
  });
  // Resize charts when analytics tab becomes visible
  if (name === 'analytics') {
    setTimeout(() => Object.values(state.charts).forEach(c => c && c.resize()), 50);
  }
}

/* ═══════════════════════════════════════════════════════════════
   USER SELECTOR
═══════════════════════════════════════════════════════════════ */
function selectUser(btn) {
  document.querySelectorAll('.upill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  state.currentUser = btn.dataset.user;
}

function quickTest(text) {
  document.getElementById('msgInput').value = text;
  updateCharCount();
  document.getElementById('msgInput').focus();
}

/* ═══════════════════════════════════════════════════════════════
   SEND MESSAGE
═══════════════════════════════════════════════════════════════ */
async function sendMessage() {
  if (state.sending) return;
  const input = document.getElementById('msgInput');
  const text  = input.value.trim();
  if (!text) return;

  state.sending = true;
  const btn = document.getElementById('sendBtn');
  btn.disabled  = true;
  btn.innerHTML = '<span>ANALYZING…</span>';

  try {
    const resp = await fetch('/api/send', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({username: state.currentUser, message: text}),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    renderMessage(data.message);
    showAnalysis(data.message);
    updateMetrics(data.global);
    if (data.message.is_flagged) {
      toast(`⚠ ${data.message.username}: ${data.message.toxicity_score}% toxicity`, data.message.severity);
    }
    input.value = '';
    updateCharCount();
  } catch(err) {
    toast(`Error: ${err.message}`, 'high');
  } finally {
    state.sending = false;
    btn.disabled  = false;
    btn.innerHTML = '<span>SEND</span><span class="send-arrow">▶</span>';
  }
}

/* ═══════════════════════════════════════════════════════════════
   RENDER A MESSAGE BUBBLE
═══════════════════════════════════════════════════════════════ */
function renderMessage(msg) {
  const area   = document.getElementById('messagesArea');
  const sev    = msg.severity || 'safe';
  const scores = msg.scores   || {};

  // 6-score mark grid
  const marksHtml = SCORE_META.map(m => {
    const val = scores[m.key] ?? 0;
    const col = scoreColor(val);
    return `<div class="score-mark" title="${m.key}: ${val}%">
      <span class="sm-label">${m.label}</span>
      <div class="sm-bar"><div class="sm-fill" data-w="${Math.min(val,100)}" style="width:0%;background:${col}"></div></div>
      <span class="sm-val" style="color:${col}">${val}%</span>
    </div>`;
  }).join('');

  // Overall bar
  const oc = severityColor(sev);
  const overallBar = `
    <div class="overall-row">
      <span class="overall-label">OVERALL RISK</span>
      <div class="overall-bar"><div class="overall-fill fill-${sev}" data-w="${msg.toxicity_score}" style="width:0%"></div></div>
      <span class="overall-val" style="color:${oc}">${msg.toxicity_score}%</span>
    </div>`;

  // Keyword pills
  const kwHtml = (msg.keywords||[]).map(k =>
    `<span class="kw-pill kw-${k.severity}" title="${k.category}">${esc(k.word)}</span>`
  ).join('');

  const div = document.createElement('div');
  div.className = `msg-wrap sev-${sev}`;
  div.dataset.msgId = msg.id;
  div.innerHTML = `
    <div class="msg-meta">
      <span class="msg-user">${esc(msg.username)}</span>
      <span class="msg-time">${msg.timestamp}</span>
      <span class="msg-sev-tag tag-${sev}">${sev.toUpperCase()}</span>
    </div>
    <div class="score-marks">${marksHtml}</div>
    <div class="msg-text">${esc(msg.text)}</div>
    ${overallBar}
    ${kwHtml ? `<div class="msg-keywords">${kwHtml}</div>` : ''}
  `;

  area.appendChild(div);

  // Animate bars
  requestAnimationFrame(() => requestAnimationFrame(() => {
    div.querySelectorAll('[data-w]').forEach(el => { el.style.width = el.dataset.w + '%'; });
  }));

  area.scrollTop = area.scrollHeight;
}

/* ═══════════════════════════════════════════════════════════════
   LAST ANALYSIS PANEL
═══════════════════════════════════════════════════════════════ */
function showAnalysis(msg) {
  const block  = document.getElementById('analysisBlock');
  const body   = document.getElementById('analysisBody');
  const sev    = msg.severity || 'safe';
  const scores = msg.scores   || {};

  const scoresHtml = SCORE_META.map(m => {
    const val = scores[m.key] ?? 0;
    const col = scoreColor(val);
    return `<div class="an-score-row">
      <span class="an-label">${m.key.replace(/_/g,' ')}</span>
      <div class="score-bar-wrap">
        <div class="score-bar-fill" data-w="${Math.min(val,100)}" style="width:0%;background:${col}"></div>
      </div>
      <span class="an-val" style="color:${col}">${val}%</span>
    </div>`;
  }).join('');

  const kwHtml = (msg.keywords||[]).map(k =>
    `<span class="kw-pill kw-${k.severity}">${esc(k.word)}</span>`
  ).join('') || '<span style="font-size:10px;color:var(--text-dim)">None detected</span>';

  body.innerHTML = `
    <div class="an-overall">
      <span class="an-overall-label">OVERALL TOXICITY</span>
      <span class="an-overall-val text-${sev}">${msg.toxicity_score}%</span>
    </div>
    <div class="an-scores-list">${scoresHtml}</div>
    <div class="block-title" style="margin:8px 0 4px">TRIE KEYWORDS</div>
    <div class="keywords-wrap">${kwHtml}</div>
    <div class="an-source">Scored by Detoxify · unitaryai/detoxify</div>
  `;
  block.style.display = 'block';

  requestAnimationFrame(() => requestAnimationFrame(() => {
    body.querySelectorAll('[data-w]').forEach(el => { el.style.width = el.dataset.w + '%'; });
  }));
}

/* ═══════════════════════════════════════════════════════════════
   METRICS BAR
═══════════════════════════════════════════════════════════════ */
function updateMetrics(stats) {
  if (!stats) return;
  setText('mTotal',   stats.total_messages);
  setText('mFlagged', stats.flag_rate + '%');
  setText('mAvgTox',  stats.avg_toxicity + '%');
  setText('mUsers',   stats.active_users);
  setText('mAlerts',  stats.alert_count);
  document.getElementById('chipFlagged').classList.toggle('alert-active', stats.flag_rate > 30);
}

/* ═══════════════════════════════════════════════════════════════
   DASHBOARD POLLING  (every 3 s)
═══════════════════════════════════════════════════════════════ */
async function pollDashboard() {
  try {
    const resp = await fetch('/api/dashboard');
    if (!resp.ok) return;
    const data = await resp.json();
    state.lastDashboard = data;

    updateMetrics(data.stats);
    renderAlerts(data.alerts   || []);
    renderUserTable(data.users || []);
    updateAnalyticsTab(data.stats, data.analytics);
    updateSessionTab(data.stats, data.start_ts);
  } catch(_) {}
}

/* ── Alerts list ── */
function renderAlerts(alerts) {
  const list  = document.getElementById('alertsList');
  const badge = document.getElementById('badgeAlerts');
  badge.textContent = alerts.length;
  badge.classList.toggle('has-alerts', alerts.length > 0);
  if (!alerts.length) {
    list.innerHTML = '<div class="empty-msg">No alerts. System monitoring active…</div>';
    return;
  }
  list.innerHTML = alerts.map(a => {
    const sev = a.severity >= 75 ? 'critical' : a.severity >= 50 ? 'high' : 'medium';
    return `<div class="alert-item sev-${sev}">
      <span class="alert-sev">${Math.round(a.severity)}%</span>
      <div class="alert-info">
        <div class="alert-user">${esc(a.user)}</div>
        <div class="alert-msg">${esc(a.message)}</div>
      </div>
      <span class="alert-time">${a.timestamp}</span>
    </div>`;
  }).join('');
}

/* ── User risk table ── */
function renderUserTable(users) {
  const tbody = document.getElementById('userTableBody');
  const badge = document.getElementById('badgeUsers');
  badge.textContent = users.length;
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-msg">No users yet</td></tr>';
    return;
  }
  const order = {critical:0,high:1,medium:2,safe:3};
  users.sort((a,b) => (order[a.risk_level]||3) - (order[b.risk_level]||3));
  tbody.innerHTML = users.map(u => `
    <tr>
      <td style="color:var(--text-hi);font-weight:600">${esc(u.username)}</td>
      <td>${u.total_messages}</td>
      <td style="color:${u.flagged_messages>0?'var(--high)':'var(--text-dim)'}">${u.flagged_messages}</td>
      <td style="color:${u.warnings>0?'var(--critical)':'var(--text-dim)'}">${u.warnings}</td>
      <td><span class="risk-badge risk-${u.risk_level}">${u.risk_level.toUpperCase()}</span></td>
    </tr>`).join('');
}

/* ═══════════════════════════════════════════════════════════════
   ANALYTICS TAB
═══════════════════════════════════════════════════════════════ */
function updateAnalyticsTab(stats, analytics) {
  if (!stats) return;

  // Stat cards
  setText('scTotal',   stats.total_messages);
  setText('scFlagged', stats.flagged_messages);
  setText('scAvg',     stats.avg_toxicity + '%');
  setText('scUsers',   stats.active_users);

  if (!analytics) return;

  // Severity donut
  if (state.charts.severity) {
    const d = analytics.severity_distribution || {};
    state.charts.severity.data.datasets[0].data = [
      d.safe||0, d.medium||0, d.high||0, d.critical||0
    ];
    state.charts.severity.update('none');
  }

  // Timeline line chart
  if (state.charts.timeline && analytics.timeline) {
    const tl = analytics.timeline;
    state.charts.timeline.data.labels = tl.map((_,i) => i+1);
    state.charts.timeline.data.datasets[0].data = tl.map(t => t.score);
    state.charts.timeline.data.datasets[0].pointBackgroundColor = tl.map(t => scoreColor(t.score));
    state.charts.timeline.update('none');
  }

  // Top users horizontal bar
  if (state.charts.users && analytics.top_users) {
    const tu = analytics.top_users.slice(0,5);
    state.charts.users.data.labels = tu.map(u => u.username);
    state.charts.users.data.datasets[0].data = tu.map(u => u.avg_toxicity);
    state.charts.users.data.datasets[0].backgroundColor = tu.map(u => {
      if (u.risk_level==='critical') return 'rgba(255,34,68,0.7)';
      if (u.risk_level==='high')     return 'rgba(255,145,0,0.7)';
      if (u.risk_level==='medium')   return 'rgba(255,215,64,0.7)';
      return 'rgba(0,230,118,0.7)';
    });
    state.charts.users.update('none');
  }

  // Top words horizontal bar
  if (state.charts.words && analytics.top_words) {
    const tw = analytics.top_words.slice(0,10);
    state.charts.words.data.labels = tw.map(w => w.word);
    state.charts.words.data.datasets[0].data = tw.map(w => w.count);
    state.charts.words.update('none');
  }
}

/* ── Chart.js initialization ── */
function initCharts() {
  const mono = "'IBM Plex Mono', monospace";
  const gridCol  = 'rgba(26,46,80,0.6)';
  const tickOpts = { color:'#4a7095', font:{family:mono, size:9} };

  Chart.defaults.color = '#4a7095';
  Chart.defaults.font.family = mono;

  // 1. Severity donut
  state.charts.severity = new Chart(document.getElementById('chartSeverity'), {
    type: 'doughnut',
    data: {
      labels: ['Safe','Medium','High','Critical'],
      datasets: [{
        data: [0,0,0,0],
        backgroundColor:['rgba(0,230,118,0.8)','rgba(255,215,64,0.8)','rgba(255,145,0,0.8)','rgba(255,34,68,0.8)'],
        borderColor:['#00e676','#ffd740','#ff9100','#ff2244'],
        borderWidth: 1,
      }]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{
          position:'right',
          labels:{ color:'#94b8d8', font:{family:mono,size:9}, boxWidth:10, padding:8 }
        }
      }
    }
  });

  // 2. Toxicity timeline
  state.charts.timeline = new Chart(document.getElementById('chartTimeline'), {
    type: 'line',
    data: {
      labels:[],
      datasets:[{
        label:'Toxicity %',
        data:[],
        borderColor:'#00c8f5',
        backgroundColor:'rgba(0,200,245,0.08)',
        borderWidth:1.5,
        tension:0.4,
        fill:true,
        pointRadius:3,
        pointBackgroundColor:[],
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false} },
      scales:{
        x:{ display:false },
        y:{
          min:0, max:100,
          ticks:tickOpts,
          grid:{ color:gridCol }
        }
      }
    }
  });

  // 3. Top users (horizontal bar)
  state.charts.users = new Chart(document.getElementById('chartUsers'), {
    type:'bar',
    data:{
      labels:[],
      datasets:[{ label:'Avg Toxicity %', data:[], backgroundColor:[], borderRadius:3 }]
    },
    options:{
      responsive:true, maintainAspectRatio:false, indexAxis:'y',
      plugins:{ legend:{display:false} },
      scales:{
        x:{ min:0, max:100, ticks:tickOpts, grid:{color:gridCol} },
        y:{ ticks:tickOpts, grid:{display:false} }
      }
    }
  });

  // 4. Top words (horizontal bar)
  state.charts.words = new Chart(document.getElementById('chartWords'), {
    type:'bar',
    data:{
      labels:[],
      datasets:[{ label:'Count', data:[], backgroundColor:'rgba(255,34,68,0.6)', borderColor:'#ff2244', borderWidth:1, borderRadius:3 }]
    },
    options:{
      responsive:true, maintainAspectRatio:false, indexAxis:'y',
      plugins:{ legend:{display:false} },
      scales:{
        x:{ ticks:tickOpts, grid:{color:gridCol} },
        y:{ ticks:{ ...tickOpts, font:{...tickOpts.font, size:8} }, grid:{display:false} }
      }
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   SESSION TAB
═══════════════════════════════════════════════════════════════ */
function updateSessionTab(stats, startTs) {
  if (!stats) return;
  setText('siStarted',  startTs || '—');
  setText('siMessages', stats.total_messages);
  setText('siFlagged',  stats.flagged_messages);

  const d = state.lastDashboard;
  if (d && d.users && d.users.length > 0) {
    const top = [...d.users].sort((a,b) => b.avg_toxicity - a.avg_toxicity)[0];
    setText('siTopUser', `${top.username} (${top.avg_toxicity}%)`);
  } else {
    setText('siTopUser', '—');
  }
}

/* ═══════════════════════════════════════════════════════════════
   EXPORT
═══════════════════════════════════════════════════════════════ */
function showExportModal() {
  const stats = state.lastDashboard ? state.lastDashboard.stats : null;
  const count = stats ? stats.total_messages : 0;
  document.getElementById('exportModalBody').innerHTML =
    `Export the current moderation session to a JSON file?<br>
     <strong style="color:var(--accent)">${count} message(s)</strong> will be saved,<br>
     including toxicity scores, user warnings, and statistics.`;
  document.getElementById('exportModal').classList.add('visible');
}

async function confirmExport() {
  closeModal('exportModal');
  try {
    const resp = await fetch('/api/export');
    if (!resp.ok) throw new Error('Export failed');
    const data = await resp.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `safeguard_session_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Session exported successfully.', 'safe');
  } catch(err) {
    toast(`Export error: ${err.message}`, 'high');
  }
}

/* ═══════════════════════════════════════════════════════════════
   IMPORT
═══════════════════════════════════════════════════════════════ */
function handleImportFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.messages || !Array.isArray(data.messages)) {
        toast('Invalid session file — "messages" array missing.', 'high'); return;
      }
      state.pendingImport = data;
      const exportedAt = data.exported_at ? new Date(data.exported_at).toLocaleString() : 'unknown date';
      document.getElementById('importModalBody').innerHTML =
        `Load session from <strong style="color:var(--accent)">${exportedAt}</strong>?<br>
         <strong style="color:var(--accent)">${data.messages.length} message(s)</strong> will be restored.<br>
         The current session will be replaced.`;
      document.getElementById('importModal').classList.add('visible');
    } catch(_) {
      toast('Could not parse JSON file.', 'high');
    }
    input.value = ''; // reset so same file can be re-selected
  };
  reader.readAsText(file);
}

async function confirmImport() {
  if (!state.pendingImport) return;
  const data = state.pendingImport;  // capture BEFORE closeModal nulls it
  closeModal('importModal');

  try {
    const resp = await fetch('/api/import', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(data),
    });
    if (!resp.ok) throw new Error((await resp.json()).error || 'Import failed');
    const result = await resp.json();

    // Clear chat UI
    const area = document.getElementById('messagesArea');
    area.innerHTML = `
      <div class="welcome-banner">
        <div class="wb-icon">⬡</div>
        <div class="wb-text">
          <strong>Session loaded.</strong><br>
          ${result.loaded} message(s) restored from a previous session.
        </div>
      </div>`;

    // Re-render all messages from imported data
    for (const msg of data.messages) {
      renderMessage(msg);
    }

    // Reset analysis panel
    document.getElementById('analysisBlock').style.display = 'none';

    // Refresh dashboard
    await pollDashboard();
    toast(`Session loaded — ${result.loaded} messages restored.`, 'safe');
    switchTab('moderation');
  } catch(err) {
    toast(`Import error: ${err.message}`, 'high');
  }
}

/* ═══════════════════════════════════════════════════════════════
   MODAL HELPERS
═══════════════════════════════════════════════════════════════ */
function closeModal(id) {
  document.getElementById(id).classList.remove('visible');
  if (id === 'importModal') state.pendingImport = null;
}

// Close modal on overlay click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('visible');
    state.pendingImport = null;
  }
});

/* ═══════════════════════════════════════════════════════════════
   RESET
═══════════════════════════════════════════════════════════════ */
async function resetSystem() {
  if (!confirm('Reset all monitoring data? This cannot be undone.')) return;
  try {
    await fetch('/api/reset', {method:'POST'});
    document.getElementById('messagesArea').innerHTML = `
      <div class="welcome-banner">
        <div class="wb-icon">⬡</div>
        <div class="wb-text"><strong>SAFEGUARD is active.</strong><br>System reset. Monitoring resumed.</div>
      </div>`;
    document.getElementById('analysisBlock').style.display = 'none';
    await pollDashboard();
    toast('System reset successfully.', 'safe');
  } catch(err) {
    toast(`Reset failed: ${err.message}`, 'high');
  }
}

/* ═══════════════════════════════════════════════════════════════
   BEFORE UNLOAD — prompt export if session has data
═══════════════════════════════════════════════════════════════ */
window.addEventListener('beforeunload', (e) => {
  const stats = state.lastDashboard ? state.lastDashboard.stats : null;
  if (stats && stats.total_messages > 0) {
    e.preventDefault();
    e.returnValue = 'You have an active moderation session. Export before leaving?';
  }
});

/* ═══════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUT  (Enter to send)
═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('msgInput');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  input.addEventListener('input', updateCharCount);

  initCharts();
  setInterval(pollDashboard, 3000);
  pollDashboard();
});
