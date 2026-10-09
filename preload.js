const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pctg', {
  runPhase: (phase) => ipcRenderer.invoke('pctg:run-phase', phase),
  checkLicense: () => ipcRenderer.invoke('pctg:check-license'),
  activateLicense: (key) => ipcRenderer.invoke('pctg:activate-license', key),
  checkUpdate: () => ipcRenderer.invoke('pctg:check-update'),
  downloadUpdate: (latest) => ipcRenderer.invoke('pctg:download-update', latest),
  exportPdf: (data) => ipcRenderer.invoke('pctg:export-pdf', data),
  getPurchaseUrl: () => ipcRenderer.invoke('pctg:get-purchase-url'),
  getStats: () => ipcRenderer.invoke('pctg:get-stats'),
  getAnalytics: () => ipcRenderer.invoke('pctg:get-analytics'),
  generateReport: (phases) => ipcRenderer.invoke('pctg:generate-report', phases),
  getTierInfo: () => ipcRenderer.invoke('pctg:get-tier-info'),
  checkPhaseAccess: (phase) => ipcRenderer.invoke('pctg:check-phase-access', phase),
  openUrl: (url) => ipcRenderer.invoke('pctg:open-url', url),
  runToggle: (data) => ipcRenderer.invoke('pctg:run-toggle', data),
  getDiskSpace: () => ipcRenderer.invoke('pctg:get-disk-space'),
  analyzeSystem: () => ipcRenderer.invoke('pctg:analyze-system'),
  getSystemAnalysis: () => ipcRenderer.invoke('pctg:get-system-analysis'),
  applyCustomTweaks: (script) => ipcRenderer.invoke('pctg:apply-custom-tweaks', script),

  // generateKey / paypalCreateOrder / paypalCaptureOrder are GONE.
  // generateKey accepted any 8+ character string as a "PayPal receipt" and issued a
  // working licence without verifying payment. The PayPal pair needed a live secret
  // embedded in a customer-downloadable binary and minted keys the server never issued.
  // Purchase is now handled by pctg:begin-purchase, which hands off to the website
  // checkout where PayPal credentials stay server-side and keys are written to Postgres.
  beginPurchase: (data) => ipcRenderer.invoke('pctg:begin-purchase', data),

  onPhaseProgress: (callback) => {
    ipcRenderer.on('pctg:phase-progress', (_event, data) => callback(data));
  }
});
