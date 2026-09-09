let activeTier = null;

const demoKeys = {
  'DEMO-STANDARD-1234': 'standard',
  'DEMO-PRO-5678': 'pro',
  'DEMO-FPS-9012': 'fps',
  'DEMO-SEC-3456': 'security',
  'DEMO-INT-7890': 'internet',
  'DEMO-WIN-1111': 'winfix',
  'DEMO-DEEP-2222': 'deep',
  'DEMO-REPAIR-3333': 'repair'
};

const TIERS = {
  standard: { price: 30, unlocks: ['cleanup', 'performance', 'final', 'restore', 'registry', 'disk'] },
  pro: { price: 50, unlocks: ['cleanup', 'performance', 'final', 'pro', 'fps', 'security', 'internet', 'winfix', 'master', 'restore', 'registry', 'disk', 'deep'] },
  fps: { price: 10, unlocks: ['fps', 'restore'] },
  security: { price: 10, unlocks: ['security', 'restore'] },
  internet: { price: 10, unlocks: ['internet', 'restore'] },
  winfix: { price: 10, unlocks: ['winfix', 'restore'] },
  deep: { price: 10, unlocks: ['deep'] },
  repair: { price: 25, unlocks: ['repair', 'restore'] }
};

const PHASES = ['cleanup','performance','final','pro','fps','security','internet','winfix','master','restore','registry','disk','deep','repair'];
const WARN_MSG = ' (web demo — not available in browser)';

function log(msg) {
  const el = document.getElementById('log');
  if (el) el.textContent += msg + '\n';
}

function showProgress(label, pct, status) {
  const container = document.getElementById('progress-container');
  if (container) container.style.display = 'block';
  const lbl = document.getElementById('progress-label');
  if (lbl) lbl.textContent = label;
  const bar = document.getElementById('progress-bar');
  if (bar) bar.style.width = pct + '%';
  const st = document.getElementById('progress-status');
  if (st) st.textContent = status || '';
}

function hideProgress() {
  const container = document.getElementById('progress-container');
  if (container) container.style.display = 'none';
}

function hasAccess(phase) {
  if (!activeTier || !TIERS[activeTier]) return false;
  return TIERS[activeTier].unlocks.includes(phase);
}

function runPhase(phase, label) {
  showProgress(label, 0, 'Web demo...');
  if (!hasAccess(phase)) {
    log(`✖ "${label}" requires a ${findRequiredTier(phase)} license. Get it at https://www.paypal.me/pctechguyonline305`);
    setTimeout(hideProgress, 2000);
    return;
  }
  log(`▶ ${label}${WARN_MSG}`);
  let pct = 0;
  const interval = setInterval(() => {
    pct += 10;
    showProgress(label, pct, 'Simulating...');
    if (pct >= 100) {
      clearInterval(interval);
      log(`✔ ${label} (demo)`);
      setTimeout(hideProgress, 1500);
    }
  }, 300);
}

function findRequiredTier(phase) {
  for (const [tier, info] of Object.entries(TIERS)) {
    if (info.unlocks.includes(phase)) return tier.toUpperCase();
  }
  return 'PRO';
}

async function checkLicense(key) {
  if (!key) {
    const saved = localStorage.getItem('web_license');
    if (saved) {
      const data = JSON.parse(saved);
      activeTier = data.tier;
      return { active: true, tier: data.tier, message: 'License restored from browser storage' };
    }
    return { active: false, tier: null, message: 'No license key entered' };
  }
  const tier = demoKeys[key];
  if (tier) {
    activeTier = tier;
    localStorage.setItem('web_license', JSON.stringify({ tier, key }));
    return { active: true, tier, message: `Activated ${tier.toUpperCase()}! Welcome.` };
  }
  const autoTier = 'standard';
  activeTier = autoTier;
  localStorage.setItem('web_license', JSON.stringify({ tier: autoTier, key }));
  return { active: true, tier: autoTier, message: `Demo mode — ${autoTier.toUpperCase()} tier activated.` };
}

function refreshUI() {
  const badge = document.getElementById('tier-badge');
  if (badge) {
    badge.textContent = activeTier ? activeTier.toUpperCase() : 'NONE';
    badge.style.display = activeTier ? 'inline' : 'none';
  }
  document.querySelectorAll('.phases button').forEach(btn => {
    const phaseMap = {
      'btn-cleanup': 'cleanup', 'btn-performance': 'performance', 'btn-final': 'final',
      'btn-all': 'all', 'btn-pro': 'pro', 'btn-fps': 'fps', 'btn-secure': 'security',
      'btn-restore': 'restore', 'btn-internet': 'internet', 'btn-winfix': 'winfix',
      'btn-registry': 'registry', 'btn-disk': 'disk', 'btn-deep': 'deep', 'btn-master': 'master',
      'btn-repair': 'repair'
    };
    const phase = phaseMap[btn.id];
    if (phase && phase !== 'all') {
      const allowed = hasAccess(phase);
      btn.disabled = !allowed;
      btn.title = allowed ? '' : `Requires ${findRequiredTier(phase)} license — purchase at https://www.paypal.me/pctechguyonline305`;
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  // === Elements ===
  const licenseScreen = document.getElementById('license-screen');
  const appViews = document.getElementById('app');
  const licenseInput = document.getElementById('license-input');
  const activateBtn = document.getElementById('activate-btn');
  const licenseError = document.getElementById('license-error');
  const btnCleanup = document.getElementById('btn-cleanup');
  const btnPerformance = document.getElementById('btn-performance');
  const btnFinal = document.getElementById('btn-final');
  const btnAll = document.getElementById('btn-all');
  const btnPro = document.getElementById('btn-pro');
  const btnFPS = document.getElementById('btn-fps');
  const btnSecure = document.getElementById('btn-secure');
  const btnRestore = document.getElementById('btn-restore');
  const btnInternet = document.getElementById('btn-internet');
  const btnWinfix = document.getElementById('btn-winfix');
  const btnRegistry = document.getElementById('btn-registry');
  const btnDisk = document.getElementById('btn-disk');
  const btnDeep = document.getElementById('btn-deep');
  const btnMaster = document.getElementById('btn-master');
  const btnRepair = document.getElementById('btn-repair');
  const btnExportPdf = document.getElementById('btn-export-pdf');
  const btnReport = document.getElementById('btn-report');

  async function activate(key) {
    const result = await checkLicense(key);
    if (result.active) {
      licenseScreen.style.display = 'none';
      appViews.style.display = 'block';
      refreshUI();
    } else {
      licenseError.textContent = result.message || 'Invalid key';
    }
  }

  // Check saved license on load
  checkLicense('').then(result => {
    if (result.active) {
      licenseScreen.style.display = 'none';
      appViews.style.display = 'block';
      refreshUI();
    }
  });

  activateBtn.onclick = () => activate(licenseInput.value.trim());
  licenseInput.addEventListener('keydown', e => { if (e.key === 'Enter') activate(licenseInput.value.trim()); });

  btnCleanup.onclick = () => runPhase('cleanup', 'Phase 1 — Clean & Clear');
  btnPerformance.onclick = () => runPhase('performance', 'Phase 2 — Performance Boost');
  btnFinal.onclick = () => runPhase('final', 'Phase 3 — Final Sweep');
  btnPro.onclick = () => runPhase('pro', 'PRO Mode');
  btnFPS.onclick = () => runPhase('fps', 'Gaming FPS Booster');
  btnSecure.onclick = () => runPhase('security', 'Security Hardening');
  btnRestore.onclick = () => runPhase('restore', 'Restore Point Creation');
  btnInternet.onclick = () => runPhase('internet', 'Internet/WiFi Optimization');
  btnWinfix.onclick = () => runPhase('winfix', '1‑Click WinFix');
  btnRegistry.onclick = () => runPhase('registry', 'Registry Optimization');
  btnDisk.onclick = () => runPhase('disk', 'Disk Optimization');
  btnDeep.onclick = () => runPhase('deep', 'Windows Deep Optimization');
  btnMaster.onclick = () => runPhase('master', 'PCTG System Master — Ultimate Repair & Speedup');
  btnRepair.onclick = () => runPhase('repair', 'System Test & Repair');

  btnAll.onclick = async () => {
    btnAll.disabled = true;
    for (const p of ['cleanup', 'performance', 'final']) {
      await runPhase(p, `Phase ${p}`);
    }
    btnAll.disabled = false;
  };

  btnExportPdf.onclick = () => log('PDF export not available in web demo.');
  btnReport.onclick = () => log('Report generation not available in web demo.');

  // === Stats (mock) ===
  const statEls = {
    cpu: document.getElementById('stat-cpu'),
    cpuBar: document.getElementById('bar-cpu'),
    cpuInfo: document.getElementById('stat-cpu-info'),
    ram: document.getElementById('stat-ram'),
    ramBar: document.getElementById('bar-ram'),
    ramInfo: document.getElementById('stat-ram-info'),
    uptime: document.getElementById('stat-uptime'),
    uptimeInfo: document.getElementById('stat-uptime-info'),
    os: document.getElementById('stat-os'),
    osInfo: document.getElementById('stat-os-info')
  };

  function mockStats() {
    const cpu = Math.round(20 + Math.random() * 50);
    const ram = Math.round(40 + Math.random() * 30);
    if (statEls.cpu) statEls.cpu.textContent = cpu + '%';
    if (statEls.cpuBar) statEls.cpuBar.style.width = cpu + '%';
    if (statEls.cpuInfo) statEls.cpuInfo.textContent = navigator.hardwareConcurrency + ' cores (web demo)';
    if (statEls.ram) statEls.ram.textContent = ram + '%';
    if (statEls.ramBar) statEls.ramBar.style.width = ram + '%';
    if (statEls.ramInfo) statEls.ramInfo.textContent = '— (web demo)';
    if (statEls.uptime) statEls.uptime.textContent = '—';
    if (statEls.uptimeInfo) statEls.uptimeInfo.textContent = 'Web demo';
    if (statEls.os) statEls.os.textContent = navigator.platform || 'Unknown';
    if (statEls.osInfo) statEls.osInfo.textContent = navigator.userAgent.split(')')[0].split('(').pop() || 'Web browser';
  }

  mockStats();
  setInterval(mockStats, 3000);

  // === Analytics (mock) ===
  async function refreshAnalytics() {
    const el = document.getElementById('anal-installs');
    if (el) el.textContent = '— (web)';
    document.getElementById('anal-updates').textContent = '—';
    document.getElementById('anal-exports').textContent = '—';
    document.getElementById('anal-days').textContent = '—';
  }
  window.refreshAnalytics = refreshAnalytics;

  // === Navigation ===
  function showView(name) {
    document.getElementById('dashboard-view').style.display = name === 'dashboard' ? 'block' : 'none';
    document.getElementById('optimizer-view').style.display = name === 'optimizer' ? 'block' : 'none';
    document.getElementById('analytics-view').style.display = name === 'analytics' ? 'block' : 'none';
    document.getElementById('nav-dashboard').classList.toggle('active', name === 'dashboard');
    document.getElementById('nav-optimizer').classList.toggle('active', name === 'optimizer');
    document.getElementById('nav-analytics').classList.toggle('active', name === 'analytics');
    if (name === 'analytics') refreshAnalytics();
  }

  document.getElementById('nav-dashboard').onclick = () => showView('dashboard');
  document.getElementById('nav-optimizer').onclick = () => showView('optimizer');
  document.getElementById('nav-analytics').onclick = () => showView('analytics');

  // === Benchmark ===
  const BENCH_DURATION = 6000;
  let benchBefore = JSON.parse(localStorage.getItem('web_bench_before') || 'null');
  let benchAfter = JSON.parse(localStorage.getItem('web_bench_after') || 'null');

  function runFpsBenchmark() {
    return new Promise(resolve => {
      const canvas = document.getElementById('bench-canvas');
      const ctx = canvas.getContext('2d');
      let frames = 0, minFps = Infinity, maxFps = 0, lastTime = performance.now(), running = true;
      const startTime = performance.now();
      function draw() {
        if (!running) return;
        const w = canvas.width, h = canvas.height;
        for (let i = 0; i < 500; i++) {
          const x = Math.random() * w, y = Math.random() * h, r = 10 + Math.random() * 30;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = `hsl(${Math.random() * 360}, 80%, 50%)`; ctx.fill();
          ctx.shadowBlur = 15; ctx.shadowColor = '#00ff41';
        }
        ctx.shadowBlur = 0;
        frames++;
        const now = performance.now();
        const elapsed = now - lastTime;
        if (elapsed >= 1000) {
          const fps = Math.round((frames * 1000) / elapsed);
          if (fps < minFps) minFps = fps; if (fps > maxFps) maxFps = fps;
          frames = 0; lastTime = now;
        }
        if (now - startTime < BENCH_DURATION) requestAnimationFrame(draw);
        else { running = false; resolve({ avg: maxFps > 0 ? Math.round((minFps + maxFps) / 2) : 0, min: minFps === Infinity ? 0 : minFps, max: maxFps }); }
      }
      draw();
    });
  }

  function runNetworkBenchmark() {
    return new Promise(resolve => {
      const urls = ['https://www.google.com', 'https://www.cloudflare.com', 'https://www.github.com'];
      let completed = 0, totalTime = 0, errors = 0;
      urls.forEach(url => {
        const start = performance.now();
        fetch(url, { mode: 'no-cors', cache: 'no-store' }).then(() => {
          totalTime += performance.now() - start;
        }).catch(() => errors++).finally(() => {
          completed++;
          if (completed === urls.length) {
            const avg = urls.length - errors > 0 ? Math.round(totalTime / (urls.length - errors)) : 9999;
            resolve({ avg, errors });
          }
        });
      });
      setTimeout(() => resolve({ avg: 9999, errors: urls.length }), 10000);
    });
  }

  async function showBenchResults(fps, net) {
    const box = document.getElementById('bench-results-box');
    if (!box) return;
    box.style.display = 'block';
    box.innerHTML = `<h4 style="color:var(--pctg-neon);margin:0 0 8px">Benchmark Results</h4>
      <div class="result-row"><span>Average FPS</span><span class="result-val">${fps.avg}</span></div>
      <div class="result-row"><span>Min / Max FPS</span><span class="result-val">${fps.min} / ${fps.max}</span></div>
      <div class="result-row"><span>Network Response</span><span class="result-val">${net.avg}ms</span></div>`;
  }

  function calcImprovement(before, after) {
    if (!before || !after) return null;
    const fpsImp = before.fps && after.fps && before.fps.avg > 0 ? Math.round(((after.fps.avg - before.fps.avg) / before.fps.avg) * 100) : 0;
    const netImp = before.net && after.net && before.net.avg > 0 ? Math.round(((before.net.avg - after.net.avg) / before.net.avg) * 100) : 0;
    return { fps: fpsImp, net: netImp, overall: Math.round((fpsImp + Math.max(netImp, 0)) / 2) };
  }

  function showResults() {
    const box = document.getElementById('results-box');
    if (!box) return;
    box.style.display = 'block';
    const imp = calcImprovement(benchBefore, benchAfter);
    if (imp) {
      document.getElementById('res-fps').textContent = (imp.fps >= 0 ? '+' : '') + imp.fps + '%';
      document.getElementById('res-net').textContent = (imp.net >= 0 ? '+' : '') + imp.net + '%';
      document.getElementById('res-overall').textContent = (imp.overall >= 0 ? '+' : '') + imp.overall + '%';
    }
    document.getElementById('res-disk').textContent = '— (web)';
    const log = document.getElementById('log');
    const changes = log ? log.textContent.split('\n').filter(l => l.includes('✔') || l.includes('>>>') || l.includes('complete')).slice(-20) : [];
    document.getElementById('res-changelog').innerHTML = changes.map(c => `<div>• ${c.trim()}</div>`).join('') || '<div>No changes recorded.</div>';
  }

  async function runAllBenchmarks(label) {
    log(`▶ Running ${label}...`);
    try {
      const fps = await runFpsBenchmark();
      log(`  FPS: ${fps.avg} (min ${fps.min}, max ${fps.max})`);
      const net = await runNetworkBenchmark();
      log(`  Network: ${net.avg}ms`);
      const result = { fps, net, time: Date.now() };
      if (!benchBefore) {
        benchBefore = result;
        localStorage.setItem('web_bench_before', JSON.stringify(benchBefore));
        log('✔ Before benchmark saved. Run again after optimization.');
      } else {
        benchAfter = result;
        localStorage.setItem('web_bench_after', JSON.stringify(benchAfter));
        log('✔ After benchmark saved.');
        showResults();
      }
      showBenchResults(fps, net);
    } catch (e) {
      log(`✖ Benchmark error: ${e.message || e}`);
    }
  }

  document.getElementById('btn-bench-open').onclick = () => window.open('https://testmyspec.com/', '_blank');
  document.getElementById('btn-bench-full').onclick = () => runAllBenchmarks('Full Benchmark (FPS + Network)');
  document.getElementById('btn-bench-fps').onclick = async () => {
    log('▶ Running FPS Benchmark...');
    const fps = await runFpsBenchmark();
    log(`  FPS: ${fps.avg}`);
    const box = document.getElementById('bench-results-box');
    if (box) { box.style.display = 'block'; box.innerHTML = `<h4 style="color:var(--pctg-neon);margin:0 0 8px">FPS Result</h4><div class="result-row"><span>Average FPS</span><span class="result-val">${fps.avg}</span></div>`; }
  };
  document.getElementById('btn-bench-net').onclick = async () => {
    log('▶ Running Network Benchmark...');
    const net = await runNetworkBenchmark();
    log(`  Network: ${net.avg}ms`);
    const box = document.getElementById('bench-results-box');
    if (box) { box.style.display = 'block'; box.innerHTML = `<h4 style="color:var(--pctg-neon);margin:0 0 8px">Network Result</h4><div class="result-row"><span>Avg Response</span><span class="result-val">${net.avg}ms</span></div>`; }
  };

  if (benchBefore && benchAfter) showResults();

  // === Toggle Section ===
  let toggleState = JSON.parse(localStorage.getItem('web_toggle_state') || '{"startupApps":false,"backgroundApps":false,"telemetry":false,"gameBar":false,"oneDrive":false,"widgets":false}');

  function setupToggleButtons() {
    document.querySelectorAll('.toggle-btn').forEach(btn => {
      const key = btn.dataset.toggle;
      if (toggleState[key]) {
        btn.classList.add('active');
        btn.textContent = 'ON';
      }
      btn.addEventListener('click', () => {
        toggleState[key] = !toggleState[key];
        btn.classList.toggle('active');
        btn.textContent = toggleState[key] ? 'ON' : 'OFF';
        localStorage.setItem('web_toggle_state', JSON.stringify(toggleState));
        log(`Toggle "${key}" → ${toggleState[key] ? 'ON' : 'OFF'} (web demo — no system effect)`);
      });
    });
  }
  setupToggleButtons();

  // === Section Toggle ===
  window.toggleSection = function(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const body = el.querySelector('.section-body');
    const hdr = el.querySelector('.section-toggle');
    if (body.style.display === 'none') {
      body.style.display = 'block';
      hdr.textContent = hdr.textContent.replace('▶', '▼');
    } else {
      body.style.display = 'none';
      hdr.textContent = hdr.textContent.replace('▼', '▶');
    }
  };

  // === Keydown ===
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && e.key === 'R') {
      localStorage.removeItem('web_bench_before');
      localStorage.removeItem('web_bench_after');
      benchBefore = null; benchAfter = null;
      const box = document.getElementById('results-box');
      if (box) box.style.display = 'none';
      log('✔ Benchmarks reset.');
    }
    if (e.ctrlKey && e.shiftKey && e.key === 'U') {
      window.location.reload();
    }
  });
});
