let activeTier = null;
let demoMode = false;

document.addEventListener('click', (event) => {
  if (!demoMode || !event.target.closest('#app')) return;
  if (event.target.closest('#demo-navigation, #btn-settings, #btn-demo-exit, #btn-demo-scan')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

document.addEventListener('change', (event) => {
  if (!demoMode || !event.target.closest('#app')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

function setDemoMode(enabled) {
  demoMode = enabled;
  const app = document.getElementById('app');
  const banner = document.getElementById('demo-mode-banner');
  const navigation = document.getElementById('demo-navigation');
  const scanSection = document.getElementById('demo-system-scan');
  app.classList.toggle('demo-mode', enabled);
  banner.hidden = !enabled;
  navigation.hidden = !enabled;
  scanSection.hidden = !enabled;
  renderUpdateStatus();

  app.querySelectorAll('button, input, select, textarea').forEach((control) => {
    if (control.id === 'btn-settings' || control.id === 'btn-demo-exit' || control.id === 'btn-demo-scan') return;
    if (enabled) {
      if (!Object.hasOwn(control.dataset, 'demoWasDisabled')) control.dataset.demoWasDisabled = String(control.disabled);
      control.disabled = true;
    } else if (Object.hasOwn(control.dataset, 'demoWasDisabled')) {
      control.disabled = control.dataset.demoWasDisabled === 'true';
      delete control.dataset.demoWasDisabled;
    }
  });
}
let proLaunchFlowStarted = false;
let latestUpdate = null;
let updateCheckRunning = false;

function renderUpdateStatus() {
  const installButton = document.getElementById('btn-install-update');
  if (!installButton) return;
  installButton.hidden = !latestUpdate?.updateAvailable || demoMode || !activeTier;
  if (latestUpdate?.updateAvailable && (demoMode || !activeTier)) {
    document.getElementById('update-message').textContent = `Version ${latestUpdate.latest.version} is available. A paid licence is required to install it; your current key remains saved and will be revalidated after updating.`;
  } else if (latestUpdate?.updateAvailable && activeTier) {
    document.getElementById('update-message').textContent = `Version ${latestUpdate.latest.version} is available. Your saved licence will be revalidated after the update.`;
  }
}

async function checkForAppUpdates() {
  if (updateCheckRunning) return;
  updateCheckRunning = true;
  document.getElementById('update-status').hidden = false;
  const message = document.getElementById('update-message');
  const checkButton = document.getElementById('btn-check-updates');
  checkButton.disabled = true;
  message.textContent = 'Checking for updates…';
  try {
    const result = await window.pctg.checkUpdate();
    latestUpdate = result;
    if (result?.error) {
      message.textContent = `Could not check for updates: ${result.error}`;
    } else if (result?.updateAvailable && result.latest?.version) {
      message.textContent = `Version ${result.latest.version} is available.`;
    } else {
      message.textContent = `PCTG Optimizer Pro is up to date (v${result?.latest?.version || 'current'}).`;
    }
    renderUpdateStatus();
  } catch (error) {
    message.textContent = `Could not check for updates: ${error.message || error}`;
  } finally {
    checkButton.disabled = false;
    updateCheckRunning = false;
  }
}

document.getElementById('btn-check-updates').addEventListener('click', checkForAppUpdates);
document.getElementById('btn-install-update').addEventListener('click', async () => {
  if (!activeTier || demoMode || !latestUpdate?.updateAvailable) return;
  const message = document.getElementById('update-message');
  const button = document.getElementById('btn-install-update');
  button.disabled = true;
  message.textContent = 'Downloading the verified installer… The app will close to install; your saved licence will be checked again when you reopen it.';
  try {
    const result = await window.pctg.downloadUpdate();
    if (!result?.success) message.textContent = result?.message || 'The update could not be started.';
  } catch (error) {
    message.textContent = `Update failed: ${error.message || error}`;
    button.disabled = false;
  }
});

document.getElementById('btn-demo-scan').addEventListener('click', async () => {
  const section = document.getElementById('demo-system-scan');
  const status = document.getElementById('demo-scan-status');
  const scanButton = document.getElementById('btn-demo-scan');
  const specsContainer = document.getElementById('demo-scan-specs');
  const recommendationsContainer = document.getElementById('demo-scan-recommendations');
  section.hidden = false;
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  scanButton.disabled = true;
  status.textContent = 'Reading local hardware details… No changes will be made.';
  specsContainer.replaceChildren();
  recommendationsContainer.replaceChildren();

  try {
    const result = await window.pctg.demoSystemScan();
    const { specs } = result;
    const fields = [
      ['Processor', `${specs.cpu.model} (${specs.cpu.cores} logical cores)`],
      ['Memory', `${specs.ram.totalGB} GB total · ${specs.ram.freeGB} GB currently free`],
      ['Graphics', `${specs.gpu.model} · ${specs.gpu.vram} VRAM`],
      ['Windows', `${specs.os.platform} ${specs.os.release}`],
      ['Motherboard', specs.motherboard],
      ['Storage', specs.storage.length ? specs.storage.map(drive => `${drive.model} (${drive.sizeGB} GB)`).join('; ') : 'Not detected']
    ];
    for (const [label, value] of fields) {
      const card = document.createElement('div');
      card.className = 'demo-scan-spec';
      const heading = document.createElement('strong');
      heading.textContent = label;
      const detail = document.createElement('span');
      detail.textContent = value;
      card.append(heading, detail);
      specsContainer.appendChild(card);
    }
    for (const recommendation of result.recommendations) {
      const item = document.createElement('li');
      item.textContent = recommendation;
      recommendationsContainer.appendChild(item);
    }
    status.textContent = `Scan completed ${new Date(result.scannedAt).toLocaleString()}. This scan was read-only.`;
  } catch (error) {
    status.textContent = `System scan failed: ${error.message || error}`;
  } finally {
    scanButton.disabled = false;
  }
});

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

    // THE INTRO MUST ALWAYS GET OUT OF THE WAY.
    //
    // Everything below here is driven by the Three.js animate loop. If WebGL or the
    // renderer fails to initialise, animate() throws or is never scheduled, the
    // `ms > 8700` branch never runs, and the app sits on an empty intro screen
    // forever - which is exactly what it did, and it looked like "the app is blank".
    //
    // This independent timer does the reveal regardless. It is idempotent, so it is
    // harmless if the animation reached 8700ms first and it is the ONLY thing that
    // reveals the app when the animation died.
    let revealed = false;
    function revealApp() {
      if (revealed) return;
      revealed = true;
      try {
        container.classList.add('hidden');
        container.style.display = 'none';
      } catch {}
      try {
        checkLicense();
        initOptimizer();
        initBenchmarks();
        refreshStats();
        refreshReport();
        setInterval(refreshStats, 2000);
      } catch (e) {
        console.error('[intro] reveal failed', e);
      }
    }
    setTimeout(revealApp, 9600);
    // Safety net: if even the timer context is wedged, force it much later.
    setTimeout(() => revealApp(), 20000);

    function animate() {
      const ms = performance.now() - t0;
      const s = ms / 1000;

      if (ms > 8700) {
        setTimeout(revealApp, 600);
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
  if (result.valid) setDemoMode(false);
  renderUpdateStatus();
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
    const proFirstRun = document.getElementById('pro-first-run');
    const startupManager = document.getElementById('startup-manager');
    if (activeTier === 'pro') {
      if (proFirstRun) proFirstRun.style.display = 'block';
      if (startupManager) startupManager.style.display = 'block';
      if (!proLaunchFlowStarted) {
        proLaunchFlowStarted = true;
        startProLaunchFlow();
      }
    } else {
      if (proFirstRun) proFirstRun.style.display = 'none';
      if (startupManager) startupManager.style.display = 'none';
    }
    if (activeTier !== 'pro' && !localStorage.getItem('pctg_bench_before')) {
      setTimeout(() => runAllBenchmarks('Initial Baseline Benchmark (Before)'), 1000);
    }
    if (activeTier === 'standard') {
      window.pctg.analyzeSystem().then(analysis => {
        if (analysis && analysis.commandsCount > 0) {
          console.log('[PCTG AI] System analyzed: ' + analysis.specs.cpu.model + ' | ' + analysis.specs.gpu.model + ' | ' + analysis.specs.ram.totalGB + 'GB RAM | ' + analysis.commandsCount + ' custom optimizations ready');
        }
      }).catch(error => console.error('[PCTG AI] System analysis failed:', error));
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
        checkLicense().catch(error => console.error('[license] startup validation failed', error));
        checkForAppUpdates();
        setInterval(checkForAppUpdates, 6 * 60 * 60 * 1000);
  }
};

document.getElementById("license-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("activate-btn").click();
});

document.getElementById('btn-demo').addEventListener('click', async () => {
  const result = await window.pctg.startDemo();
  if (!result?.success) {
    document.getElementById('license-error').innerText = result?.message || 'Demo mode could not be opened.';
    return;
  }
  activeTier = null;
  setDemoMode(true);
  document.getElementById('license-screen').style.display = 'none';
  const app = document.getElementById('app');
  app.style.display = 'block';
  setTimeout(() => { app.style.opacity = '1'; }, 10);
});

document.getElementById('btn-demo-exit').addEventListener('click', () => {
  setDemoMode(false);
  document.getElementById('app').style.display = 'none';
  document.getElementById('app').style.opacity = '0';
  document.getElementById('license-screen').style.display = 'flex';
});

document.getElementById('demo-navigation').addEventListener('click', (event) => {
  const link = event.target.closest('a[data-demo-settings]');
  if (!link) return;
  event.preventDefault();
  const settingsButton = document.getElementById('btn-settings');
  const settingsPanel = document.getElementById('settings-panel');
  if (settingsPanel && settingsPanel.style.display !== 'block') settingsButton.click();
  settingsPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/*
 * PURCHASE = HAND OFF TO THE WEBSITE CHECKOUT.
 *
 * The in-app PayPal flow and the "generate key from a receipt" box are gone.
 * The receipt box accepted any 8+ characters and issued a working licence without
 * verifying a payment - a self-service Pro licence. The in-app PayPal path could not
 * work in a release anyway (placeholder credentials), would have required shipping a
 * live PayPal secret inside the app, and minted keys the server had never issued.
 *
 * Payment now happens at pctgopt.pctechguyonline.com, where PayPal verifies the money
 * and the key is written to Postgres. The customer pastes that key in the box above.
 */
document.getElementById('btn-pay-paypal').onclick = async () => {
  const tier = document.getElementById('purchase-tier-select').value;
  const statusEl = document.getElementById('paypal-status');
  statusEl.style.color = '#aaa';
  statusEl.textContent = 'Opening secure checkout...';
  try {
    const result = await window.pctg.beginPurchase({ tier });
    if (result.success && result.url) {
      window.pctg.openUrl(result.url);
      statusEl.innerHTML = 'Checkout opened in your browser. Pay there, then paste the licence key you are given into the box above.';
    } else {
      statusEl.style.color = '#ff4444';
      statusEl.textContent = 'Could not open checkout. Visit pctgopt.pctechguyonline.com';
    }
  } catch (e) {
    statusEl.style.color = '#ff4444';
    statusEl.textContent = 'Error: ' + e.message;
  }
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
    uninstaller: 'Software Uninstaller',
    duplicates: 'Duplicate File Finder',
    contextmenu: 'Context Menu Manager',
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
  // Start One-Click Optimisation / Tune Up Windows (runs the configurable core phases)
  const TUNEUP_STEPS = [
    { key: 'cleanup', label: 'Phase 1 \u2014 Clean & Clear' },
    { key: 'performance', label: 'Phase 2 \u2014 Performance Boost' },
    { key: 'final', label: 'Phase 3 \u2014 Final Sweep' }
  ];
  async function runTuneUp() {
    const settings = getTuneUpSettings();
    for (const step of TUNEUP_STEPS) {
      if (settings[step.key] === false) {
        log('○ ' + step.label + ' skipped (disabled in Settings).');
        continue;
      }
      await runPhase(step.key, step.label);
    }
  }
  const btnStart = document.getElementById('start-optimize');
  if (btnStart) {
    btnStart.onclick = async () => {
      btnStart.disabled = true;
      btnStart.textContent = 'Optimizing...';
      try {
        await runTuneUp();
      } finally {
        btnStart.disabled = false;
        btnStart.textContent = 'Start One-Click Optimisation';
      }
    };
  }
  const btnTuneUp = document.getElementById('btn-tuneup');
  if (btnTuneUp) {
    btnTuneUp.onclick = async () => {
      btnTuneUp.disabled = true;
      const original = btnTuneUp.textContent;
      btnTuneUp.textContent = 'Tuning Up...';
      try {
        await runTuneUp();
      } finally {
        btnTuneUp.disabled = false;
        btnTuneUp.textContent = original;
      }
    };
  }
  // Gaming Mode - safe, reversible tweaks only (R&D finding 1d9e37ba97).
  // The result panel shows what was done, what was deliberately NOT done, and what
  // could not be checked, because "it reported success" and "it did the safe thing"
  // are different claims and only one of them is worth anything.
  const btnGamingMode = document.getElementById('btn-gaming-mode');
  const gamingResult = document.getElementById('gaming-mode-result');
  if (btnGamingMode) {
    btnGamingMode.onclick = async () => {
      btnGamingMode.disabled = true;
      const original = btnGamingMode.textContent;
      btnGamingMode.textContent = 'Running Gaming Mode...';
      log('Gaming Mode (safe tweaks only)');
      try {
        const disableStartup = !!document.getElementById('gaming-disable-startup')?.checked;
        const result = await window.pctg.runGamingMode({ disableStartup });
        const lines = [];
        (result.performed || []).forEach(l => lines.push('✓ ' + l));
        (result.skipped || []).forEach(l => lines.push('– ' + l));
        (result.notChecked || []).forEach(l => lines.push('? Could not check: ' + l));
        if (result.startup && result.startup.available) {
          lines.push(`Startup entries read: ${result.startup.considered} found, ${result.startup.alreadyDisabled} already off.`);
        }
        lines.push('');
        lines.push(result.disclaimer || '');
        if (result.restorePointSuggested) {
          lines.push('Recommended: create a restore point from the feature grid before playing.');
        }
        if (gamingResult) {
          gamingResult.textContent = lines.join('\n');
          gamingResult.style.display = 'block';
        }
        lines.filter(Boolean).forEach(l => log('  ' + l));
        trackPhase('Gaming Mode');
      } catch (e) {
        if (gamingResult) {
          gamingResult.textContent = 'Gaming Mode could not run: ' + (e?.message || e);
          gamingResult.style.display = 'block';
        }
        log('Gaming Mode failed: ' + (e?.message || e));
      } finally {
        btnGamingMode.disabled = false;
        btnGamingMode.textContent = original;
      }
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

// ======== One-Click Optimisation Settings ========
const TUNEUP_SETTINGS_KEY = 'pctg_tuneup_settings';
const TUNEUP_DEFAULTS = { cleanup: true, performance: true, final: true };

function getTuneUpSettings() {
  try {
    return Object.assign({}, TUNEUP_DEFAULTS, JSON.parse(localStorage.getItem(TUNEUP_SETTINGS_KEY) || '{}'));
  } catch {
    return Object.assign({}, TUNEUP_DEFAULTS);
  }
}

function setupTuneUpSettings() {
  const panel = document.getElementById('settings-panel');
  const btn = document.getElementById('btn-settings');
  if (btn && panel) {
    const isOpen = () => panel.style.display === 'block';
    btn.onclick = () => { panel.style.display = isOpen() ? 'none' : 'block'; };
    document.addEventListener('click', (e) => {
      if (isOpen() && !panel.contains(e.target) && e.target.id !== 'btn-settings') {
        panel.style.display = 'none';
      }
    });
  }
  const checkboxes = document.querySelectorAll('[data-tuneup-step]');
  if (!checkboxes.length) return;
  const apply = (settings) => {
    checkboxes.forEach(cb => { cb.checked = settings[cb.dataset.tuneupStep] !== false; });
  };
  apply(getTuneUpSettings());
  checkboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      const settings = getTuneUpSettings();
      settings[cb.dataset.tuneupStep] = cb.checked;
      localStorage.setItem(TUNEUP_SETTINGS_KEY, JSON.stringify(settings));
    });
  });
  const reset = document.getElementById('settings-reset');
  if (reset) {
    reset.onclick = () => {
      localStorage.removeItem(TUNEUP_SETTINGS_KEY);
      apply(getTuneUpSettings());
      const logEl = document.getElementById('log');
      if (logEl) logEl.textContent += 'Settings reset - all phases enabled.\n';
    };
  }
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
    const names = { pro: 'Pro Gaming', standard: 'Standard', repair: 'Test & Repair', fps: 'FPS Booster', security: 'Security', internet: 'Internet / WiFi', winfix: 'WinFix', deep: 'Deep Optimize' };
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

function renderStartupApps(items) {
  const list = document.getElementById('startup-app-list');
  if (!list) return;
  list.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No supported startup items were found.';
    list.appendChild(empty);
    return;
  }
  for (const item of items) {
    const row = document.createElement('label');
    row.className = 'startup-app-row';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.startupId = item.id;
    checkbox.dataset.enabled = String(item.enabled);
    checkbox.disabled = !item.manageable || (item.enabled === false && item.available === false);
    const name = document.createElement('span');
    name.className = 'startup-app-name';
    name.textContent = item.name;
    const command = document.createElement('span');
    command.className = 'startup-app-command';
    command.textContent = (item.command || item.location || '').slice(0, 240);
    command.title = item.command || item.location || '';
    const state = document.createElement('span');
    state.className = 'startup-app-state';
    state.textContent = item.enabled ? 'Enabled' : item.available === false ? 'Backup missing' : 'Disabled by PCTG';
    row.append(checkbox, name, command, state);
    list.appendChild(row);
  }
}

function renderHardwareTuningTools(result) {
  const container = document.getElementById('hardware-tuning-tools');
  if (!container) return;
  container.replaceChildren();
  const heading = document.createElement('h4');
  heading.textContent = 'Hardware-matched tuning and performance tools';
  container.appendChild(heading);
  const safetyNote = document.createElement('p');
  safetyNote.className = 'pro-recommendation-note';
  safetyNote.textContent = 'Tools are matched to the detected CPU/GPU. Opening a tool or support page never applies settings automatically. Confirm exact model support and understand stability, temperature, warranty and data-loss risks before making manual clock, voltage, power or fan changes.';
  container.appendChild(safetyNote);
  if (result.availabilityError) {
    const warning = document.createElement('p');
    warning.className = 'pro-recommendation-note';
    warning.textContent = `Could not confirm which utilities are installed: ${result.availabilityError}. The buttons open the vendor support pages instead.`;
    container.appendChild(warning);
  }

  if (!result.tools.length) {
    const unavailable = document.createElement('p');
    unavailable.className = 'pro-recommendation-note';
    unavailable.textContent = 'The CPU or graphics model could not be identified confidently, so no vendor tuning utility is recommended.';
    container.appendChild(unavailable);
    return;
  }

  for (const tool of result.tools) {
    const card = document.createElement('div');
    card.className = 'hardware-tool-card';
    const details = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = tool.label;
    const match = document.createElement('span');
    match.className = 'hardware-tool-match';
    match.textContent = tool.kind === 'cpu' ? `Matched to ${result.cpuVendor.toUpperCase()} CPU` :
      tool.kind === 'gpu' ? `Matched to ${result.gpuVendor.toUpperCase()} graphics` : 'Performance measurement only';
    const note = document.createElement('p');
    note.textContent = `${tool.compatibility} ${tool.guidance}`;
    details.append(name, match, note);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.textContent = tool.installed === true ? 'Open utility' : 'Open official support page';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const opened = await window.pctg.openHardwareTuningTool(tool.id);
        button.textContent = opened.launched ? 'Utility opened' : 'Official support page opened';
        if (opened.warning) note.textContent = `${tool.compatibility} ${tool.guidance} ${opened.warning}`;
      } catch (error) {
        note.textContent = `${tool.compatibility} ${tool.guidance} Could not open it: ${error.message || error}`;
      } finally {
        button.disabled = false;
      }
    });
    const supportButton = document.createElement('button');
    supportButton.type = 'button';
    supportButton.className = 'btn';
    supportButton.textContent = 'Official compatibility info';
    supportButton.addEventListener('click', async () => {
      supportButton.disabled = true;
      try {
        await window.pctg.openUrl(tool.url);
      } catch (error) {
        note.textContent = `${tool.compatibility} ${tool.guidance} Could not open the vendor page: ${error.message || error}`;
      } finally {
        supportButton.disabled = false;
      }
    });
    const actions = document.createElement('div');
    actions.className = 'hardware-tool-actions';
    actions.append(button, supportButton);
    card.append(details, actions);
    container.appendChild(card);
  }
}

async function refreshStartupApps() {
  const status = document.getElementById('startup-manager-status');
  if (status) status.textContent = 'Reading Windows startup entries...';
  try {
    const items = await window.pctg.getStartupApps();
    renderStartupApps(items);
    if (status) status.textContent = `${items.length} startup item${items.length === 1 ? '' : 's'} found. Nothing was changed.`;
    return items;
  } catch (error) {
    if (status) status.textContent = `Could not read startup items: ${error.message || error}`;
    throw error;
  }
}

function selectedStartupItems(expectedEnabled) {
  return [...document.querySelectorAll('#startup-app-list input[data-startup-id]:checked')]
    .filter(input => input.dataset.enabled === String(expectedEnabled))
    .map(input => input.dataset.startupId);
}

async function changeStartupItems(ids, enabled) {
  const failures = [];
  let changed = 0;
  for (const id of ids) {
    try {
      await window.pctg.setStartupAppEnabled({ id, enabled });
      changed++;
    } catch (error) {
      failures.push(error.message || String(error));
    }
  }
  try {
    await refreshStartupApps();
  } catch (error) {
    failures.push(error.message || String(error));
  }
  return { changed, failures };
}

function hardwareFingerprint(specs) {
  return JSON.stringify({
    cpu: specs.cpu.model,
    cores: specs.cpu.cores,
    ramGB: specs.ram.totalGB,
    gpu: specs.gpu.model,
    os: specs.os.release
  });
}

function renderProBenchmarkComparison() {
  const box = document.getElementById('pro-benchmark-comparison');
  if (!box || !benchBefore || !benchAfter) return;
  const improvement = calcImprovement(benchBefore, benchAfter);
  if (!improvement) return;
  box.replaceChildren();
  const title = document.createElement('strong');
  title.textContent = 'Before and after comparison';
  box.appendChild(title);
  const rows = [
    ['Average FPS', `${benchBefore.fps.avg} → ${benchAfter.fps.avg} (${improvement.fps >= 0 ? '+' : ''}${improvement.fps}%)`],
    ['Network response', `${benchBefore.net.avg} ms → ${benchAfter.net.avg} ms (${improvement.net >= 0 ? '+' : ''}${improvement.net}%)`]
  ];
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    row.className = 'result-row';
    const name = document.createElement('span');
    name.textContent = label;
    const result = document.createElement('span');
    result.className = 'result-val';
    result.textContent = value;
    row.append(name, result);
    box.appendChild(row);
  }
  const note = document.createElement('p');
  note.textContent = 'These are the app’s repeatable canvas-rendering and network-response tests, not an in-game FPS guarantee.';
  box.appendChild(note);
}

async function startProLaunchFlow() {
  const status = document.getElementById('pro-first-run-status');
  const summary = document.getElementById('pro-system-summary');
  const applyButton = document.getElementById('pro-apply-recommendations');
  const skipButton = document.getElementById('pro-skip-recommendations');
  const retryButton = document.getElementById('pro-retry-scan');
  if (!status || !applyButton || !skipButton) return;
  applyButton.disabled = true;
  skipButton.disabled = true;
  if (retryButton) retryButton.style.display = 'none';
  status.textContent = 'Scanning this computer before the baseline benchmark...';

  try {
    const analysis = await window.pctg.analyzeSystem({ refresh: true });
    if (!analysis || !analysis.specs || !analysis.specs.cpu || !analysis.specs.ram || !analysis.specs.gpu) {
      throw new Error('The system scan returned incomplete hardware information.');
    }
    const specs = analysis.specs;
    const stats = await window.pctg.getStats();
    const [apps, tuningTools] = await Promise.all([
      refreshStartupApps(),
      window.pctg.getHardwareTuningTools()
    ]);
    renderHardwareTuningTools(tuningTools);
    const fingerprint = hardwareFingerprint(specs);
    if (localStorage.getItem('pctg_bench_hardware') !== fingerprint) {
      if (benchBefore || benchAfter) {
        localStorage.removeItem('pctg_bench_before');
        localStorage.removeItem('pctg_bench_after');
        benchBefore = null;
        benchAfter = null;
        const log = document.getElementById('log');
        if (log) log.textContent += '\nHardware changed or the prior benchmark hardware was unknown; starting a new comparison pair.\n';
      }
      localStorage.setItem('pctg_bench_hardware', fingerprint);
    }

    if (summary) {
      summary.textContent = `${specs.cpu.model} (${specs.cpu.cores} logical cores) · ${specs.ram.totalGB} GB RAM · ${specs.gpu.model} · Windows ${specs.os.release}. Current memory use: ${stats.memory.percent}%.`;
    }
    const recommendation = document.getElementById('pro-startup-recommendations');
    if (recommendation) {
      recommendation.textContent = specs.ram.totalGB <= 16 || stats.memory.percent >= 80
        ? 'Recommendation: review startup apps because this system has limited memory headroom. Select only apps you recognise and do not need at sign-in; nothing is preselected or changed automatically.'
        : 'Review startup apps below if you want to reduce sign-in/background activity. Hardware and current memory use are shown above; nothing is preselected or changed automatically.';
      recommendation.className = 'pro-recommendation-note';
    }

    if (!benchBefore) {
      status.textContent = 'System scan complete. Running the initial baseline benchmark...';
      const saved = await runAllBenchmarks('Initial Baseline Benchmark (Before)', 'before');
      if (!saved) throw new Error('The initial benchmark did not complete. Retry the system scan to try again.');
    }

    if (benchAfter) {
      status.textContent = 'This computer already has a completed before-and-after run. Run a new comparison only after resetting the benchmark pair.';
      renderProBenchmarkComparison();
      return;
    }
    if (!apps.some(item => item.enabled && item.manageable)) {
      status.textContent = 'System scan and baseline are complete. No supported, enabled startup items are available to change; run the final benchmark to compare without changes.';
    } else {
      status.textContent = 'System scan and baseline are complete. Select any startup apps you want to disable, or skip changes. Your selection is applied only after you press the button.';
    }
    applyButton.disabled = false;
    skipButton.disabled = false;
  } catch (error) {
    status.textContent = `Pro setup could not complete: ${error.message || error}`;
    if (retryButton) retryButton.style.display = 'inline-block';
  }
}

async function finishProBenchmark(label) {
  const status = document.getElementById('pro-first-run-status');
  const applyButton = document.getElementById('pro-apply-recommendations');
  const skipButton = document.getElementById('pro-skip-recommendations');
  applyButton.disabled = true;
  skipButton.disabled = true;
  status.textContent = 'Running the final benchmark...';
  const saved = await runAllBenchmarks(label, 'after');
  if (saved) {
    status.textContent = 'Final benchmark complete. The before-and-after results are shown below.';
    renderProBenchmarkComparison();
  } else {
    status.textContent = 'The final benchmark failed. Your baseline is preserved; check the log and retry the benchmark.';
    applyButton.disabled = false;
    skipButton.disabled = false;
  }
}

// ======== Benchmark ========
const BENCH_DURATION = 6000;
let benchBefore = JSON.parse(localStorage.getItem('pctg_bench_before') || 'null');
let benchAfter = JSON.parse(localStorage.getItem('pctg_bench_after') || 'null');

function initBenchmarks() {
  document.getElementById('btn-bench-full').onclick = () => runAllBenchmarks('Full Benchmark (FPS + Network)');
  document.getElementById('startup-refresh').onclick = () => refreshStartupApps().catch(() => {});
  document.getElementById('startup-disable-selected').onclick = async () => {
    const status = document.getElementById('startup-manager-status');
    const ids = selectedStartupItems(true);
    if (!ids.length) { status.textContent = 'Select one or more enabled startup items first.'; return; }
    status.textContent = 'Disabling selected startup items...';
    try {
      const result = await changeStartupItems(ids, false);
      status.textContent = `${result.changed} item${result.changed === 1 ? '' : 's'} disabled.${result.failures.length ? ` Issues: ${result.failures.join('; ')}` : ''}`;
    } catch (error) {
      status.textContent = `Could not apply startup changes: ${error.message || error}`;
    }
  };
  document.getElementById('startup-restore-selected').onclick = async () => {
    const status = document.getElementById('startup-manager-status');
    const ids = selectedStartupItems(false);
    if (!ids.length) { status.textContent = 'Select one or more disabled items first.'; return; }
    status.textContent = 'Restoring selected startup items...';
    try {
      const result = await changeStartupItems(ids, true);
      status.textContent = `${result.changed} item${result.changed === 1 ? '' : 's'} restored.${result.failures.length ? ` Issues: ${result.failures.join('; ')}` : ''}`;
    } catch (error) {
      status.textContent = `Could not restore startup items: ${error.message || error}`;
    }
  };
  document.getElementById('pro-apply-recommendations').onclick = async () => {
    const ids = selectedStartupItems(true);
    if (!ids.length) {
      document.getElementById('pro-first-run-status').textContent = 'Select at least one enabled startup item, or choose “Skip changes & run final benchmark”.';
      return;
    }
    const status = document.getElementById('pro-first-run-status');
    status.textContent = 'Applying only the startup items you selected...';
    const result = await changeStartupItems(ids, false);
    if (result.failures.length) {
      status.textContent = `${result.changed} item${result.changed === 1 ? '' : 's'} disabled. Some selected changes failed: ${result.failures.join('; ')}. Running the final benchmark for the changes that succeeded.`;
    }
    await finishProBenchmark('Final Benchmark (After Selected Startup Changes)');
  };
  document.getElementById('pro-skip-recommendations').onclick = () => finishProBenchmark('Final Benchmark (After Skipping Changes)');
  document.getElementById('pro-retry-scan').onclick = () => startProLaunchFlow();
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

async function runAllBenchmarks(label, mode) {
  const logEl = document.getElementById('log');
  if (!logEl) return false;
  logEl.textContent += '\nRunning ' + label + '...\n';
  try {
    const fps = await runFpsBenchmark();
    logEl.textContent += '  FPS: ' + fps.avg + ' (min ' + fps.min + ', max ' + fps.max + ')\n';
    const net = await runNetworkBenchmark();
    logEl.textContent += '  Network: ' + net.avg + 'ms\n';
    const result = { fps, net, time: Date.now() };
    if (mode === 'after' && !benchBefore) throw new Error('Cannot save an after benchmark without a baseline.');
    if (mode === 'before' || (!benchBefore && mode !== 'after')) {
      benchBefore = result;
      localStorage.setItem('pctg_bench_before', JSON.stringify(benchBefore));
      if (mode === 'before') {
        benchAfter = null;
        localStorage.removeItem('pctg_bench_after');
      }
      logEl.textContent += 'Baseline saved.\n';
    } else {
      benchAfter = result;
      localStorage.setItem('pctg_bench_after', JSON.stringify(benchAfter));
      logEl.textContent += 'After benchmark saved.\n';
      showBenchResults(fps, net);
      refreshReport();
      renderProBenchmarkComparison();
    }
    return true;
  } catch (e) {
    logEl.textContent += 'Benchmark error: ' + (e.message || e) + '\n';
    return false;
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
  if (demoMode) return;
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
setupTuneUpSettings();

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
