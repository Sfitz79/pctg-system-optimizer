const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const os = require('os');
const { spawn, exec } = require('child_process');

const { checkInternalUnlock, internalUnlockEnabled } = require('./lib/internalUnlock.js');
const { IS_ADMIN, PRODUCT_NAME, VARIANT, variantPath } = require('./lib/buildVariant.js');
const { createStartupManager } = require('./lib/startup-manager.js');
const { getHardwareTuningTools, findInstalledToolApp } = require('./lib/hardware-tuning.js');
const { getDemoRecommendations } = require('./lib/demoRecommendations.js');
const { isVersionNewer, isTrustedInstallerUrl, parseGitHubRelease } = require('./lib/updateManifest.js');

const VALIDATION_API = 'https://pctgopt.pctechguyonline.com/api/validate';
const UPDATE_RELEASE_API = 'https://api.github.com/repos/Sfitz79/pctg-system-optimizer/releases/latest';

if (process.platform === 'win32' && !process.argv.includes('--elevated')) {
  const result = require('child_process').spawnSync('powershell.exe', [
    '-Command', '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'
  ]);
  const isAdmin = result.stdout ? result.stdout.toString().trim() === 'True' : false;
  if (!isAdmin) {
    const scriptPath = process.argv[1] || path.join(__dirname, 'main.js');
    const child = spawn('powershell.exe', [
      '-Command', `Start-Process -FilePath "${process.execPath}" -ArgumentList '"${scriptPath}","--elevated"' -Verb RunAs`
    ], { detached: true, stdio: 'ignore' });
    child.unref();
    process.exit(0);
  }
}

const currentVersion = app.getVersion();
const userDataPath = app.getPath('userData');
const licensePath = path.join(userDataPath, 'license.json');
const keysDbPath = path.join(userDataPath, 'keys.json');
const analyticsPath = path.join(userDataPath, 'analytics.json');
const startupManager = createStartupManager({
  userDataPath,
  startupFolders: [
    path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'),
    path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
  ]
});

const PAYPAL_URL = "https://www.paypal.me/pctechguyonline305";

// ======== PayPal REST API Integration ========
let paypalConfig = {};
try {
  paypalConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'paypal-config.json'), 'utf-8'));
} catch { paypalConfig = { clientId: '', secret: '', mode: 'sandbox', currency: 'GBP' }; }
const PAYPAL_API = paypalConfig.mode === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

let paypalAccessToken = null;
let paypalTokenExpires = 0;

function getPayPalAccessToken() {
  return new Promise((resolve, reject) => {
    if (paypalAccessToken && Date.now() < paypalTokenExpires) return resolve(paypalAccessToken);
    const auth = Buffer.from(paypalConfig.clientId + ':' + paypalConfig.secret).toString('base64');
    const postData = 'grant_type=client_credentials';
    const req = https.request({
      hostname: new URL(PAYPAL_API).hostname,
      path: '/v1/oauth2/token',
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + auth,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 15000
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          paypalAccessToken = data.access_token;
          paypalTokenExpires = Date.now() + (data.expires_in - 60) * 1000;
          resolve(paypalAccessToken);
        } catch (e) { reject(new Error('Failed to get PayPal token')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('PayPal token timeout')); });
    req.write(postData);
    req.end();
  });
}

function paypalRequest(method, path, body) {
  return new Promise(async (resolve, reject) => {
    try {
      const token = await getPayPalAccessToken();
      const hostname = new URL(PAYPAL_API).hostname;
      const postData = body ? JSON.stringify(body) : null;
      const opts = {
        hostname, path, method,
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      };
      if (postData) opts.headers['Content-Length'] = Buffer.byteLength(postData);
      const req = https.request(opts, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve({ status: res.statusCode, raw: data }); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('PayPal request timeout')); });
      if (postData) req.write(postData);
      req.end();
    } catch (e) { reject(e); }
  });
}

/*
 * TIERS - these MUST match api/shop-order.js exactly.
 *
 * They did not, and the mismatch meant the shop could sell a product the app refused.
 * The app knew only basic/full/pro. The website sold pro/standard/repair + five modules.
 * So a customer who paid GBP 30 for Standard received a licence whose tier the app did
 * not recognise, hasAccess() looked up TIERS['standard'], found undefined, and denied
 * EVERY phase - they would have paid and been handed nothing that worked.
 *
 * The website is the source of truth because that is where the price is advertised and
 * charged. `node scripts/check-tier-parity.mjs` fails the build if these drift again.
 */
const TIERS = {
  pro: {
    label: 'PCTG Optimizer Pro', price: 50,
    unlocks: ['cleanup', 'performance', 'final', 'pro', 'fps', 'security', 'internet', 'winfix', 'master', 'restore', 'registry', 'disk', 'deep', 'gpu-nvidia', 'gpu-amd', 'gpu-intel', 'repair', 'uninstaller', 'duplicates', 'contextmenu']
  },
  standard: {
    label: 'PCTG Optimizer Standard', price: 30,
    unlocks: ['cleanup', 'performance', 'final', 'restore', 'registry', 'disk', 'fps', 'security', 'gpu-nvidia', 'gpu-amd', 'gpu-intel', 'repair', 'uninstaller']
  },
  repair: {
    label: 'System Test & Repair', price: 25,
    unlocks: ['repair', 'restore']
  },
  fps: { label: 'FPS Booster module', price: 10, unlocks: ['fps', 'gpu-nvidia', 'gpu-amd', 'gpu-intel'] },
  security: { label: 'Security module', price: 10, unlocks: ['security'] },
  internet: { label: 'Internet / WiFi module', price: 10, unlocks: ['internet'] },
  winfix: { label: '1-Click WinFix module', price: 10, unlocks: ['winfix'] },
  deep: { label: 'Deep Optimize module', price: 10, unlocks: ['deep'] }
};

let mainWindow;
let activeTier = null;
let demoMode = false;

function seedDefaults() {
  const srcKeys = path.join(__dirname, 'license', 'keys.json');
  const srcLicense = path.join(__dirname, 'license', 'license.json');
  for (const [src, dest] of [[srcKeys, keysDbPath], [srcLicense, licensePath]]) {
    if (!fs.existsSync(dest) && fs.existsSync(src)) {
      try {
        const data = fs.readFileSync(src);
        fs.writeFileSync(dest, data);
      } catch {}
    }
  }
}

function initAnalytics() {
  try { return JSON.parse(fs.readFileSync(analyticsPath, 'utf-8')); } catch {}
  const blank = { installs: 1, updates: 0, exports: 0, phases: {}, firstRun: Date.now(), lastRun: Date.now() };
  // The write below was NOT guarded, and it runs on every first launch.
  //
  // On a fresh Windows install the userData directory does not exist yet, so
  // writeFileSync throws ENOENT. That throw happened inside
  // app.whenReady().then(...), which makes it an unhandled rejection, which
  // terminates the process under modern Node. The result was the packaged app
  // exiting instantly with no window and nothing on stderr - which is exactly
  // what it did, every time, and why nobody could see why.
  try {
    fs.mkdirSync(path.dirname(analyticsPath), { recursive: true });
    fs.writeFileSync(analyticsPath, JSON.stringify(blank));
  } catch (e) {
    // Analytics is not worth failing a launch over.
    startupLog('initAnalytics write skipped: ' + (e && e.message ? e.message : e));
  }
  return blank;
}

function trackEvent(type, label) {
  const data = initAnalytics();
  data.lastRun = Date.now();
  if (type === 'phase') {
    data.phases[label] = (data.phases[label] || 0) + 1;
  } else if (type === 'update') {
    data.updates += 1;
  } else if (type === 'export') {
    data.exports += 1;
  }
  fs.writeFileSync(analyticsPath, JSON.stringify(data));
}

function getMachineId() {
  if (process.platform === 'win32') {
    try {
      const buf = require('child_process').execSync(
        'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid 2>nul',
        { encoding: 'utf-8', timeout: 3000 }
      );
      const match = buf.match(/MachineGuid\s+REG_SZ\s+(\S+)/);
      if (match) {
        return crypto.createHash('sha256').update(match[1] + '|' + os.hostname()).digest('hex').slice(0, 32);
      }
    } catch {}
  }
  const interfaces = os.networkInterfaces();
  const macs = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
        macs.push(iface.mac);
      }
    }
  }
  if (macs.length === 0) {
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.mac && iface.mac !== '00:00:00:00:00:00') {
          macs.push(iface.mac);
        }
      }
    }
  }
  const raw = macs.sort().join(':') + '|' + os.hostname();
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

function validateLicenseOnline(key, machineId) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ key, machineId });
    const u = new URL(VALIDATION_API);
    const opts = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      rejectUnauthorized: true,
      timeout: 10000
    };
    const req = https.request(opts, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(data);
    req.end();
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.maximize();
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  /*
   * Set the Admin Edition title AFTER loadFile.
   *
   * It was set before, and loadFile overwrote it the moment index.html's <title> was
   * applied - so the Admin Edition opened with a window labelled exactly like the
   * customer build. That matters: an admin build must be impossible to mistake for
   * something a customer received, especially since these are built side by side.
   */
  if (IS_ADMIN) {
    const adminTitle = PRODUCT_NAME + '  -  ADMIN BUILD (not for customer distribution)';
    win.webContents.on('did-finish-load', () => {
      try { win.setTitle(adminTitle); } catch {}
    });
    setTimeout(() => { try { win.setTitle(adminTitle); } catch {} }, 2500);
  }
  mainWindow = win;
}



// ---------------------------------------------------------------------------
// STARTUP DIAGNOSTICS
//
// The packaged app was exiting immediately with no window and no error on
// stderr. An exception thrown inside app.whenReady().then(...) becomes an
// unhandled rejection, which under modern Node terminates the process - so the
// app vanished silently and nothing was ever written down.
//
// These handlers make startup loud. They write to a file as well as the console
// because a packaged Windows build's stderr is not always visible.
//
// THE FILE PATH IS NOT TAKEN FROM AN ENVIRONMENT VARIABLE. It did that before, and
// relying on PCTG_STARTUP_LOG reaching the main process through PowerShell Start-Process
// and through cmd was unreliable - the log silently stayed empty, which is exactly the
// failure mode diagnostics exist to prevent. The path is now derived from the app's own
// userData folder, so it always exists and always works, with no setup at all.
//
// For the Admin Edition userData ends in pctg-optimizer-admin, so the two builds write
// to separate files and cannot be confused.
//
// Public build location:
//   %APPDATA%\pctg-optimizer\startup.log
// Admin build location:
//   %APPDATA%\pctg-optimizer-admin\startup.log
// ---------------------------------------------------------------------------
const STARTUP_LOG = (() => {
  try {
    const dir = app.getPath('userData');
    require('node:fs').mkdirSync(dir, { recursive: true });
    return path.join(dir, 'startup.log');
  } catch {
    return process.env.PCTG_STARTUP_LOG || '';
  }
})();

let STARTUP_LOG_WRITTEN = false;
function startupLog(msg) {
  const line = `[startup ${new Date().toISOString()}] ${msg}`;
  console.log(line);
  if (!STARTUP_LOG) return;
  try {
    // Truncate once at boot so each run is a fresh record rather than an ever-growing
    // file that hides the most recent attempt - the previous run is usually the useful one.
    if (!STARTUP_LOG_WRITTEN) {
      require('node:fs').writeFileSync(STARTUP_LOG, line + '\n');
      STARTUP_LOG_WRITTEN = true;
    } else {
      require('node:fs').appendFileSync(STARTUP_LOG, line + '\n');
    }
  } catch {}
}
process.on('uncaughtException', (err) => {
  startupLog('UNCAUGHT EXCEPTION: ' + (err && err.stack ? err.stack : err));
  try { process.exit(1); } catch {}
});
process.on('unhandledRejection', (err) => {
  startupLog('UNHANDLED REJECTION: ' + (err && err.stack ? err.stack : JSON.stringify(err)));
});

startupLog('main.js loaded, platform=' + process.platform + ' electron=' + (process.versions.electron || 'n/a'));
try {
  startupLog('build variant: edition=' + VARIANT.edition + ' isAdmin=' + IS_ADMIN + ' path=' + variantPath);
} catch {}

app.whenReady().then(() => {
  startupLog('app ready');
  try {
    seedDefaults();
    startupLog('seedDefaults ok');
    initAnalytics();
    startupLog('initAnalytics ok');
    createWindow();
    startupLog('createWindow ok, windows=' + BrowserWindow.getAllWindows().length);
  } catch (err) {
    startupLog('STARTUP THREW: ' + (err && err.stack ? err.stack : err));
    throw err;
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((err) => {
  startupLog('whenReady REJECTED: ' + (err && err.stack ? err.stack : err));
});

app.on('before-quit', () => {
  /*
   * THIS DELETED THE LICENCE FILE ON EVERY EXIT.
   *
   * It meant a customer had to re-enter their key every single time they closed the
   * app, despite what the app itself promises on screen: "YOU GET UNLIMITED USAGE
   * BUT LOST / FORGOTTEN KEYS CANNOT BE RECOVERED". Anything that removes the stored
   * licence makes the second half of that sentence the everyday experience.
   *
   * Nothing needs cleaning up here. The licence is the customer's paid entitlement
   * and must survive a restart; it is bound to the machine and re-verified against
   * the server on launch, which is what actually stops copying it.
   */
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function checkForUpdates(callback) {
  let settled = false;
  const finish = (error, result) => {
    if (settled) return;
    settled = true;
    callback(error, result);
  };
  const req = https.get(UPDATE_RELEASE_API, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `PCTG-Optimizer/${currentVersion}`
    }
  }, (res) => {
    let data = "";
    if (res.statusCode !== 200) {
      res.resume();
      finish(new Error(`Update manifest returned HTTP ${res.statusCode}.`));
      return;
    }
    res.on("data", chunk => {
      data += chunk;
      if (data.length > 1024 * 1024) req.destroy(new Error('Update manifest is too large.'));
    });
    res.on("end", () => {
      try {
        const release = JSON.parse(data);
        const latest = parseGitHubRelease(release);
        const updateAvailable = isVersionNewer(latest.version, currentVersion);
        finish(null, { updateAvailable, latest });
      } catch (e) {
        finish(e);
      }
    });
    res.on('error', finish);
  });
  req.on("error", err => finish(err));
  req.setTimeout(10000, () => { req.destroy(new Error('Update check timed out')); });
}

function downloadInstaller(value, destination) {
  const temporaryPath = `${destination}.part`;
  const allowedHosts = new Set(['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com']);

  const requestDownload = (urlValue, redirects = 0) => new Promise((resolve, reject) => {
    const url = new URL(urlValue);
    if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname) || redirects > 5) {
      reject(new Error('The update download redirected to an untrusted location.'));
      return;
    }

    const request = https.get(url, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        requestDownload(new URL(response.headers.location, url).href, redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Update download returned HTTP ${response.statusCode}.`));
        return;
      }
      const contentLength = Number(response.headers['content-length'] || 0);
      if (contentLength > 500 * 1024 * 1024) {
        response.destroy(new Error('The update installer exceeds the allowed download size.'));
        reject(new Error('The update installer exceeds the allowed download size.'));
        return;
      }

      const file = fs.createWriteStream(temporaryPath);
      let receivedBytes = 0;
      let finished = false;
      const fail = (error) => {
        if (finished) return;
        finished = true;
        file.destroy();
        try { fs.unlinkSync(temporaryPath); } catch {}
        reject(error);
      };
      response.on('data', (chunk) => {
        receivedBytes += chunk.length;
        if (receivedBytes > 500 * 1024 * 1024) response.destroy(new Error('The update installer exceeds the allowed download size.'));
      });
      response.on('error', fail);
      response.on('aborted', () => fail(new Error('The update download was interrupted.')));
      response.pipe(file);
      file.on('finish', () => file.close(() => {
        if (finished) return;
        try {
          const descriptor = fs.openSync(temporaryPath, 'r');
          const signature = Buffer.alloc(2);
          fs.readSync(descriptor, signature, 0, 2, 0);
          fs.closeSync(descriptor);
          if (signature.toString('ascii') !== 'MZ') throw new Error('The downloaded update is not a Windows installer.');
          fs.renameSync(temporaryPath, destination);
          finished = true;
          resolve();
        } catch (error) {
          fail(error);
        }
      }));
      file.on('error', fail);
    });

    request.on('error', (error) => {
      try { fs.unlinkSync(temporaryPath); } catch {}
      reject(error);
    });
    request.setTimeout(120000, () => request.destroy(new Error('Update download timed out.')));
  });

  return requestDownload(value);
}

function hasAccess(phase) {
  // The 'admin' short-circuit that used to sit here has been REMOVED.
  // It bypassed TIERS entirely, and activeTier used to be read straight off a local
  // license.json - so writing {"tier":"admin"} into that file granted every phase in the
  // app. There is no longer any path that sets 'admin': SPECIAL_KEYS is gone and the
  // tier now comes from the server. Fail closed.
  if (!activeTier || !TIERS[activeTier]) return false;
  return TIERS[activeTier].unlocks.includes(phase);
}

function requireLicensedAction(action) {
  if (demoMode || !activeTier || !TIERS[activeTier]) {
    throw new Error(`${action} requires an activated paid licence.`);
  }
}

function ensureScriptsExtracted() {
  const scriptsDir = path.join(userDataPath, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  const srcDir = path.join(__dirname, 'scripts');
  if (fs.existsSync(srcDir)) {
    for (const f of fs.readdirSync(srcDir)) {
      if (f.endsWith('.ps1')) {
        const dest = path.join(scriptsDir, f);
        if (!fs.existsSync(dest)) {
          fs.cpSync(path.join(srcDir, f), dest);
        }
      }
    }
  }
  return scriptsDir;
}

function runPs(scriptName, label) {
  return new Promise((resolve, reject) => {
    const scriptsDir = ensureScriptsExtracted();
    const scriptPath = path.join(scriptsDir, scriptName);
    const child = spawn('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath]);
    let output = '';

    child.stdout.on('data', (data) => {
      const lines = data.toString();
      output += lines;
      lines.split('\n').filter(l => l.trim()).forEach(line => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('pctg:phase-progress', { label, line: line.trim() });
        }
      });
    });

    child.stderr.on('data', (data) => {
      const lines = data.toString();
      output += lines;
      lines.split('\n').filter(l => l.trim()).forEach(line => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('pctg:phase-progress', { label, line: line.trim() });
        }
      });
    });

    child.on('close', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(output || `Exit code ${code}`));
    });

    child.on('error', reject);
  });
}

ipcMain.handle("pctg:check-update", () => {
  return new Promise((resolve) => {
    checkForUpdates((err, result) => {
      if (err) resolve({ updateAvailable: false, error: err.message || 'Update check failed.' });
      else resolve(result);
    });
  });
});

/*
 * OFFLINE GRACE WINDOW.
 *
 * A paying customer must not be locked out because their broadband dropped, so a
 * licence stays usable for this long after the server last confirmed it. Without it,
 * checking online on every launch would mean a flaky connection costs someone their
 * access - which is exactly the kind of failure that produces a chargeback.
 *
 * It is NOT a licence-validity mechanism. A forged license.json has no
 * serverVerifiedAt, so it falls outside the window immediately and fails closed.
 */
const LICENSE_GRACE_DAYS = 7;

function writeLicense(data) {
  fs.writeFileSync(licensePath, JSON.stringify(data));
}

ipcMain.handle('pctg:check-license', async () => {
  /*
   * ADMIN EDITION AUTO-GRANT - must be the FIRST thing this handler does.
   *
   * The handler used to read the stored licence first and return invalid when none
   * existed. The admin check lived further down, so on a fresh machine with no
   * licence file the Admin Edition was locked out before its own unlock could run -
   * which is exactly why the Boss saw "This licence key is not recognised" while
   * testing a build that was supposed to need no key at all.
   *
   * IS_ADMIN is baked into package.json at build time (pctgEdition). It can only be
   * true for a build produced by PCTG_BUILD=admin, which the release pipeline never
   * passes, so this branch is unreachable in a customer copy. Failing closed is the
   * point: if the variant cannot be read, readVariant() returns 'public'.
   */
  if (IS_ADMIN) {
    try {
      writeLicense({
        key: 'INTERNAL-ADMIN-EDITION',
        tier: 'pro',
        activated: true,
        machineId: getMachineId(),
        activatedAt: Date.now(),
        serverVerifiedAt: Date.now(),
        internal: true,
        adminEdition: true,
      });
    } catch (e) {
      startupLog('admin edition licence write failed: ' + (e && e.message ? e.message : e));
    }
    activeTier = 'pro';
    demoMode = false;
    startupLog('check-license: ADMIN EDITION auto-granted Pro (no licence, no server call)');
    return { valid: true, tier: 'pro', internal: true, admin: true };
  }

  let local = null;
  try {
    local = JSON.parse(fs.readFileSync(licensePath, 'utf-8'));
  } catch {
    local = null;
  }
  if (!local || !local.key || !local.activated) {
    activeTier = null;
    return { valid: false, tier: null };
  }

  const currentId = getMachineId();
  if (local.machineId !== currentId) {
    // The licence file was copied from another machine. The server is the authority on
    // this too, but refusing locally avoids a pointless round trip.
    activeTier = null;
    return { valid: false, tier: null, reason: 'hardware-mismatch' };
  }

  /*
   * INTERNAL CAPTURE LICENCE - honoured ONLY while the override is present.
   *
   * The unlock wrote an `internal: true` licence that the server has never seen, so
   * the normal server check below rejects it as unknown and throws the Boss straight
   * back to the licence screen. Hence this branch.
   *
   * It is gated on the environment variable as well as the flag, so a hand-edited
   * license.json containing "internal": true achieves nothing on a normal install -
   * without PCTG_INTERNAL_UNLOCK in the environment this branch is unreachable and
   * the server remains the only authority.
   */
  if (local.internal === true && internalUnlockEnabled()) {
    activeTier = TIERS[local.tier] ? local.tier : 'pro';
    if (!activeTier) { activeTier = null; return { valid: false, tier: null, reason: 'unknown-tier' }; }
    startupLog('check-license: internal capture licence accepted, tier=' + activeTier);
    return { valid: true, tier: activeTier, internal: true };
  }

  /*
   * THE SERVER IS THE AUTHORITY.
   *
   * This used to read local files only, so the licence was exactly as strong as a JSON
   * file on disk. It now asks /api/validate, which checks Postgres and applies the
   * first-activation binding, on every launch.
   */
  const result = await validateLicenseOnline(local.key, currentId);

  // null = could not reach the server (offline, DNS, TLS, timeout).
  // temporary:true = the server answered but its store is unavailable.
  // Anything else with active:false is an authoritative refusal: unknown, revoked, or
  // bound to a different machine.
  const offline = !result || result.temporary === true;

  if (offline) {
    const lastVerified = Number(local.serverVerifiedAt || 0);
    const ageDays = lastVerified ? (Date.now() - lastVerified) / 86400000 : Infinity;
    if (ageDays <= LICENSE_GRACE_DAYS) {
      if (!TIERS[local.tier]) {
        activeTier = null;
        return { valid: false, tier: null, reason: 'unknown-tier' };
      }
      activeTier = local.tier;
      return { valid: true, tier: activeTier, offline: true, graceDaysLeft: Math.ceil(LICENSE_GRACE_DAYS - ageDays) };
    }
    activeTier = null;
    return {
      valid: false,
      tier: null,
      reason: lastVerified ? 'grace-expired' : 'never-verified',
      message: lastVerified
        ? 'Could not reach the licence server and your offline grace period has expired. Connect to the internet and try again.'
        : 'Could not reach the licence server. Connect to the internet once to verify this licence.'
    };
  }

  if (!result.active) {
    activeTier = null;
    return { valid: false, tier: null, reason: result.reason || 'rejected', message: result.message };
  }

  // Authoritative success - record it so the offline window has a starting point.
  writeLicense({ ...local, tier: result.tier, serverVerifiedAt: Date.now() });
  activeTier = result.tier;
  demoMode = false;
  return { valid: true, tier: result.tier, offline: false };
});

ipcMain.handle('pctg:start-demo', () => {
  if (activeTier && TIERS[activeTier]) return { success: false, message: 'An active licence is already available.' };
  activeTier = null;
  demoMode = true;
  return { success: true };
});

ipcMain.handle('pctg:activate-license', async (event, key) => {
  try {
    const trimmed = (key || '').trim();
    if (!trimmed) return { success: false, tier: null };

    /*
     * INTERNAL CAPTURE UNLOCK - for screenshot / video capture of the Pro UI.
     *
     * Honoured only for the Admin Edition or an UNPACKED developer launch. In a
     * packaged public build this branch is unreachable even if PCTG_INTERNAL_UNLOCK
     * is set, because an environment variable is something the person running the app
     * chooses - a customer could set it and type the same value here to get Pro with
     * no server call. That was a real bypass, fixed 2026-10-11; see
     * lib/internalUnlock.js and tests/internal-unlock.test.js.
     *
     * This replaces the old SPECIAL_KEYS entry, which granted Pro with no server
     * call in every shipped copy.
     */
    const internal = checkInternalUnlock(trimmed);
    if (internal) {
      const machineId = getMachineId();
      writeLicense({
        key: trimmed,
        tier: internal.tier,
        activated: true,
        machineId,
        activatedAt: Date.now(),
        serverVerifiedAt: Date.now(),
        internal: true,
      });
      activeTier = internal.tier;
      demoMode = false;
      return { success: true, tier: internal.tier, internal: true };
    }

    /*
     * SPECIAL_KEYS is GONE.
     *
     * It contained 'the old capture password' -> pro, and activated it without ever
     * contacting the server. Revoking that key in Postgres did nothing, because this
     * path never asked Postgres. It was a free Pro licence compiled into every copy of
     * the app, readable by anyone who opened the packaged JavaScript.
     *
     * Every licence now comes from the server, which checks the database and binds the
     * key to this machine on first activation.
     */
    const machineId = getMachineId();

    const result = await validateLicenseOnline(trimmed, machineId);
    if (result && result.active) {
      if (!TIERS[result.tier]) {
        return { success: false, tier: null, message: `Licence tier "${result.tier}" is not recognised by this version. Please update the app.` };
      }
      writeLicense({
        key: trimmed,
        tier: result.tier,
        activated: true,
        machineId,
        activatedAt: Date.now(),
        serverVerifiedAt: Date.now()
      });
      activeTier = result.tier;
      demoMode = false;
      return { success: true, tier: result.tier };
    }

    if (result && !result.active) {
      return { success: false, tier: null, message: result.message || 'Invalid license key.' };
    }

    /*
     * OFFLINE FALLBACK.
     *
     * Only reached when the server could not be reached at all (result === null). It
     * requires a licence the SERVER has previously confirmed - `serverVerifiedAt` must
     * exist and be inside the grace window - because otherwise this would accept any
     * file a user happened to have written into license.json.
     *
     * It also no longer defaults to 'basic': that tier does not exist any more, and a
     * silent default to an unknown tier is exactly how a paid customer ends up with a
     * licence that unlocks nothing.
     */
    if (result === null) {
      try {
        const local = JSON.parse(fs.readFileSync(licensePath, 'utf-8'));
        const lastVerified = Number(local.serverVerifiedAt || 0);
        const ageDays = lastVerified ? (Date.now() - lastVerified) / 86400000 : Infinity;
        const knownTier = local.tier && TIERS[local.tier];
        if (local.key === trimmed && local.activated && local.machineId === machineId && knownTier && ageDays <= LICENSE_GRACE_DAYS) {
          activeTier = local.tier;
          return { success: true, tier: activeTier, offline: true, graceDaysLeft: Math.ceil(LICENSE_GRACE_DAYS - ageDays) };
        }
      } catch {}
      return { success: false, tier: null, message: 'Unable to reach activation server. Check your internet connection and try again.' };
    }
    return { success: false, tier: null, message: 'Invalid license key.' };
  } catch {}
  return { success: false, tier: null, message: 'Activation failed.' };
});

ipcMain.handle('pctg:get-tier-info', () => {
  const prices = {};
  for (const [t, info] of Object.entries(TIERS)) {
    prices[t] = info.price;
  }
  return { activeTier, tiers: TIERS, prices };
});

ipcMain.handle('pctg:check-phase-access', (event, phase) => {
  return { allowed: hasAccess(phase) };
});

ipcMain.handle('pctg:get-purchase-url', () => {
  return PAYPAL_URL;
});

/*
 * IN-APP PURCHASE HAS BEEN REMOVED. Buying now hands off to the website checkout.
 *
 * Three independent reasons, any one of which is enough:
 *
 * 1. It could never work in a release. build.js writes a PLACEHOLDER paypal-config.json
 *    when the real one is absent (and it is deliberately gitignored), so the shipped app
 *    had credentials that authenticate against nobody.
 * 2. Making it work would mean shipping your LIVE PayPal client secret inside an
 *    executable that customers download. Anyone could extract it and create or capture
 *    orders on your account. That is not an acceptable trade for a GBP 10 module.
 * 3. It minted licence keys locally with sha256(machineId|tier|orderId). Those keys were
 *    never written to the server database, so they would fail validation - the customer
 *    would pay in-app and receive a key the product rejects.
 *
 * The website checkout does all of this correctly: PayPal credentials stay on the
 * server, the capture is verified against PayPal, and the key is written to Postgres.
 * One purchase path means one thing to get right.
 */
ipcMain.handle('pctg:begin-purchase', async (event, { tier } = {}) => {
  const base = 'https://pctgopt.pctechguyonline.com';
  if (tier && TIERS[tier]) {
    return { success: true, url: base + '/#pricing', tier, price: TIERS[tier].price };
  }
  return { success: true, url: base + '/#pricing' };
});

/*
 * pctg:generate-key has been DELETED.
 *
 * It was reachable from the UI as "Manual key generation from PayPal receipt (fallback)".
 * It accepted ANY string of 8+ characters as a "receipt", never verified it against
 * PayPal, never contacted the server, and wrote a working licence to disk at whatever
 * tier was selected. It was not a fallback - it was a self-service Pro licence with a
 * text box in front of it.
 *
 * The only routes to a licence are now: the server /api/validate (which checks Postgres,
 * and binds the key to the machine), and the in-app PayPal capture below, which proves a
 * real payment before issuing anything.
 */

ipcMain.handle('pctg:run-toggle', async (event, { key, enabled }) => {
  // `deep` is a paid module. This handler ran deep.ps1 with NO licence check, so it was
  // an ungated route to a Pro-only system change. Gated like every other phase.
  if (!hasAccess('deep')) {
    throw new Error(`Your license does not include "deep". Purchase the Deep Optimize module at ${PAYPAL_URL}`);
  }
  const scriptsDir = ensureScriptsExtracted();
  const scriptPath = path.join(scriptsDir, 'deep.ps1');
  const toggleArg = enabled ? "1" : "0";
  const cmd = `powershell -ExecutionPolicy Bypass -File "${scriptPath}" -toggles "${key}"`;
  return new Promise((resolve) => {
    exec(cmd, { timeout: 15000 }, (err) => resolve({ success: !err }));
  });
});

ipcMain.handle('pctg:get-disk-space', () => {
  try {
    const drives = require('child_process').execSync(
      'powershell -Command "Get-PSDrive C | Select-Object Used,Free | ConvertTo-Json"',
      { encoding: 'utf-8', timeout: 5000 }
    );
    const info = JSON.parse(drives.trim());
    return { free: info.Free, used: info.Used };
  } catch { return { free: 0, used: 0 }; }
});

ipcMain.handle('pctg:get-startup-apps', () => {
  if (activeTier !== 'pro') throw new Error('Startup Apps manager requires the Pro Gaming tier.');
  return startupManager.listStartupApps();
});

ipcMain.handle('pctg:set-startup-app-enabled', (_event, { id, enabled } = {}) => {
  if (activeTier !== 'pro') throw new Error('Startup Apps manager requires the Pro Gaming tier.');
  return startupManager.setStartupAppEnabled(id, enabled);
});

// Gaming Mode (R&D finding 1d9e37ba97, "Add 'Safe Gaming Tweaks' Section with
// Disclaimer"). The finding asks for a button that runs ONLY pre-validated safe
// tweaks and does NOT touch aggressive registry edits. Three deliberate choices,
// each of which is a decision rather than an omission:
//
//   1. HAGS is REPORTED, NEVER FLIPPED. HAGS is a Windows display setting that
//      needs a reboot, it only exists on Windows 10 2004+/11, and some older
//      drivers regress without it. A previous review already moved HAGS to
//      detection-and-display for exactly this reason, so this endpoint reports
//      the real value and leaves it alone.
//   2. Startup changes are OPTIONAL and DEFAULT OFF, and every one is reversible
//      through the startup manager's own backup file - nothing is deleted.
//   3. A restore point is offered, never forced silently. Skipping it is a
//      choice the customer makes, and the response says so out loud.
//
// If anything here cannot be read, the endpoint still returns what it knows and
// lists what it could not check, rather than failing the whole button.
const GAMING_MODE_CONSERVATIVE_DEFAULTS = [
  /^onedrive/i, /^teams/i, /^zoom/i, /^discord/i, /^steam/i, /^epic/i, /^skype/i,
  /^xbox/i, /^gamereporter/i, /^nvidia/i, /^nahimic/i, /^obs/i, /^overwolf/i,
  /^discord/i, /^spotify/i, /^todo/i, /^mail/i
];

function readHagsState() {
  // HKEY_CURRENT_USER\System\GameConfigStore -> GameDVR_HideUserMode? The real
  // switch is HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\GraphicsDrivers
  // -> HwSchMode: 1 = off, 2 = on. Read-only, no writes, ever.
  if (process.platform !== 'win32') return { supported: false, enabled: null, source: 'not-windows' };
  try {
    const { execFileSync } = require('child_process');
    const out = execFileSync('reg.exe', [
      'query', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers', '/v', 'HwSchMode'
    ], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    const match = /HwSchMode\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(out);
    if (!match) return { supported: true, enabled: false, source: 'registry-value-absent', note: 'HwSchMode is not set, so hardware-accelerated GPU scheduling is off.' };
    const value = parseInt(match[1], 16);
    return { supported: true, enabled: value === 2, value, source: 'registry' };
  } catch (error) {
    return { supported: true, enabled: null, source: 'unreadable', note: 'Could not read the HAGS setting: ' + (error.message || error) };
  }
}

ipcMain.handle('pctg:gaming-mode', async (_event, { disableStartup = false } = {}) => {
  if (!hasAccess('fps')) {
    throw new Error(`Your license does not include "fps". Purchase the required tier at ${PAYPAL_URL}`);
  }
  const performed = [];
  const skipped = [];
  const notChecked = [];

  // --- 1. HAGS: reported, never written -----------------------------------------
  let hags = { supported: false, enabled: null, source: 'not-windows' };
  try { hags = readHagsState(); } catch (error) { hags = { supported: true, enabled: null, source: 'unreadable', note: String(error.message || error) }; }
  if (hags.enabled === null) notChecked.push('Hardware-accelerated GPU scheduling (HAGS)');
  else if (hags.enabled) performed.push('Hardware-accelerated GPU scheduling is already on - left as it is.');
  else performed.push('Hardware-accelerated GPU scheduling is off. Left as it is: switching it needs a reboot and can regress on older drivers.');

  // --- 2. Startup apps: read always, change only when asked ----------------------
  let startup = { considered: 0, alreadyDisabled: 0, disabled: [], available: false };
  try {
    const items = startupManager.listStartupApps();
    const list = Array.isArray(items) ? items : (Array.isArray(items?.items) ? items.items : []);
    startup.considered = list.length;
    startup.available = true;
    if (disableStartup) {
      for (const item of list) {
        if (item.enabled === false) { startup.alreadyDisabled++; continue; }
        if (item.manageable === false) { skipped.push(`${item.name} is not a startup entry this app can safely manage.`); continue; }
        if (!GAMING_MODE_CONSERVATIVE_DEFAULTS.some((re) => re.test(String(item.name || '')))) continue;
        try {
          await startupManager.setStartupAppEnabled(item.id, false);
          startup.disabled.push(item.name);
        } catch (error) {
          notChecked.push(`${item.name} could not be disabled (${error.message || error})`);
        }
      }
      if (startup.disabled.length) {
        performed.push(`Disabled ${startup.disabled.length} known background launcher(s): ${startup.disabled.join(', ')}.`);
      } else {
        performed.push('No known background launchers needed disabling.');
      }
    } else {
      performed.push(`Startup entries read (${list.length} found) and left untouched - you chose review-only.`);
    }
  } catch (error) {
    // Not being able to read startup entries must NOT sink the whole button.
    startup.available = false;
    notChecked.push('Startup entries could not be read: ' + (error.message || error));
  }

  trackEvent('phase', 'gaming-mode');
  return {
    ok: true,
    hags,
    startup,
    performed,
    skipped,
    notChecked,
    disclaimer:
      'Gaming Mode runs only pre-validated, reversible changes. It does not edit the registry aggressively, and it does not increase your frame rate on older hardware - what it does is stop background launchers from competing for resources during a session. Every startup change can be switched back on from the Startup Apps list, and we recommend a restore point first.',
    restorePointSuggested: true,
  };
});

function getInstalledTuningApps() {
  if (process.platform !== 'win32') return [];
  try {
    const output = require('child_process').execFileSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress'
    ], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
    const parsed = JSON.parse(output.trim().replace(/^\uFEFF/, '') || '[]');
    return (Array.isArray(parsed) ? parsed : [parsed])
      .filter(app => app && typeof app.Name === 'string')
      .map(app => ({ name: app.Name, appId: app.AppID }));
  } catch (error) {
    throw new Error(`Could not check installed tuning utilities: ${error.message}`);
  }
}

ipcMain.handle('pctg:get-hardware-tuning-tools', async () => {
  if (activeTier !== 'pro') throw new Error('Hardware tuning guidance requires the Pro Gaming tier.');
  const analysis = getCachedAnalysis() || await analyzeSystem();
  let installedApps = null;
  let availabilityError = null;
  try {
    installedApps = getInstalledTuningApps();
  } catch (error) {
    availabilityError = error.message;
  }
  const result = getHardwareTuningTools(analysis.specs);
  return {
    ...result,
    tools: result.tools.map(tool => ({
      ...tool,
      installed: installedApps ? Boolean(findInstalledToolApp(installedApps, tool.id)) : null
    })),
    availabilityError
  };
});

ipcMain.handle('pctg:open-hardware-tuning-tool', async (_event, toolId) => {
  if (activeTier !== 'pro') throw new Error('Hardware tuning guidance requires the Pro Gaming tier.');
  const analysis = getCachedAnalysis() || await analyzeSystem();
  const result = getHardwareTuningTools(analysis.specs);
  const tool = result.tools.find(candidate => candidate.id === toolId);
  if (!tool) throw new Error('That tuning utility is not recommended for the detected hardware.');

  if (process.platform === 'win32') {
    let installed;
    try {
      installed = findInstalledToolApp(getInstalledTuningApps(), toolId);
    } catch (error) {
      await shell.openExternal(tool.url);
      return { launched: false, installed: false, openedUrl: true, warning: error.message };
    }
    if (installed) {
      require('child_process').execFileSync('explorer.exe', [
        `shell:AppsFolder\\${installed.appId}`
      ], { windowsHide: true, timeout: 5000 });
      return { launched: true, installed: true };
    }
  }

  await shell.openExternal(tool.url);
  return { launched: false, installed: false, openedUrl: true };
});

ipcMain.handle('pctg:get-analytics', () => initAnalytics());

ipcMain.handle('pctg:analyze-system', async (_event, { refresh = false } = {}) => {
  const cached = refresh ? null : getCachedAnalysis();
  if (cached) return cached;
  return await analyzeSystem();
});

ipcMain.handle('pctg:demo-system-scan', async () => {
  const specs = getDetailedSpecs();
  return {
    scannedAt: new Date().toISOString(),
    specs,
    recommendations: getDemoRecommendations(specs)
  };
});

ipcMain.handle('pctg:get-system-analysis', () => {
  return getCachedAnalysis();
});

ipcMain.handle('pctg:apply-custom-tweaks', async (event, script) => {
    // Custom gaming tweaks are a Pro-only feature. 'full' no longer exists as a tier.
    if (activeTier !== 'pro') {
      return { success: false, error: 'Custom gaming optimizations require the Pro Gaming tier.' };
    }
  return applyOptimizations(script);
});

ipcMain.handle('pctg:open-url', (event, url) => {
  shell.openExternal(url);
});

ipcMain.handle("pctg:download-update", async () => {
  requireLicensedAction('Updating the app');
  if (process.platform !== 'win32') throw new Error('The Windows installer is only available on Windows.');

  const update = await new Promise((resolve, reject) => {
    checkForUpdates((error, result) => error ? reject(error) : resolve(result));
  });
  if (!update.updateAvailable) return { success: false, message: 'The app is already up to date.' };
  if (!isTrustedInstallerUrl(update.latest.url)) throw new Error('The update installer URL is not trusted.');

  trackEvent('update');
  const updatePath = path.join(userDataPath, 'PCTG-Optimizer-Setup.exe');
  await downloadInstaller(update.latest.url, updatePath);

  const installer = spawn(updatePath, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  await new Promise((resolve, reject) => {
    installer.once('spawn', resolve);
    installer.once('error', reject);
  });
  installer.unref();
  app.quit();
  return { success: true };
});

const { generateReport } = require('./report/report');
const { getSystemInfo } = require('./report/systemInfo');
const { analyzeSystem, applyOptimizations, getCachedAnalysis } = require('./report/system-analyzer');

ipcMain.handle('pctg:export-pdf', async (event, reportData) => {
  requireLicensedAction('Exporting reports');
  trackEvent('export');
  const sysInfo = getSystemInfo();
  const data = { ...sysInfo, ...reportData };
  const srcPath = await generateReport(data);
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.basename(srcPath),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (!filePath) return;
  fs.copyFileSync(srcPath, filePath);
  fs.unlinkSync(srcPath);
});

ipcMain.handle('pctg:generate-report', async (event, phases) => {
  requireLicensedAction('Generating reports');
  const sys = getSystemInfo();

  const data = {
    os: sys.os,
    cpu: sys.cpu,
    ram: sys.ram,
    gpu: sys.gpu,
    phases,
    recommendations: [
      "Consider running PRO Mode for deeper optimisation.",
      "Enable Monthly Maintenance for ongoing performance.",
      "Run FPS Booster if you play games."
    ]
  };

  const filePath = await generateReport(data);
  return { filePath };
});

let _prevCpuTimes = null;

function getCpuUsage() {
  const cpus = os.cpus();
  let idle = 0, total = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      total += cpu.times[type];
    }
    idle += cpu.times.idle;
  }

  if (_prevCpuTimes) {
    const idleDelta = idle - _prevCpuTimes.idle;
    const totalDelta = total - _prevCpuTimes.total;
    const usage = totalDelta > 0 ? Math.round((1 - idleDelta / totalDelta) * 100) : 0;
    _prevCpuTimes = { idle, total };
    return Math.min(usage, 100);
  }

  _prevCpuTimes = { idle, total };
  return 0;
}

function getDiskInfo() {
  try {
    const out = require('child_process').execSync(
      'powershell -Command "Get-PSDrive C | Select-Object Used,Free | ConvertTo-Json"',
      { encoding: 'utf-8', timeout: 5000 }
    );
    const info = JSON.parse(out.trim());
    const total = info.Used + info.Free;
    return { used: info.Used, free: info.Free, total, percent: total > 0 ? Math.round((info.Used / total) * 100) : 0 };
  } catch { return { used: 0, free: 0, total: 107374182400, percent: 0 }; }
}

function getGpuInfo() {
  try {
    const out = require('child_process').execSync(
      'powershell -Command "Get-CimInstance Win32_VideoController | Where-Object { $_.Name -notmatch \'Parsec|Microsoft Basic|Remote Display|Virtual|Hyper-V|RDP\' } | Select-Object -First 1 Name | ConvertTo-Json"',
      { encoding: 'utf-8', timeout: 5000 }
    );
    const info = JSON.parse(out.trim());
    return { model: info.Name || 'Unknown', usage: Math.round(Math.random() * 30 + 10) };
  } catch { return { model: 'Unknown GPU', usage: 0 }; }
}

ipcMain.handle('pctg:get-stats', () => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const cpus = os.cpus();

  const cpuModel = cpus[0].model;
  const cpuCores = cpus.length;
  const cpuUsage = getCpuUsage();
  const disk = getDiskInfo();
  const gpu = getGpuInfo();

  return {
    cpu: {
      model: cpuModel,
      cores: cpuCores,
      usage: cpuUsage
    },
    memory: {
      total: totalMem,
      free: freeMem,
      used: totalMem - freeMem,
      percent: Math.round(((totalMem - freeMem) / totalMem) * 100)
    },
    disk,
    gpu,
    os: {
      platform: os.platform(),
      release: os.release(),
      hostname: os.hostname(),
      uptime: os.uptime()
    }
  };
});

function runGpuTweaks(brand) {
  const commands = {
    nvidia: `
Write-Host "=== NVIDIA GPU Tweaks ==="
$classGuid = "{4d36e968-e325-11ce-bfc1-08002be10318}"
$baseKey = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\$classGuid"
$applied = 0
Get-ChildItem $baseKey -ErrorAction SilentlyContinue | Where-Object {
  $d = (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).DriverDesc
  $d -match "NVIDIA"
} | ForEach-Object {
  $k = $_.PSPath
  Write-Host "NVIDIA GPU found: $((Get-ItemProperty $k).DriverDesc)"
  Set-ItemProperty -Path $k -Name "PerfLevelSrc" -Value 0x2222 -Type DWord -ErrorAction SilentlyContinue
  Set-ItemProperty -Path $k -Name "PowerMizerEnable" -Value 1 -Type DWord -ErrorAction SilentlyContinue
  Set-ItemProperty -Path $k -Name "PowerMizerLevel" -Value 1 -Type DWord -ErrorAction SilentlyContinue
  Set-ItemProperty -Path $k -Name "PowerMizerLevelBackup" -Value 1 -Type DWord -ErrorAction SilentlyContinue
  Set-ItemProperty -Path $k -Name "CUDAAttributes" -Value 2 -Type DWord -ErrorAction SilentlyContinue
  Write-Host "  -> Power management set to Maximum Performance"
  $umd = Join-Path $k "UMD"
  if (-not (Test-Path $umd)) { New-Item -Path $umd -Force | Out-Null }
  Set-ItemProperty -Path $umd -Name "EnableMidGfxPreemptionVGPU" -Value 0 -Type DWord -ErrorAction SilentlyContinue
  Set-ItemProperty -Path $umd -Name "EnableMidGfxPreemption" -Value 0 -Type DWord -ErrorAction SilentlyContinue
  Set-ItemProperty -Path $umd -Name "EnableSCGPreemption" -Value 0 -Type DWord -ErrorAction SilentlyContinue
  Write-Host "  -> Preemption disabled for lower latency"
  $applied++
}
$nvCpl = "HKCU:\\Software\\NVIDIA Corporation\\Global\\NVTweak"
if (-not (Test-Path $nvCpl)) { New-Item -Path $nvCpl -Force | Out-Null }
Set-ItemProperty -Path $nvCpl -Name "VSyncControl" -Value 0 -Type DWord -ErrorAction SilentlyContinue
Write-Host "  -> V-Sync set to Off (global)"
Set-ItemProperty -Path $nvCpl -Name "LowLatencyMode" -Value 3 -Type DWord -ErrorAction SilentlyContinue
Write-Host "  -> Low Latency Mode set to Ultra"
Set-ItemProperty -Path $nvCpl -Name "TextureFilterQuality" -Value 0 -Type DWord -ErrorAction SilentlyContinue
Write-Host "  -> Texture Filtering Quality set to High Performance"
Set-ItemProperty -Path $nvCpl -Name "MaxPreRenderedFrames" -Value 1 -Type DWord -ErrorAction SilentlyContinue
Write-Host "  -> Max Pre-Rendered Frames set to 1"
$nvGlobal = "HKCU:\\Software\\NVIDIA Corporation\\Global"
if (-not (Test-Path $nvGlobal)) { New-Item -Path $nvGlobal -Force | Out-Null }
Set-ItemProperty -Path $nvGlobal -Name "EnableThreadedOptimization" -Value 1 -Type DWord -ErrorAction SilentlyContinue
Write-Host "  -> Threaded Optimization enabled"
Set-ItemProperty -Path $nvGlobal -Name "ShaderCacheEnabled" -Value 1 -Type DWord -ErrorAction SilentlyContinue
Write-Host "  -> Shader Cache enabled"
Set-ItemProperty -Path $nvGlobal -Name "ShaderCacheSize" -Value 0 -Type DWord -ErrorAction SilentlyContinue
Write-Host "  -> Shader Cache size set to Unlimited"
Set-ItemProperty -Path $nvGlobal -Name "OpenGLThreadControl" -Value 1 -Type DWord -ErrorAction SilentlyContinue
Write-Host "  -> OpenGL Thread Control enabled"
if ($applied -gt 0) { Write-Host "NVIDIA tweaks applied: Power=Max Perf, VSync=Off, Latency=Ultra, Textures=Perf, ShaderCache=Unlimited" }
else { Write-Host "No NVIDIA GPU detected. Ensure NVIDIA drivers are installed." }
`,
    amd: `
Write-Host "=== AMD GPU Tweaks ==="
$classGuid = "{4d36e968-e325-11ce-bfc1-08002be10318}"
$baseKey = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\$classGuid"
$applied = 0
Get-ChildItem $baseKey -ErrorAction SilentlyContinue | Where-Object {
  $d = (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).DriverDesc
  $d -match "AMD" -or $d -match "Radeon"
} | ForEach-Object {
  $k = $_.PSPath
  Write-Host "AMD GPU found: $((Get-ItemProperty $k).DriverDesc)"
  $umd = Join-Path $k "UMD"
  if (-not (Test-Path $umd)) { New-Item -Path $umd -Force | Out-Null }
  Set-ItemProperty -Path $umd -Name "PerformanceMode" -Value 1 -Type DWord -ErrorAction SilentlyContinue
  Write-Host "  -> Performance Mode enabled"
  Set-ItemProperty -Path $umd -Name "DalPowerManagement" -Value 0 -Type DWord -ErrorAction SilentlyContinue
  Write-Host "  -> Power Saving disabled"
  Set-ItemProperty -Path $umd -Name "AntiLagEnable" -Value 1 -Type DWord -ErrorAction SilentlyContinue
  Write-Host "  -> Anti-Lag enabled"
  Set-ItemProperty -Path $umd -Name "ChillEnable" -Value 0 -Type DWord -ErrorAction SilentlyContinue
  Write-Host "  -> Radeon Chill disabled"
  Set-ItemProperty -Path $umd -Name "VSyncControl" -Value 0 -Type DWord -ErrorAction SilentlyContinue
  Write-Host "  -> V-Sync set to Off"
  Set-ItemProperty -Path $umd -Name "Tessellation" -Value 32 -Type DWord -ErrorAction SilentlyContinue
  Write-Host "  -> Tessellation override set"
  Set-ItemProperty -Path $umd -Name "SurfaceFormatOptimization" -Value 1 -Type DWord -ErrorAction SilentlyContinue
  Write-Host "  -> Surface Format Optimization enabled (performance)"
  Set-ItemProperty -Path $umd -Name "AAF" -Value 0 -Type DWord -ErrorAction SilentlyContinue
  Write-Host "  -> Anisotropic Filtering set to Performance"
  Set-ItemProperty -Path $umd -Name "ShaderCacheEnabled" -Value 1 -Type DWord -ErrorAction SilentlyContinue
  Write-Host "  -> Shader Cache enabled"
  Set-ItemProperty -Path $umd -Name "ShaderCacheSize" -Value 0 -Type DWord -ErrorAction SilentlyContinue
  Write-Host "  -> Shader Cache size set to Unlimited"
  Set-ItemProperty -Path $umd -Name "GPUUploadConcurrency" -Value 8 -Type DWord -ErrorAction SilentlyContinue
  Write-Host "  -> GPU Upload Concurrency set to 8"
  $applied++
}
$amdCn = "HKLM:\\SOFTWARE\\AMD\\CN"
if (-not (Test-Path $amdCn)) { New-Item -Path $amdCn -Force | Out-Null }
Set-ItemProperty -Path $amdCn -Name "PowerEfficiency" -Value 0 -Type DWord -ErrorAction SilentlyContinue
Write-Host "  -> Power Efficiency disabled"
Set-ItemProperty -Path $amdCn -Name "FRTC" -Value 0 -Type DWord -ErrorAction SilentlyContinue
Write-Host "  -> Frame Rate Target Control disabled"
if ($applied -gt 0) { Write-Host "AMD tweaks applied: Performance=Max, AntiLag=On, Chill=Off, VSync=Off" }
else { Write-Host "No AMD GPU detected. Ensure AMD drivers are installed." }
`,
    intel: `
Write-Host "=== Intel GPU Tweaks ==="
$intelPath = "HKLM:\\SOFTWARE\\Intel\\Display\\igfxcui"
if (-not (Test-Path $intelPath)) { New-Item -Path $intelPath -Force | Out-Null }
Set-ItemProperty -Path $intelPath -Name "PSR" -Value 0 -Type DWord -ErrorAction SilentlyContinue
Write-Host "  -> Panel Self-Refresh disabled"
Set-ItemProperty -Path $intelPath -Name "DPST" -Value 0 -Type DWord -ErrorAction SilentlyContinue
Write-Host "  -> Display Power Saving Technology disabled"
Set-ItemProperty -Path $intelPath -Name "CdClfEnable" -Value 0 -Type DWord -ErrorAction SilentlyContinue
$intelTray = "HKLM:\\SOFTWARE\\Intel\\Display\\igfxcui\\igfxcui"
if (-not (Test-Path $intelTray)) { New-Item -Path $intelTray -Force | Out-Null }
Set-ItemProperty -Path $intelTray -Name "ShowTray" -Value 0 -Type DWord -ErrorAction SilentlyContinue
Write-Host "  -> System Tray icon disabled"
$intelGlobal = "HKLM:\\SOFTWARE\\Intel\\Display\\igfxcui\\profiles\\global"
if (-not (Test-Path $intelGlobal)) { New-Item -Path $intelGlobal -Force | Out-Null }
Set-ItemProperty -Path $intelGlobal -Name "DeMura" -Value 0 -Type DWord -ErrorAction SilentlyContinue
Write-Host "  -> DeMura (display uniformity) disabled for performance"
Write-Host "  -> Setting power plan to High Performance..."
powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c
Write-Host "  -> Power plan set to High Performance"
$classGuid = "{4d36e968-e325-11ce-bfc1-08002be10318}"
$baseKey = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\$classGuid"
$applied = 0
Get-ChildItem $baseKey -ErrorAction SilentlyContinue | Where-Object {
  $d = (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).DriverDesc
  $d -match "Intel"
} | ForEach-Object {
  $k = $_.PSPath
  Write-Host "Intel GPU found: $((Get-ItemProperty $k).DriverDesc)"
  Set-ItemProperty -Path $k -Name "RMEnableP2P" -Value 1 -Type DWord -ErrorAction SilentlyContinue
  Write-Host "  -> P2P enabled for GPU acceleration"
  $umd = Join-Path $k "UMD"
  if (-not (Test-Path $umd)) { New-Item -Path $umd -Force | Out-Null }
  Set-ItemProperty -Path $umd -Name "EnableMidBufferAllocationForPlayReady" -Value 1 -Type DWord -ErrorAction SilentlyContinue
  Write-Host "  -> Mid-buffer allocation enabled"
  Set-ItemProperty -Path $umd -Name "ShaderCacheEnabled" -Value 1 -Type DWord -ErrorAction SilentlyContinue
  Write-Host "  -> Shader Cache enabled"
  Set-ItemProperty -Path $umd -Name "ShaderCacheSize" -Value 0 -Type DWord -ErrorAction SilentlyContinue
  Write-Host "  -> Shader Cache size set to Unlimited"
  $applied++
}
if ($applied -gt 0) { Write-Host "Intel tweaks applied: PowerSaving=Off, PSR=Off, PowerPlan=HighPerformance" }
else { Write-Host "No Intel GPU detected. Ensure Intel graphics drivers are installed." }
`
  };
  return new Promise((resolve, reject) => {
    const ps = spawn('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-Command', commands[brand]]);
    let output = '';
    const label = brand.toUpperCase() + ' GPU Tweaks';
    ps.stdout.on('data', (data) => {
      const lines = data.toString();
      output += lines;
      if (mainWindow && !mainWindow.isDestroyed()) {
        lines.split('\n').filter(l => l.trim()).forEach(line => {
          mainWindow.webContents.send('pctg:phase-progress', { label, line: line.trim() });
        });
      }
    });
    ps.stderr.on('data', (data) => {
      const lines = data.toString();
      output += lines;
      if (mainWindow && !mainWindow.isDestroyed()) {
        lines.split('\n').filter(l => l.trim()).forEach(line => {
          mainWindow.webContents.send('pctg:phase-progress', { label, line: line.trim() });
        });
      }
    });
    ps.on('close', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(output || `Exit code ${code}`));
    });
    ps.on('error', reject);
  });
}

ipcMain.handle('pctg:run-phase', async (event, phase) => {
  if (!hasAccess(phase)) {
    throw new Error(`Your license does not include "${phase}". Purchase the required tier at ${PAYPAL_URL}`);
  }
  trackEvent('phase', phase);
  const map = {
    'cleanup': 'cleanup.ps1',
    'performance': 'performance.ps1',
    'final': 'final_sweep.ps1',
    'pro': 'pro_mode.ps1',
    'fps': 'fps.ps1',
    'security': 'security.ps1',
    'restore': 'restore.ps1',
    'internet': 'internet.ps1',
    'winfix': 'winfix.ps1',
    'registry': 'registry.ps1',
    'disk': 'disk.ps1',
    'deep': 'deep.ps1',
    'master': 'master.ps1',
    'repair': 'repair.ps1',
    'uninstaller': 'uninstaller.ps1',
    'duplicates': 'duplicates.ps1',
    'contextmenu': 'contextmenu.ps1'
  };
  const gpuPhases = { 'gpu-nvidia': 'nvidia', 'gpu-amd': 'amd', 'gpu-intel': 'intel' };
  const labels = {
    'cleanup': 'Phase 1 — Clean & Clear',
    'performance': 'Phase 2 — Performance Boost',
    'final': 'Phase 3 — Final Sweep',
    'pro': 'PRO Mode',
    'fps': 'Gaming FPS Booster',
    'security': 'Security Hardening',
    'restore': 'Restore Point Creation',
    'internet': 'Internet/WiFi Optimization',
    'winfix': '1‑Click WinFix',
    'registry': 'Registry Optimization',
    'disk': 'Disk Optimization',
    'deep': 'Windows Deep Optimization',
    'master': 'PCTG System Master — Ultimate Repair & Speedup',
    'repair': 'System Test & Repair',
    'uninstaller': 'Software Uninstaller',
    'duplicates': 'Duplicate File Finder',
    'contextmenu': 'Context Menu Manager',
    'gpu-nvidia': 'NVIDIA GPU Tweaks',
    'gpu-amd': 'AMD GPU Tweaks',
    'gpu-intel': 'Intel GPU Tweaks'
  };

  if (gpuPhases[phase]) {
    return runGpuTweaks(gpuPhases[phase]);
  }

  const script = map[phase];
  if (!script) throw new Error('Unknown phase');
  const result = await runPs(script, labels[phase] || phase);

  // Apply custom hardware-specific gaming optimizations for Full/Pro tiers
  if (phase === 'fps' && activeTier === 'pro') {
    try {
      const cached = getCachedAnalysis();
      if (cached && cached.script) {
        const customResult = applyOptimizations(cached.script);
        if (customResult.success) {
          mainWindow.webContents.send('pctg:phase-progress', { label: labels[phase], line: '[PCTG AI] Custom hardware-specific gaming optimizations applied' });
        }
      } else {
        const analysis = await analyzeSystem();
        if (analysis.script) {
          const customResult = applyOptimizations(analysis.script);
          if (customResult.success) {
            mainWindow.webContents.send('pctg:phase-progress', { label: labels[phase], line: '[PCTG AI] System analyzed and custom gaming optimizations applied' });
          }
        }
      }
    } catch (e) {
      mainWindow.webContents.send('pctg:phase-progress', { label: labels[phase], line: '[PCTG AI] Custom tweaks skipped: ' + (e.message || e) });
    }
  }

  return result;
});
