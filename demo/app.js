/* PCTG System Optimizer Pro — interactive demo (simulated).
   Nothing here touches a real system. All data is dummy. */
(function () {
  'use strict';

  /* ============ STATE ============ */
  var state = {
    health: 58,
    junkGB: 12.4,
    tempC: 64,
    diskFree: 148,
    fps: 87,
    bootSec: 23,
    security: 61,
    lastRun: null,
    modules: [
      { id: 'clean', icon: '🧹', name: 'Clean & Clear', desc: 'Phase 1 — junk & temp cleanup', applied: false },
      { id: 'boost', icon: '⚡', name: 'Performance Boost', desc: 'Phase 2 — speed & responsiveness', applied: false },
      { id: 'sweep', icon: '✨', name: 'Final Sweep', desc: 'Phase 3 — polish & finish', applied: false },
      { id: 'gaming', icon: '🎮', name: 'Gaming FPS Booster', desc: 'Frame-rate focused tuning', applied: false },
      { id: 'security', icon: '🔒', name: 'Security Hardening', desc: 'Defender, firewall, UAC', applied: false },
      { id: 'internet', icon: '🌐', name: 'Internet / WiFi', desc: 'DNS, Winsock & network tuning', applied: false },
      { id: 'winfix', icon: '🩹', name: '1-Click WinFix', desc: 'SFC & system file repair', applied: false },
      { id: 'deep', icon: '🔍', name: 'Deep Optimize', desc: 'Startup, telemetry & toggles', applied: false },
      { id: 'registry', icon: '📋', name: 'Registry Optimizer', desc: 'Menu delay, Superfetch, tips', applied: false },
      { id: 'disk', icon: '💾', name: 'Disk Optimizer', desc: 'TRIM & drive optimisation', applied: false },
      { id: 'repair', icon: '🛠️', name: 'System Test & Repair', desc: 'SFC/DISM, CHKDSK, BCD, memory', applied: false },
      { id: 'report', icon: '📄', name: 'PDF Report', desc: 'Export your results', applied: false }
    ],
    benchmarks: { before: null, after: null },
    restorePoints: [
      { id: 1, at: '2026-09-08 21:14', note: 'Before first optimisation (demo)' }
    ],
    settings: {
      autoClean: true,
      notifications: true,
      telemetry: false,
      startWithWindows: false,
      gameMode: true,
      lowLatency: true
    },
    licence: 'PRO trial' // 'PRO', 'Standard', 'Repair', or trail message
  };

  var toasts = { next: 1 };
  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };
  var runId = 0;

  /* ============ HELPERS ============ */
  function fmt(n) { return n.toLocaleString('en-GB'); }

  function toast(msg, kind) {
    kind = kind || '';
    var el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(function () { el.remove(); }, 4200);
  }

  function modal(html) {
    $('#modal-body').innerHTML = html;
    $('#modal').hidden = false;
  }
  function closeModal() { $('#modal').hidden = true; }

  function newRunId() { return 'PCTG-' + String(++runId).padStart(4, '0') + '-' + Date.now().toString(16).toUpperCase(); }

  /* ============ NAV ============ */
  var VIEWS = ['dashboard', 'optimise', 'modules', 'benchmark', 'restore', 'licences', 'settings'];
  var TITLES = {
    dashboard: 'Dashboard',
    optimise: 'One-Click Optimise',
    modules: 'Toolkit Modules',
    benchmark: 'Benchmark',
    restore: 'Restore Points',
    licences: 'Licences',
    settings: 'Settings'
  };

  function go(view) {
    VIEWS.forEach(function (v) {
      $('#view-' + v).hidden = (v !== view);
    });
    $$('.nav-item').forEach(function (b) { b.classList.toggle('active', b.dataset.view === view); });
    $('#page-title').textContent = TITLES[view];
    render[view]();
  }

  /* ============ DASHBOARD ============ */
  function renderDashboard() {
    var health = state.health;
    var hCls = health >= 75 ? 'ok' : (health >= 45 ? 'warn' : 'bad');
    $('#view-dashboard').innerHTML =
      '<div class="grid">' +
      '<div class="card"><h3>System health</h3><div class="big ' + hCls + '">' + health + '%</div><div class="sub">Demo machine · Windows 11</div>' +
      '<div class="mini-bar"><i style="width:' + health + '%"></i></div></div>' +
      '<div class="card"><h3>Junk found</h3><div class="big neon">' + state.junkGB.toFixed(1) + ' GB</div><div class="sub">Cleanable — temp, cache, logs</div></div>' +
      '<div class="card"><h3>CPU temp</h3><div class="big ' + (state.tempC > 75 ? 'bad' : 'warn') + '">' + state.tempC + '°C</div><div class="sub">Idle average</div></div>' +
      '<div class="card"><h3>Gaming FPS</h3><div class="big ok">' + state.fps + '</div><div class="sub">Avg. in demo games</div></div>' +
      '<div class="card"><h3>Boot time</h3><div class="big">' + state.bootSec + 's</div><div class="sub">Last cold boot</div></div>' +
      '<div class="card"><h3>Security score</h3><div class="big ' + (state.security >= 75 ? 'ok' : 'warn') + '">' + state.security + '%</div><div class="sub">Defender · Firewall · UAC</div></div>' +
      '</div>' +
      '<div class="panel">' +
      '<h2>Quick actions</h2>' +
      '<p class="lede">The full 20-minute optimisation protocol, compressed into one click (simulated here, of course).</p>' +
      '<div class="panel-row">' +
      '<button class="btn btn-green" id="qa-optimise">🚀 Run Optimisation</button>' +
      '<button class="btn btn-primary" id="qa-bench">📊 Run Benchmark</button>' +
      '<button class="btn btn-outline" id="qa-restore">↩️ Restore Point</button>' +
      '</div>' +
      '</div>' +
      (state.lastRun
        ? '<div class="panel"><h2>Last run</h2><p class="lede">' + state.lastRun + '</p>' +
          '<div class="panel-row"><span class="tag ok">Restore point available</span></div></div>'
        : '<div class="panel"><h2>Ready when you are</h2><p class="lede">No optimisation has run yet in this demo session. Hit <b>Run Optimisation</b> above and watch the three-phase protocol play out.</p></div>');

    $('#qa-optimise').addEventListener('click', function () { go('optimise'); setTimeout(runOptimisation, 60); });
    $('#qa-bench').addEventListener('click', function () { go('benchmark'); setTimeout(runBenchmark, 60); });
    $('#qa-restore').addEventListener('click', createRestorePoint);
  }

  /* ============ OPTIMISE (CLI console) ============ */
  var consoleEl, progressEl, progressLbl, optBtn, optDone = false;

  function logWrite(html) {
    var d = document.createElement('div');
    d.innerHTML = html;
    consoleEl.appendChild(d);
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function runOptimisation() {
    if (optDone) { toast('Optimisation already run in this session — reset (Settings) to run again.', 'warn'); return; }
    if (optBtn) optBtn.disabled = true;
    logWrite('<span class="t-neon">▍Starting PCTG 3-phase optimisation protocol…</span>');
    logWrite('<span class="t-dim">▍Run ID: ' + newRunId() + ' · demo machine · Windows 11</span>');
    logWrite('');

    var phases = [
      { name: 'PHASE 1 — CLEAN & CLEAR', steps: [
        ['✓', 'Temp files cleared', 't-ok'], ['✓', 'Recycle bin emptied', 't-ok'],
        ['✓', 'Windows Update cache purged', 't-ok'], ['✓', 'Browser clutter removed', 't-ok'],
        ['✓', 'Thumbnail + prefetch caches rebuilt', 't-ok']
      ] },
      { name: 'PHASE 2 — PERFORMANCE BOOST', steps: [
        ['✓', 'Game mode enabled + GPU scheduling tuned', 't-ok'],
        ['✓', 'Timer resolution tightened for smoother frames', 't-ok'],
        ['✓', 'Startup apps trimmed (22 → 9)', 't-ok'],
        ['✓', 'Disk TRIM + Superfetch tuned', 't-ok'],
        ['✓', 'Network + DNS latency optimised', 't-ok']
      ] },
      { name: 'PHASE 3 — FINAL SWEEP', steps: [
        ['✓', 'Registry menu-delay + visuals smoothed', 't-ok'],
        ['✓', 'Defender + firewall re-hardened', 't-ok'],
        ['✓', 'UAC + exploit protection verified', 't-ok'],
        ['✓', 'Restore point written', 't-ok']
      ] }
    ];

    var est = 900;
    logWrite('<span class="t-neon">▍Clean → Boost → Sweep · estimated ' + (est / 1000).toFixed(0) + 's (demo speed)</span>\n');
    progressEl.style.width = '0%';
    progressLbl.textContent = '0%';

    var seq = (function () {
      var i = -1;
      return function next() {
        i += 1;
        var ph = phases[i];
        if (!ph) { finish(); return; }
        logWrite('\n<span class="t-neon">▶ ' + ph.name + '</span>');
        var j = -1;
        (function stepPh() {
          j += 1;
          if (j >= ph.steps.length) { setTimeout(next, 120); return; }
          var s = ph.steps[j];
          setTimeout(function () {
            logWrite('<span class="' + s[2] + '">' + s[0] + ' ' + s[1] + '</span>');
            var base = (i * 100 + ((j + 1) / ph.steps.length) * 100) / phases.length;
            setProgress(Math.min(100, Math.round(base)));
            setTimeout(stepPh, 150 + Math.random() * 160);
          }, 60);
        })();
      };
    })();
    setTimeout(seq, 100);

    function finish() {
      state.junkGB = 0.2;
      state.tempC = Math.max(41, state.tempC - 12);
      state.fps = Math.min(240, state.fps + 28);
      state.bootSec = Math.max(9, state.bootSec - 6);
      state.security = Math.min(100, state.security + 24);
      state.health = Math.min(100, state.health + 18);
      state.lastRun = 'Full 3-phase optimisation · ' + new Date().toLocaleTimeString('en-GB');
      state.modules.forEach(function (m) { if (m.id !== 'report') m.applied = true; });
      state.restorePoints.push({ id: Date.now(), at: stamp(), note: 'Auto restore point — before full optimisation' });
      optDone = true;
      setProgress(100);
      progressLbl.textContent = '100%';
      logWrite('\n<span class="t-neon">▍Done.</span> <span class="t-ok">Health 58% → ' + state.health + '% · Boot ' + state.bootSec + 's · FPS ' + state.fps + '</span>'
        + '\n<span class="t-dim">▍Restore point written — everything is reversible (simulated).</span>');
      if (optBtn) {
        optBtn.textContent = '✅ Optimisation complete';
        optBtn.disabled = false;
      }
      toast('Optimisation complete (simulated) — restore point saved.', 'ok');
      renderSideHealth();
    }
  }

  function setProgress(p) {
    progressEl.style.width = p + '%';
    progressLbl.textContent = p + '%';
  }

  function renderOptimise() {
    $('#view-optimise').innerHTML =
      '<div class="panel">' +
      '<h2>One-Click Optimise</h2>' +
      '<p class="lede">Runs the same Clean → Boost → Sweep playbook a pro tech would run. In the real app this takes ~20 minutes; here it plays out in seconds with simulated output.</p>' +
      '<div class="panel-row" style="margin-bottom:16px"><button class="btn btn-green" id="opt-run">🚀 Run Optimisation</button></div>' +
      '<div class="progress-wrap"><i id="opt-progress"></i></div>' +
      '<div class="progress-lbl" id="opt-progress-lbl">0% — idle</div>' +
      '<div class="console" id="opt-console">' +
      '<span class="t-dim">// PCTG System Optimizer Pro — interactive demo\n// Type nothing, click the button. Everything here is simulated.</span>' +
      '</div></div>';

    consoleEl = $('#opt-console');
    progressEl = $('#opt-progress');
    progressLbl = $('#opt-progress-lbl');
    optBtn = $('#opt-run');
    optBtn.addEventListener('click', function () { runOptimisation(); });
  }

  /* ============ MODULES ============ */
  function renderModules() {
    var html = '<div class="panel"><h2>The full toolkit</h2><p class="lede">The 12 modules that ship in the real app. In this demo, "applied" badges update when the optimisation runs above.</p></div>';
    html += '<div class="mods">';
    state.modules.forEach(function (m) {
      html += '<div class="mod' + (m.applied ? ' done' : '') + '" data-mod="' + m.id + '">' +
        '<div class="mi">' + m.icon + '</div>' +
        '<div><h4>' + m.name + ' <span class="mod-status">' + (m.applied ? 'APPLIED' : 'READY') + '</span></h4>' +
        '<p>' + m.desc + '</p></div></div>';
    });
    html += '</div>' +
      '<div class="panel"><h2>Single-module licences</h2>' +
      '<p class="lede">FPS Booster, Security, Internet/WiFi, WinFix and Deep Optimize are each available as focused £10 licences in the real product.</p>' +
      '<button class="btn btn-outline" id="mod-see-lic">See licence prices</button></div>';
    $('#view-modules').innerHTML = html;
    $('#mod-see-lic').addEventListener('click', function () {
      modal('<h3>Focused £10 licences</h3><p>Pick the one module you need, pay once, use forever — plus a PDF report and full restore.</p>' +
        '<div class="code">🎮 FPS Booster · £10\n🔒 Security Hardening · £10\n🌐 Internet / WiFi · £10\n🩹 1-Click WinFix · £10\n🔍 Deep Optimize · £10</div>' +
        '<a class="btn btn-primary" href="https://www.paypal.me/pctechguyonline305/10" target="_blank" rel="noopener">Buy a £10 Module</a>');
    });
  }

  /* ============ BENCHMARK ============ */
  var benchRunning = false;
  function runBenchmark() {
    if (benchRunning) return;
    benchRunning = true;
    state.benchmarks.before = {
      fps: state.fps - 31, boot: state.bootSec + 9, disk: 214, temp: state.tempC + 6, score: 6210
    };
    $('#view-benchmark').innerHTML =
      '<div class="panel"><h2>Running benchmark…</h2>' +
      '<p class="lede">Simulated suite — PCMark-style scoring, FPS, boot time, disk throughput and temperature.</p>' +
      '<div class="progress-wrap"><i id="bench-progress"></i></div>' +
      '<div class="progress-lbl" id="bench-progress-lbl">0%</div>' +
      '<div class="console" id="bench-console"><span class="t-dim">// Warm-up complete. Running GPU + CPU + disk + network workloads…</span></div></div>';
    var bp = $('#bench-progress'), bl = $('#bench-progress-lbl'), bc = $('#bench-console');
    var p = 0;
    var iv = setInterval(function () {
      p += 7 + Math.random() * 10;
      if (p >= 100) {
        clearInterval(iv);
        p = 100;
        state.benchmarks.after = {
          fps: state.fps, boot: state.bootSec, disk: Math.max(160, 214 - 48), temp: state.tempC, score: 8280
        };
        renderBenchResults();
        toast('Benchmark complete (simulated) — PDF report ready.', 'ok');
        benchRunning = false;
      }
      bp.style.width = p + '%';
      bl.textContent = Math.round(p) + '%';
      bc.innerHTML += '\n<span class="t-ok">✓ workload ' + Math.round(p / 10) + ' of 10 complete</span>';
      bc.scrollTop = bc.scrollHeight;
    }, 160);
  }

  function renderBenchResults() {
    var b = state.benchmarks.before, a = state.benchmarks.after;
    $('#view-benchmark').innerHTML =
      '<div class="panel"><h2>Benchmark — before vs after</h2>' +
      '<p class="lede">Simulated results. The real app exports these to a PDF report. Higher is better except boot time and temperature.</p>' +
      '<div class="bench-card">' +
      '<div class="bench-col"><h4>Before optimisation</h4>' +
      '<div class="bench-row"><span>Overall score</span><b>' + fmt(b.score) + '</b></div>' +
      '<div class="bench-row"><span>Avg FPS</span><b>' + b.fps + '</b></div>' +
      '<div class="bench-row"><span>Boot time</span><b>' + b.boot + 's</b></div>' +
      '<div class="bench-row"><span>Disk read</span><b>' + b.disk + ' MB/s</b></div>' +
      '<div class="bench-row"><span>CPU temp</span><b>' + b.temp + '°C</b></div>' +
      '</div>' +
      '<div class="vs-tag">▼ Afte<span style="opacity:0.4">r</span></div>' +
      '<div class="bench-col"><h4>After optimisation (simulated)</h4>' +
      '<div class="bench-row"><span>Overall score</span><b class="t-ok">' + fmt(a.score) + '</b></div>' +
      '<div class="bench-row"><span>Avg FPS</span><b class="t-ok">' + a.fps + '</b></div>' +
      '<div class="bench-row"><span>Boot time</span><b class="t-ok">' + a.boot + 's</b></div>' +
      '<div class="bench-row"><span>Disk read</span><b class="t-ok">' + a.disk + ' MB/s</b></div>' +
      '<div class="bench-row"><span>CPU temp</span><b class="t-ok">' + a.temp + '°C</b></div>' +
      '</div>' +
      '</div>' +
      '<div class="panel-row" style="margin-top:18px">' +
      '<button class="btn btn-primary" id="bench-re-run">↻ Re-run</button>' +
      '<button class="btn btn-outline" id="bench-pdf">📄 Export PDF Report</button>' +
      '</div></div>';

    var diff = Math.round(((a.score - b.score) / b.score) * 100);
    $('#bench-pdf').addEventListener('click', function () {
      modal('<h3>PDF report exported (simulated)</h3><p>The real PCTG System Optimizer Pro generates a results report you can keep as proof of the work done.</p>' +
        '<div class="code">Demo_Report.pdf\nScore ' + fmt(a.score) + ' (+' + diff + '% vs before)\nFPS ' + a.fps + ' · Boot ' + a.boot + 's · Temp ' + a.temp + '°C</div>' +
        '<p class="lede" style="margin:0">Licence keys unlock full PDF export in the real app.</p>');
    });
    $('#bench-re-run').addEventListener('click', function () { runBenchmark(); });
  }

  function renderBenchmark() {
    if (!state.benchmarks.before && !state.benchmarks.after) {
      $('#view-benchmark').innerHTML =
        '<div class="panel"><h2>Benchmark</h2>' +
        '<p class="lede">Measure before, optimise, measure again — and export the proof as a PDF. This demo simulates a full benchmark run.</p>' +
        '<button class="btn btn-primary" id="bench-start">📊 Run Benchmark</button></div>';
      $('#bench-start').addEventListener('click', function () { runBenchmark(); });
    } else if (state.benchmarks.after) {
      renderBenchResults();
    } else {
      runBenchmark();
    }
  }

  /* ============ RESTORE ============ */
  function stamp() { return new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-GB'); }

  function createRestorePoint() {
    var pt = { id: Date.now(), at: stamp(), note: 'Manual restore point (demo)' };
    state.restorePoints.unshift(pt);
    toast('Restore point created (simulated)', 'ok');
    renderRestore();
  }

  function renderRestore() {
    var html = '<div class="panel"><h2>Restore points</h2>' +
      '<p class="lede">Every optimisation in the real app writes a restore point — nothing is left behind you can\'t undo. In this demo, rolling back just resets the simulated stats.</p>' +
      '<button class="btn btn-outline" id="rp-create">➕ Create restore point</button></div>';
    html += '<div class="panel" style="padding:0"><table class="table"><thead><tr><th>Created</th><th>Note</th><th></th></tr></thead><tbody>';
    state.restorePoints.forEach(function (p) {
      html += '<tr><td>' + p.at + '</td><td>' + p.note + '</td><td style="text-align:right"><button class="btn btn-danger" data-rp="' + p.id + '">Roll back</button></td></tr>';
    });
    html += '</tbody></table></div>';
    $('#view-restore').innerHTML = html;
    $('#rp-create').addEventListener('click', createRestorePoint);
    $$('#view-restore [data-rp]').forEach(function (b) {
      b.addEventListener('click', function () { rollback(b.dataset.rp); });
    });
  }

  function rollback(id) {
    state.health = Math.max(30, state.health - 10);
    state.junkGB = Math.min(12.4, state.junkGB + 2.5);
    state.fps = Math.max(60, state.fps - 8);
    state.lastRun = 'Rolled back to restore point (simulated)';
    toast('Rolled back to restore point (simulated)', 'warn');
    renderRestore();
    renderSideHealth();
  }

  /* ============ LICENCES ============ */
  function renderLicences() {
    $('#view-licences').innerHTML =
      '<div class="panel"><h2>Licences — pay once, use forever</h2>' +
      '<p class="lede">Real pricing from the product page. In this demo you can also "activate" a licence key just to see the flow.</p>' +
      '<div class="lic-badge" style="font-size:13px; display:inline-block; margin-top:4px">Current: ' + state.licence + '</div></div>' +
      '<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(230px,1fr))">' +
      '<div class="plan featured"><div class="p-name">PRO</div><div class="p-price">£50 <small>· best value</small></div>' +
      '<ul><li>Everything in Standard</li><li>Gaming FPS booster</li><li>Security hardening</li><li>Internet / WiFi</li><li>1-Click WinFix</li><li>Deep optimisation + toggles</li><li>Full restore</li></ul>' +
      '<a class="btn btn-primary" href="https://www.paypal.me/pctechguyonline305/50" target="_blank" rel="noopener">Buy PRO — £50</a></div>' +
      '<div class="plan"><div class="p-name">Standard</div><div class="p-price">£30</div>' +
      '<ul><li>Clean &amp; Clear</li><li>Performance Boost</li><li>Final Sweep</li><li>Full restore</li></ul>' +
      '<a class="btn btn-outline" href="https://www.paypal.me/pctechguyonline305/30" target="_blank" rel="noopener">Buy Standard — £30</a></div>' +
      '<div class="plan"><div class="p-name">System Test &amp; Repair</div><div class="p-price">£25</div>' +
      '<ul><li>SFC / DISM repair</li><li>CHKDSK disk check</li><li>BCD boot check</li><li>Network reset</li><li>Memory diagnostic</li></ul>' +
      '<a class="btn btn-outline" href="https://www.paypal.me/pctechguyonline305/25" target="_blank" rel="noopener">Buy Repair — £25</a></div>' +
      '</div>' +
      '<div class="panel"><h2>Activate a key (demo)</h2>' +
      '<p class="lede">Enter any made-up key in the format <b>PCTG-XXXX-XXXX</b> and watch the simulated activation flow.</p>' +
      '<div class="panel-row"><input class="input" id="lic-key" placeholder="PCTG-ABCD-1234" style="max-width:320px" />' +
      '<button class="btn btn-primary" id="lic-activate">Activate</button></div>' +
      '<div class="sub" style="font-size:12px; color:var(--muted); margin-top:8px">This only changes the demo UI — no real licence is granted.</div></div>';

    $('#lic-activate').addEventListener('click', function () {
      var k = $('#lic-key').value.trim().toUpperCase();
      var ok = /^PCTG-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(k);
      if (!ok) { toast('Key format: PCTG-XXXX-XXXX (demo format)', 'warn'); return; }
      state.licence = 'PRO (activated, demo)';
      $('#lic-badge').textContent = state.licence;
      toast('Licence activated (simulated) — welcome aboard!', 'ok');
      renderLicences();
    });
  }

  /* ============ SETTINGS ============ */
  function renderSettings() {
    var html = '<div class="panel"><h2>Settings</h2><p class="lede">Demo toggles — they change the UI state only. The real app persists these on your machine.</p></div>';
    html += '<div class="panel">';
    Object.keys(state.settings).forEach(function (k) {
      var lbl = k.replace(/([A-Z])/g, ' $1');
      lbl = lbl.charAt(0).toUpperCase() + lbl.slice(1);
      html += '<div class="toggle-row"><div><div class="tr-t">' + lbl + '</div><div class="tr-s">Simulated preference</div></div>' +
        '<label class="toggle"><input type="checkbox" data-set="' + k + '"' + (state.settings[k] ? ' checked' : '') + '><span class="slider"></span></label></div>';
    });
    html += '</div>';
    html += '<div class="panel"><h2>Demo session</h2><p class="lede">Reset the simulated machine back to its original state.</p>' +
      '<button class="btn btn-danger" id="set-reset">♻️ Reset demo</button></div>';
    $('#view-settings').innerHTML = html;

    $$('#view-settings [data-set]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        state.settings[cb.dataset.set] = cb.checked;
        toast(cb.dataset.set + ' → ' + (cb.checked ? 'on' : 'off') + ' (simulated)', '');
      });
    });
    $('#set-reset').addEventListener('click', function () {
      state.health = 58; state.junkGB = 12.4; state.tempC = 64; state.diskFree = 148;
      state.fps = 87; state.bootSec = 23; state.security = 61; state.lastRun = null;
      state.modules.forEach(function (m) { m.applied = false; });
      state.benchmarks = { before: null, after: null };
      state.restorePoints = [{ id: 1, at: '2026-09-08 21:14', note: 'Before first optimisation (demo)' }];
      optDone = false;
      if (optBtn) { optBtn.textContent = '🚀 Run Optimisation'; optBtn.disabled = false; }
      toast('Demo reset — back to the original simulated machine.', 'ok');
      renderSideHealth();
      go('dashboard');
    });
  }

  /* ============ SIDE HEALTH ============ */
  function renderSideHealth() {
    $('#side-health').textContent = 'Health: ' + state.health + '%';
    var ok = state.health >= 75;
    $('#side-health').style.color = ok ? 'var(--ok)' : (state.health >= 45 ? 'var(--warn)' : 'var(--bad)');
  }

  /* ============ BOOT ============ */
  function render() {
    return {
      dashboard: renderDashboard,
      optimise: renderOptimise,
      modules: renderModules,
      benchmark: renderBenchmark,
      restore: renderRestore,
      licences: renderLicences,
      settings: renderSettings
    };
  }

  function boot() {
    var r = render();

    $$('.nav-item').forEach(function (b) {
      b.addEventListener('click', function () { go(b.dataset.view); });
    });

    $('#db-close').addEventListener('click', function () { $('#demo-banner').remove(); });
    $('#modal-close').addEventListener('click', closeModal);
    $('#modal').addEventListener('click', function (e) { if (e.target === $('#modal')) closeModal(); });

    setInterval(function () {
      $('#clock').textContent = new Date().toLocaleTimeString('en-GB');
    }, 1000);

    renderSideHealth();
    go('dashboard');
  }

  document.addEventListener('DOMContentLoaded', boot);
})();