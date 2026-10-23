const TOOLS = Object.freeze({
  intelXtU: {
    id: 'intel-xtu',
    label: 'Intel Extreme Tuning Utility (XTU)',
    kind: 'cpu',
    compatibility: 'Intel XTU is limited to supported unlocked processors. Check Intel’s compatibility list before installing or changing settings.',
    guidance: 'For a supported unlocked CPU only, keep the stock profile available, change one setting at a time and monitor temperatures and stability. Do not copy settings from a different processor.',
    url: 'https://www.intel.com/content/www/us/en/download/17881/intel-extreme-tuning-utility-intel-xtu.html',
    startApp: /intel.*extreme tuning utility|^intel xtu$/i
  },
  ryzenMaster: {
    id: 'amd-ryzen-master',
    label: 'AMD Ryzen Master',
    kind: 'cpu',
    compatibility: 'Ryzen Master support is model-specific. Confirm your exact processor and Windows version on AMD’s official page.',
    guidance: 'Confirm the exact CPU/APU is supported, retain the default profile and use the utility’s own monitoring and stability checks for any user-directed change.',
    url: 'https://www.amd.com/en/products/software/ryzen-master.html',
    startApp: /amd ryzen master|^ryzen master$/i
  },
  intelGraphics: {
    id: 'intel-graphics',
    label: 'Intel Graphics Software',
    kind: 'gpu',
    compatibility: 'Available controls depend on the Intel GPU and driver. Review the hardware support information before changing graphics settings.',
    guidance: 'For supported Arc graphics, review the available per-game graphics controls and performance monitoring. Start from defaults and benchmark one change at a time.',
    url: 'https://www.intel.com/content/www/us/en/products/details/discrete-gpus/arc/software/graphics-software.html',
    startApp: /^intel graphics software$|^intel arc control$/i
  },
  amdAdrenalin: {
    id: 'amd-adrenalin',
    label: 'AMD Software: Adrenalin Edition',
    kind: 'gpu',
    compatibility: 'Features depend on the exact Radeon GPU and driver. Use AMD’s official support and compatibility information.',
    guidance: 'Use only controls shown for the detected Radeon model; prefer per-game settings, keep the default profile available and measure results after each manual change.',
    url: 'https://www.amd.com/en/products/software/adrenalin.html',
    startApp: /^amd software$|^amd software: adrenalin edition$|^radeon settings$/i
  },
  nvidiaApp: {
    id: 'nvidia-app',
    label: 'NVIDIA App',
    kind: 'gpu',
    compatibility: 'NVIDIA App features depend on the GPU and driver version. Check NVIDIA’s official FAQ for current support.',
    guidance: 'Review the app’s driver and per-game graphics options for this GPU. Treat any performance-tuning option as opt-in and compare measured results before keeping it.',
    url: 'https://www.nvidia.com/en-us/software/nvidia-app/faq/',
    startApp: /^nvidia app$/i
  },
  afterburner: {
    id: 'msi-afterburner',
    label: 'MSI Afterburner (optional)',
    kind: 'gpu',
    compatibility: 'Optional MSI software, not an NVIDIA utility. Check MSI’s support information for your graphics card; tuning remains manual.',
    guidance: 'Optional third-party monitoring/tuning only. Avoid importing another card’s profile; keep changes manual and reversible.',
    url: 'https://www.msi.com/Landing/afterburner/graphics-cards',
    startApp: /^msi afterburner$/i
  },
  presentMon: {
    id: 'intel-presentmon',
    label: 'Intel PresentMon',
    kind: 'telemetry',
    compatibility: 'Optional Windows performance telemetry and frame-time analysis. It measures performance; it does not tune hardware.',
    guidance: 'Use frame-time and performance measurements to compare a repeatable workload before and after a user-selected change.',
    url: 'https://github.com/GameTechDev/PresentMon',
    startApp: /^presentmon$/i
  }
});

function classifyCpu(model) {
  const value = String(model || '').toLowerCase();
  if (/\b(intel|core\s+ultra|xeon)\b/.test(value)) return 'intel';
  if (/\b(amd|ryzen|threadripper)\b/.test(value)) return 'amd';
  return 'unknown';
}

function classifyGpu(model) {
  const value = String(model || '').toLowerCase();
  if (/\b(nvidia|geforce|quadro)\b/.test(value)) return 'nvidia';
  if (/\b(amd|radeon|rx\s?\d)\b/.test(value)) return 'amd';
  if (/\b(intel|arc|iris|uhd graphics)\b/.test(value)) return 'intel';
  return 'unknown';
}

function getHardwareTuningTools(specs) {
  const cpuVendor = classifyCpu(specs && specs.cpu && specs.cpu.model);
  const gpuVendor = classifyGpu(specs && specs.gpu && specs.gpu.model);
  const gpuModel = String(specs && specs.gpu && specs.gpu.model || '');
  const tools = [];

  if (cpuVendor === 'intel') tools.push(TOOLS.intelXtU);
  if (cpuVendor === 'amd') tools.push(TOOLS.ryzenMaster);
  if (gpuVendor === 'intel' && /\barc\b/i.test(gpuModel)) tools.push(TOOLS.intelGraphics);
  if (gpuVendor === 'amd') tools.push(TOOLS.amdAdrenalin);
  if (gpuVendor === 'nvidia') tools.push(TOOLS.nvidiaApp);
  if (gpuVendor !== 'unknown') tools.push(TOOLS.afterburner);
  if (cpuVendor !== 'unknown' || gpuVendor !== 'unknown') tools.push(TOOLS.presentMon);

  return {
    cpuVendor,
    gpuVendor,
    tools: tools.map(({ startApp, ...tool }) => ({ ...tool }))
  };
}

function isSafeAppId(appId) {
  return typeof appId === 'string' &&
    appId.length <= 512 &&
    /^[A-Za-z0-9_.!{}\\ -]+$/.test(appId) &&
    !appId.split('\\').some(part => part === '.' || part === '..');
}

function findInstalledToolApp(apps, toolId) {
  const tool = Object.values(TOOLS).find(candidate => candidate.id === toolId);
  if (!tool || !Array.isArray(apps)) return null;
  return apps.find(app => typeof app.name === 'string' && tool.startApp.test(app.name) &&
    isSafeAppId(app.appId)) || null;
}

module.exports = { classifyCpu, classifyGpu, getHardwareTuningTools, findInstalledToolApp, isSafeAppId };
