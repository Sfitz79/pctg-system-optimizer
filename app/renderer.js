let activeTier = null;

// ======== Three.js 3D Intro ========
function initIntro() {
  const container = document.getElementById('intro-3d-webgl');
  const canvas = document.getElementById('intro-canvas');
  if (!container || !canvas || typeof THREE === 'undefined') {
    if (container) container.style.display = 'none';
    return;
  }

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 30;

  // === Ambient red particles ===
  const pCount = 600;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(pCount * 3);
  const pVel = new Float32Array(pCount * 3);
  const pCol = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++) {
    pPos[i * 3] = (Math.random() - 0.5) * 80;
    pPos[i * 3 + 1] = (Math.random() - 0.5) * 80;
    pPos[i * 3 + 2] = (Math.random() - 0.5) * 80;
    pVel[i * 3] = (Math.random() - 0.5) * 0.015;
    pVel[i * 3 + 1] = (Math.random() - 0.5) * 0.015;
    pVel[i * 3 + 2] = (Math.random() - 0.5) * 0.015;
    pCol[i * 3] = 1.0;
    pCol[i * 3 + 1] = Math.random() * 0.15;
    pCol[i * 3 + 2] = Math.random() * 0.15;
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pMat = new THREE.PointsMaterial({
    size: 0.3, vertexColors: true, transparent: true, opacity: 0.6,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const particles = new THREE.Points(pGeo, pMat);
  scene.add(particles);

  // === Energy burst particles (for logo reveal) ===
  const bCount = 250;
  const bGeo = new THREE.BufferGeometry();
  const bPos = new Float32Array(bCount * 3);
  const bVel = new Float32Array(bCount * 3);
  const bCol = new Float32Array(bCount * 3);
  for (let i = 0; i < bCount; i++) {
    bPos[i * 3] = 0; bPos[i * 3 + 1] = 0; bPos[i * 3 + 2] = 0;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const speed = 0.25 + Math.random() * 0.45;
    bVel[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
    bVel[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
    bVel[i * 3 + 2] = Math.cos(phi) * speed;
    bCol[i * 3] = 1.0;
    bCol[i * 3 + 1] = Math.random() * 0.25;
    bCol[i * 3 + 2] = Math.random() * 0.25;
  }
  bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
  bGeo.setAttribute('color', new THREE.BufferAttribute(bCol, 3));
  const bMat = new THREE.PointsMaterial({
    size: 0.5, vertexColors: true, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const burst = new THREE.Points(bGeo, bMat);
  scene.add(burst);

  // === DOM refs ===
  const scanline = document.getElementById('intro-scanline');
  const statsPanel = document.getElementById('intro-stats');
  const valCpu = document.getElementById('intro-val-cpu');
  const valRam = document.getElementById('intro-val-ram');
  const valFps = document.getElementById('intro-val-fps');
  const barCpu = document.getElementById('intro-bar-cpu');
  const barRam = document.getElementById('intro-bar-ram');
  const effects = document.getElementById('intro-effects');
  const fx1 = document.getElementById('intro-fx-1');
  const fx2 = document.getElementById('intro-fx-2');
  const fx3 = document.getElementById('intro-fx-3');
  const logoContainer = document.getElementById('intro-logo-container');
  const tagline = document.getElementById('intro-tagline');
  const boosted = document.getElementById('intro-boosted');

  function lerp(a, b, t) { return a + (b - a) * Math.min(Math.max(t, 0), 1); }
  function easeOut(t) { return 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3); }

  let burstFired = false;
  const t0 = performance.now();

  function animate() {
    const ms = performance.now() - t0;
    const s = ms / 1000;

    if (ms > 8700) {
      container.classList.add('hidden');
      setTimeout(() => {
        container.style.display = 'none';
        checkLicense();
        initOptimizer();
        initBenchmarks();
        refreshStats();
        refreshReport();
        setInterval(refreshStats, 2000);
      }, 600);
      return;
    }

    // --- Three.js ambient particles ---
    const pos = pGeo.attributes.position.array;
    for (let i = 0; i < pCount; i++) {
      pos[i * 3] += pVel[i * 3];
      pos[i * 3 + 1] += pVel[i * 3 + 1];
      pos[i * 3 + 2] += pVel[i * 3 + 2];
    }
    pGeo.attributes.position.needsUpdate = true;
    particles.rotation.y += 0.0015;
    particles.rotation.x = Math.sin(s * 0.25) * 0.06;
    const gFade = Math.min(1, s * 1.5) * (1 - Math.max(0, (s - 7.2) / 1.2));
    pMat.opacity = gFade * 0.6;

    // --- SCENE 1: System Wake-Up (0 - 1.5 s) ---
    if (s < 1.5) {
      const sp = s / 1.5;
      scanline.style.opacity = String(1 - sp * 0.6);
      scanline.style.top = (sp * 100) + '%';
      if (s > 0.35) {
        const sf = easeOut((s - 0.35) / 0.4);
        statsPanel.style.opacity = String(sf);
        barCpu.style.width = '100%';
        barRam.style.width = '100%';
      }
    } else {
      scanline.style.opacity = '0';
    }

    // --- SCENE 2: Optimization (1.5 - 3.5 s) ---
    if (s >= 1.5 && s < 3.5) {
      const ot = (s - 1.5) / 2;
      effects.style.opacity = '1';
      if (ot > 0.05) fx1.style.opacity = String(easeOut((ot - 0.05) / 0.15));
      if (ot > 0.25) fx2.style.opacity = String(easeOut((ot - 0.25) / 0.15));
      if (ot > 0.45) fx3.style.opacity = String(easeOut((ot - 0.45) / 0.15));
      const cpu = Math.round(lerp(100, 42, easeOut(ot)));
      const ram = Math.round(lerp(87, 38, easeOut(ot)));
      const fps = Math.round(lerp(45, 240, easeOut(ot)));
      valCpu.textContent = cpu + '%';
      valRam.textContent = ram + '%';
      valFps.textContent = String(fps);
      barCpu.style.width = cpu + '%';
      barRam.style.width = ram + '%';
    }
    if (s >= 3.0 && s < 4.2) {
      const fade = 1 - (s - 3.0) / 1.2;
      effects.style.opacity = String(Math.max(0, fade));
      statsPanel.style.opacity = String(Math.max(0, fade));
    }

    // --- SCENE 3: Logo Reveal (3.5 - 5.5 s) ---
    if (s >= 3.5 && s < 5.5) {
      const lt = (s - 3.5) / 2;
      if (!burstFired) {
        burstFired = true;
        bMat.opacity = 1;
        const bp = bGeo.attributes.position.array;
        for (let i = 0; i < bCount; i++) { bp[i * 3] = 0; bp[i * 3 + 1] = 0; bp[i * 3 + 2] = 0; }
      }
      const bp = bGeo.attributes.position.array;
      for (let i = 0; i < bCount; i++) {
        bp[i * 3] += bVel[i * 3];
        bp[i * 3 + 1] += bVel[i * 3 + 1];
        bp[i * 3 + 2] += bVel[i * 3 + 2];
      }
      bGeo.attributes.position.needsUpdate = true;
      bMat.opacity = Math.max(0, 1 - lt * 1.4);
      const lf = easeOut(lt / 0.45);
      logoContainer.style.opacity = String(lf);
      logoContainer.style.transform = 'translate(-50%,-50%) scale(' + (0.4 + lf * 0.6) + ')';
    }

    // --- SCENE 4: Hero Shot (5.5 - 8 s) ---
    if (s >= 5.5) {
      const ht = (s - 5.5) / 2.5;
      tagline.style.opacity = String(easeOut(ht / 0.35));
      if (ht > 0.25) {
        const bf = easeOut((ht - 0.25) / 0.3);
        boosted.style.opacity = String(bf);
        boosted.style.transform = 'translateX(-50%) scale(' + (0.5 + bf * 0.5) + ')';
      }
    }

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  animate();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

// ======== License / Activation ========
async function checkLicense() {
  const result = await window.pctg.checkLicense();
  activeTier = result.tier;
  const overlay = document.getElementById("license-screen");
  const appContainer = document.getElementById("app");
  if (!result.valid) {
    if (overlay) overlay.style.display = "flex";
    if (appContainer) { appContainer.style.display = "none"; appContainer.style.opacity = "0"; }
    document.getElementById("license-error").innerText = "";
  } else {
    if (overlay) overlay.style.display = "none";
    if (appContainer) { appContainer.style.display = "block"; setTimeout(() => { appContainer.style.opacity = "1"; }, 10); }
    showTierBadge();
    resetInactivityTimer();
    document.getElementById("license-input").value = "";
    if (!localStorage.getItem('pctg_bench_before')) {
      setTimeout(() => runAllBenchmarks('Initial Baseline Benchmark (Before)'), 1000);
    }
    // Auto-analyze system for Full/Pro tiers in background
    if (activeTier === 'full' || activeTier === 'pro' || activeTier === 'admin') {
      window.pctg.analyzeSystem().then(analysis => {
        if (analysis && analysis.commandsCount > 0) {
          console.log('[PCTG AI] System analyzed: ' + analysis.specs.cpu.model + ' | ' + analysis.specs.gpu.model + ' | ' + analysis.specs.ram.totalGB + 'GB RAM | ' + analysis.commandsCount + ' custom optimizations ready');
        }
      }).catch(() => {});
    }
  }
}

document.getElementById("activate-btn").onclick = async () => {
  const key = document.getElementById("license-input").value.trim();
  if (!key) { document.getElementById("license-error").innerText = "Enter a license key."; return; }
  document.getElementById("license-error").innerText = "Activating...";
  document.getElementById("activate-btn").disabled = true;
  const result = await window.pctg.activateLicense(key);
  document.getElementById("activate-btn").disabled = false;
  if (!result.success) {
    document.getElementById("license-error").innerText = result.message || "Invalid or already-used key.";
  } else {
    const overlay = document.getElementById("license-screen");
    const appContainer = document.getElementById("app");
    if (overlay) overlay.style.display = "none";
    if (appContainer) { appContainer.style.display = "block"; setTimeout(() => { appContainer.style.opacity = "1"; }, 10); }
    checkLicense();
  }
};

document.getElementById("license-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("activate-btn").click();
});

document.getElementById("receipt-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("btn-generate-key").click();
});

// ======== PayPal Purchase Flow ========
let pendingPayPalOrder = null;

document.getElementById('btn-pay-paypal').onclick = async () => {
  const tier = document.getElementById('purchase-tier-select').value;
  const statusEl = document.getElementById('paypal-status');
  const actionsEl = document.getElementById('paypal-actions');
  const completeBtn = document.getElementById('btn-paypal-complete');
  statusEl.style.color = '#aaa';
  statusEl.textContent = 'Creating PayPal order...';
  document.getElementById('btn-pay-paypal').disabled = true;
  try {
    const result = await window.pctg.paypalCreateOrder({ tier });
    if (result.success && result.approveUrl) {
      pendingPayPalOrder = { orderId: result.orderId, tier };
      statusEl.innerHTML = 'Order created. Complete payment in your browser, then click "Verify &amp; Generate Key" below.';
      actionsEl.style.display = 'flex';
      completeBtn.textContent = 'I\'ve Paid - Verify & Generate Key';
      completeBtn.disabled = false;
      window.pctg.openUrl(result.approveUrl);
    } else {
      statusEl.style.color = '#ff4444';
      statusEl.textContent = result.message || 'Failed to create order.';
    }
  } catch (e) {
    statusEl.style.color = '#ff4444';
    statusEl.textContent = 'Error: ' + e.message;
  }
  document.getElementById('btn-pay-paypal').disabled = false;
};

document.getElementById('btn-paypal-complete').onclick = async () => {
  if (!pendingPayPalOrder) return;
  const statusEl = document.getElementById('paypal-status');
  const completeBtn = document.getElementById('btn-paypal-complete');
  statusEl.textContent = 'Verifying payment and generating key...';
  statusEl.style.color = '#aaa';
  completeBtn.disabled = true;
  try {
    const result = await window.pctg.paypalCaptureOrder({ orderId: pendingPayPalOrder.orderId, tier: pendingPayPalOrder.tier });
    if (result.success) {
      statusEl.innerHTML = '<span style="color:#FF3333">Payment confirmed! Key generated: <strong>' + result.key + '</strong></span>';
      document.getElementById('paypal-actions').style.display = 'none';
      document.getElementById('license-input').value = result.key;
      document.getElementById('activate-btn').click();
      pendingPayPalOrder = null;
    } else {
      statusEl.style.color = '#ff4444';
      statusEl.textContent = result.message || 'Verification failed. Try again or use your receipt ID below.';
      completeBtn.disabled = false;
    }
  } catch (e) {
    statusEl.style.color = '#ff4444';
    statusEl.textContent = 'Error: ' + e.message;
    completeBtn.disabled = false;
  }
};

document.getElementById('btn-paypal-cancel').onclick = () => {
  pendingPayPalOrder = null;
  document.getElementById('paypal-actions').style.display = 'none';
  document.getElementById('paypal-status').textContent = 'Cancelled.';
  document.getElementById('paypal-status').style.color = '#888';
};

// Manual key generation from PayPal receipt (fallback)
document.getElementById('btn-generate-key').onclick = async () => {
  const receipt = document.getElementById('receipt-input').value.trim();
  const tier = document.getElementById('purchase-tier-select').value;
  const resultEl = document.getElementById('purchase-result');
  if (!receipt) {
    resultEl.style.color = '#ff4444';
    resultEl.textContent = 'Enter your PayPal transaction ID.';
    return;
  }
  resultEl.textContent = 'Generating activation key...';
  resultEl.style.color = '#aaa';
  document.getElementById('btn-generate-key').disabled = true;
  try {
    const result = await window.pctg.generateKey({ receipt, tier });
    if (result.success) {
      resultEl.innerHTML = '<span style="color:#FF3333">Key generated: <strong>' + result.key + '</strong><br/>Copy this key and use it below to activate. Write it down &mdash; lost keys cannot be recovered.</span>';
      document.getElementById('license-input').value = result.key;
      document.getElementById('activate-btn').click();
    } else {
      resultEl.style.color = '#ff4444';
      resultEl.textContent = result.message || 'Generation failed.';
    }
  } catch (e) {
    resultEl.style.color = '#ff4444';
    resultEl.textContent = 'Error: ' + e.message;
  }
  document.getElementById('btn-generate-key').disabled = false;
};

// ======== Optimizer ========
function initOptimizer() {
  const logEl = document.getElementById('log');
  const progressContainer = document.getElementById('progress-container');
  const progressBar = document.getElementById('progress-bar');
  const progressLabel = document.getElementById('progress-label');
  const progressStatus = document.getElementById('progress-status');
  let stepCount = 0;
  const log = (msg) => {
    logEl.textContent += msg + '\n';
    logEl.scrollTop = logEl.scrollHeight;
  };
  function showProgress(label, percent, status) {
    progressContainer.style.display = 'block';
    progressLabel.textContent = label;
    progressBar.style.width = percent + '%';
    progressStatus.textContent = status || '';
  }
  function hideProgress() {
    progressContainer.style.display = 'none';
    progressBar.style.width = '0%';
  }
  window.pctg.onPhaseProgress((data) => {
    stepCount++;
    const pct = Math.min(Math.round((stepCount / 15) * 100), 95);
    showProgress(data.label, pct, data.line);
    log(data.line);
  });
  function trackPhase(label) {
    const phases = JSON.parse(localStorage.getItem('pctg_completed_phases') || '[]');
    if (!phases.includes(label)) {
      phases.push(label);
      localStorage.setItem('pctg_completed_phases', JSON.stringify(phases));
    }
    refreshReport();
  }
  async function runPhase(phase, label) {
    stepCount = 0;
    showProgress(label, 0, 'Starting...');
    log(`▶ ${label}`);
    try {
      const output = await window.pctg.runPhase(phase);
      trackPhase(label);
      showProgress(label, 100, 'Complete');
      log(`✔ ${label} done.`);
      setTimeout(hideProgress, 2500);
    } catch (e) {
      progressStatus.textContent = 'Failed';
      log(`✖ ${label}: ${e}`);
    }
  }
  // Wire feature grid cards
  const phaseMap = {
    registry: 'Registry Optimization',
    disk: 'Disk Optimization',
    fps: 'Windows Gaming Tweaks',
    winfix: 'Windows Debloat Tool',
    performance: 'Driver Maintenance',
    internet: 'DNS Optimization',
    cleanup: 'Browser Boost',
    security: 'WiFi Optimization',
    master: 'PCTG System Master',
    repair: 'System Test & Repair',
    'gpu-nvidia': 'NVIDIA GPU Tweaks',
    'gpu-amd': 'AMD GPU Tweaks',
    'gpu-intel': 'Intel GPU Tweaks'
  };
  document.querySelectorAll('.card[data-phase]').forEach(card => {
    const phase = card.dataset.phase;
    const label = phaseMap[phase] || phase;
    if (phase === 'gpu-select') return;
    card.addEventListener('click', async () => {
      card.classList.add('running');
      await runPhase(phase, label);
      card.classList.remove('running');
    });
  });
  document.querySelectorAll('.gpu-brand-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const brand = btn.dataset.gpuBrand;
      const phase = 'gpu-' + brand;
      const label = phaseMap[phase] || phase;
      btn.disabled = true;
      btn.style.opacity = '0.5';
      try {
        await runPhase(phase, label);
      } catch (err) {
        log('✖ ' + label + ': ' + (err.message || err));
      }
      btn.disabled = false;
      btn.style.opacity = '1';
    });
  });
  // Start Smart Optimize (runs the 3 core phases)
  const btnStart = document.getElementById('start-optimize');
  if (btnStart) {
    btnStart.onclick = async () => {
      btnStart.disabled = true;
      btnStart.textContent = 'Optimizing...';
      await runPhase('cleanup', 'Phase 1 \u2014 Clean & Clear');
      await runPhase('performance', 'Phase 2 \u2014 Performance Boost');
      await runPhase('final', 'Phase 3 \u2014 Final Sweep');
      btnStart.disabled = false;
      btnStart.textContent = 'Start Smart Optimize';
    };
  }
  // Export PDF
  const btnExportPdf = document.getElementById('btn-export-pdf');
  if (btnExportPdf) {
    btnExportPdf.onclick = async () => {
      try {
        log('Exporting PDF report...');
        const reportData = {
          os: navigator.platform || 'Unknown',
          cpu: document.getElementById('stat-cpu-info').textContent || '\u2014',
          ram: document.getElementById('stat-ram-info').textContent || '\u2014',
          gpu: document.getElementById('stat-gpu-info').textContent || '\u2014',
          phases: logEl.textContent.split('\n').filter(l => l),
          recommendations: ['Run Clean & Clear weekly', 'Enable Gaming Mode for FPS', 'Keep SmartScreen enabled']
        };
        await window.pctg.exportPdf(reportData);
        log('✔ PDF exported.');
      } catch (e) {
        log(`✖ Export error: ${e.message || e}`);
      }
    };
  }
  // View Report
  const btnReport = document.getElementById('btn-report');
  if (btnReport) {
    btnReport.onclick = async () => {
      refreshReport();
      log('In-app report updated.');
    };
  }
  // Logout
  document.getElementById('btn-logout').onclick = logout;
}

// ======== Toggle Cards ========
const ToggleScripts = {
  proMode: { toggle: 'startupApps', phase: 'pro' },
  internet: { toggle: 'telemetry', phase: 'internet' },
  gpuBoost: { toggle: 'gameBar', phase: 'fps' }
};

function setupToggleSwitches() {
  document.querySelectorAll('.toggle-card[data-toggle]').forEach(card => {
    const key = card.dataset.toggle;
    const checkbox = card.querySelector('input[type="checkbox"]');
    if (!checkbox || !ToggleScripts[key]) return;
    const config = ToggleScripts[key];
    // Restore saved state
    const saved = localStorage.getItem('pctg_toggle_' + key);
    if (saved === 'true') checkbox.checked = true;
    checkbox.addEventListener('change', () => {
      const enabled = checkbox.checked;
      localStorage.setItem('pctg_toggle_' + key, enabled);
      window.pctg.runToggle({ key: config.toggle, enabled: enabled ? 1 : 0 });
    });
  });
}

// ======== Auto-Logout ========
let inactivityTimer = null;
const INACTIVITY_TIMEOUT = 30 * 60 * 1000;

function resetInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(logout, INACTIVITY_TIMEOUT);
}

function logout() {
  const overlay = document.getElementById("license-screen");
  const appContainer = document.getElementById("app");
  if (overlay) overlay.style.display = "flex";
  if (appContainer) { appContainer.style.display = "none"; appContainer.style.opacity = "0"; }
  document.getElementById("license-error").innerText = "Logged out - reactivate to continue.";
  document.getElementById("license-input").value = "";
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = null;
  activeTier = null;
  const badge = document.getElementById("tier-badge");
  if (badge) badge.textContent = "";
}

document.addEventListener('mousemove', resetInactivityTimer);
document.addEventListener('keydown', resetInactivityTimer);
document.addEventListener('click', resetInactivityTimer);
document.addEventListener('scroll', resetInactivityTimer);

function showTierBadge() {
  const badge = document.getElementById('tier-badge');
  if (badge && activeTier) {
    const names = { admin: 'Admin', basic: 'Basic', full: 'Full', pro: 'Pro Gaming' };
    badge.textContent = names[activeTier] || activeTier;
    badge.style.display = 'inline';
  }
}

// ======== Dashboard Stats ========
async function refreshStats() {
  try {
    const stats = await window.pctg.getStats();
    document.getElementById("stat-cpu").textContent = stats.cpu.usage + "%";
    document.getElementById("bar-cpu").style.width = stats.cpu.usage + "%";
    document.getElementById("stat-cpu-info").textContent = stats.cpu.model + " (" + stats.cpu.cores + " cores)";
    document.getElementById("stat-ram").textContent = stats.memory.percent + "%";
    document.getElementById("bar-ram").style.width = stats.memory.percent + "%";
    const gb = (v) => (v / 1073741824).toFixed(1);
    document.getElementById("stat-ram-info").textContent = gb(stats.memory.used) + " GB / " + gb(stats.memory.total) + " GB";
    const days = Math.floor(stats.os.uptime / 86400);
    const hours = Math.floor((stats.os.uptime % 86400) / 3600);
    document.getElementById("stat-uptime").textContent = days + "d " + hours + "h";
    if (stats.gpu) {
      document.getElementById("stat-gpu-pct").textContent = stats.gpu.usage + "%";
      document.getElementById("bar-gpu").style.width = Math.min(stats.gpu.usage, 100) + "%";
      document.getElementById("stat-gpu-info").textContent = stats.gpu.model;
    }
    if (stats.disk) {
      document.getElementById("stat-disk").textContent = stats.disk.percent + "%";
      document.getElementById("bar-disk").style.width = stats.disk.percent + "%";
      document.getElementById("stat-disk-info").textContent = gb(stats.disk.used) + " GB / " + gb(stats.disk.total) + " GB";
    }
  } catch {}
}

// ======== Benchmark ========
const BENCH_DURATION = 6000;
let benchBefore = JSON.parse(localStorage.getItem('pctg_bench_before') || 'null');
let benchAfter = JSON.parse(localStorage.getItem('pctg_bench_after') || 'null');

function initBenchmarks() {
  document.getElementById('btn-bench-full').onclick = () => runAllBenchmarks('Full Benchmark (FPS + Network)');
  document.getElementById('btn-bench-fps').onclick = async () => {
    const logEl = document.getElementById('log');
    if (logEl) logEl.textContent += '\nRunning FPS Benchmark...\n';
    const fps = await runFpsBenchmark();
    if (logEl) logEl.textContent += '  FPS: ' + fps.avg + '\n';
    const box = document.getElementById('bench-results-box');
    if (box) { box.style.display = 'block'; box.innerHTML = '<h4 style="color:#FF3333;margin:0 0 8px">FPS Result</h4><div class="result-row"><span>Average FPS</span><span class="result-val">' + fps.avg + '</span></div>'; }
  };
  document.getElementById('btn-bench-net').onclick = async () => {
    const logEl = document.getElementById('log');
    if (logEl) logEl.textContent += '\nRunning Network Benchmark...\n';
    const net = await runNetworkBenchmark();
    if (logEl) logEl.textContent += '  Network: ' + net.avg + 'ms\n';
    const box = document.getElementById('bench-results-box');
    if (box) { box.style.display = 'block'; box.innerHTML = '<h4 style="color:#FF3333;margin:0 0 8px">Network Result</h4><div class="result-row"><span>Avg Response</span><span class="result-val">' + net.avg + 'ms</span></div>'; }
  };
}

function runFpsBenchmark() {
  return new Promise((resolve) => {
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
        ctx.fillStyle = 'hsl(' + (Math.random() * 360) + ', 80%, 50%)'; ctx.fill();
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
  return new Promise((resolve) => {
    const urls = ['https://www.google.com', 'https://www.cloudflare.com', 'https://www.github.com'];
    let completed = 0, totalTime = 0, errors = 0;
    urls.forEach(url => {
      const start = performance.now();
      fetch(url, { mode: 'no-cors', cache: 'no-store' }).then(() => {
        totalTime += performance.now() - start;
      }).catch(() => { errors++; }).finally(() => {
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
  box.innerHTML = '<h4 style="color:#FF3333;margin:0 0 8px">Benchmark Results</h4>'
    + '<div class="result-row"><span>Average FPS</span><span class="result-val">' + fps.avg + '</span></div>'
    + '<div class="result-row"><span>Min / Max FPS</span><span class="result-val">' + fps.min + ' / ' + fps.max + '</span></div>'
    + '<div class="result-row"><span>Network Response</span><span class="result-val">' + net.avg + 'ms</span></div>';
}

function calcImprovement(before, after) {
  if (!before || !after) return null;
  const fpsImp = before.fps && after.fps && before.fps.avg > 0 ? Math.round(((after.fps.avg - before.fps.avg) / before.fps.avg) * 100) : 0;
  const netImp = before.net && after.net && before.net.avg > 0 ? Math.round(((before.net.avg - after.net.avg) / before.net.avg) * 100) : 0;
  return { fps: fpsImp, net: netImp, overall: Math.round((fpsImp + Math.max(netImp, 0)) / 2) };
}

async function runAllBenchmarks(label) {
  const logEl = document.getElementById('log');
  if (!logEl) return;
  logEl.textContent += '\nRunning ' + label + '...\n';
  try {
    const fps = await runFpsBenchmark();
    logEl.textContent += '  FPS: ' + fps.avg + ' (min ' + fps.min + ', max ' + fps.max + ')\n';
    const net = await runNetworkBenchmark();
    logEl.textContent += '  Network: ' + net.avg + 'ms\n';
    const result = { fps, net, time: Date.now() };
    if (!benchBefore) {
      benchBefore = result;
      localStorage.setItem('pctg_bench_before', JSON.stringify(benchBefore));
      logEl.textContent += 'Baseline saved. Run optimizations, then benchmark again to see gains.\n';
    } else {
      benchAfter = result;
      localStorage.setItem('pctg_bench_after', JSON.stringify(benchAfter));
      logEl.textContent += 'After benchmark saved.\n';
      showBenchResults(fps, net);
      refreshReport();
    }
  } catch (e) {
    logEl.textContent += 'Benchmark error: ' + (e.message || e) + '\n';
  }
}

// ======== Report ========
function refreshReport() {
  const phases = JSON.parse(localStorage.getItem('pctg_completed_phases') || '[]');
  const list = document.getElementById('report-phases-list');
  if (list) {
    if (phases.length === 0) {
      list.innerHTML = '<div style="color:#888">None yet. Run optimizations from the dashboard.</div>';
    } else {
      list.innerHTML = phases.map(p => '<div>  ' + p + '</div>').join('');
    }
  }
  const bb = JSON.parse(localStorage.getItem('pctg_bench_before') || 'null');
  const ba = JSON.parse(localStorage.getItem('pctg_bench_after') || 'null');
  if (bb && ba && phases.length > 0) {
    const imp = calcImprovement(bb, ba);
    if (imp) {
      document.getElementById('report-fps').textContent = (imp.fps >= 0 ? '+' : '') + imp.fps + '%';
      document.getElementById('report-net').textContent = (imp.net >= 0 ? '+' : '') + imp.net + '%';
      document.getElementById('report-overall').textContent = (imp.overall >= 0 ? '+' : '') + imp.overall + '%';
    }
  } else {
    document.getElementById('report-fps').textContent = '-';
    document.getElementById('report-net').textContent = '-';
    document.getElementById('report-overall').textContent = '-';
  }
  window.pctg.getDiskSpace().then(d => {
    const cleaned = d ? Math.round((d.used / 1073741824) * 10) / 10 : 0;
    document.getElementById('report-disk').textContent = cleaned > 0 ? cleaned + ' GB' : '-';
  }).catch(() => {});
  const log = document.getElementById('log');
  const changes = log ? log.textContent.split('\n').filter(l => l.includes('\u2714') || l.includes('>') || l.includes('complete')).slice(-20) : [];
  document.getElementById('report-changelog').innerHTML = changes.map(c => '<div>  ' + c.trim() + '</div>').join('') || '<div>No changes recorded yet.</div>';
  const reportSection = document.getElementById('report-section');
  if (reportSection && phases.length > 0) reportSection.style.display = 'block';
}

// ======== Keyboard shortcuts ========
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'R') {
    localStorage.removeItem('pctg_bench_before');
    localStorage.removeItem('pctg_bench_after');
    benchBefore = null; benchAfter = null;
    refreshReport();
    const log = document.getElementById('log');
    if (log) log.textContent += '\nBenchmarks reset.\n';
  }
  if (e.ctrlKey && e.shiftKey && e.key === 'U') {
    window.location.reload();
  }
});

// ======== Init ========
setupToggleSwitches();

if (typeof THREE !== 'undefined') {
  initIntro();
} else {
  document.getElementById('intro-3d-webgl').style.display = 'none';
  window.addEventListener('DOMContentLoaded', () => {
    checkLicense();
    initOptimizer();
    initBenchmarks();
    refreshStats();
    refreshReport();
    setInterval(refreshStats, 2000);
  });
}

if (benchBefore && benchAfter) refreshReport();
