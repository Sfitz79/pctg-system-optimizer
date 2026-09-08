const os = require('os');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const userDataPath = path.join(os.homedir(), 'AppData', 'Local', 'PCTG-Optimizer');
const cachePath = path.join(userDataPath, 'system-analysis.json');

function getDetailedSpecs() {
  const specs = {
    cpu: { model: os.cpus()[0]?.model || 'Unknown', cores: os.cpus().length, speed: os.cpus()[0]?.speed || 0 },
    ram: { totalGB: Math.round(os.totalmem() / 1073741824), freeGB: Math.round(os.freemem() / 1073741824) },
    os: { platform: os.platform(), release: os.release(), build: os.version() },
    gpu: { model: 'Unknown', vram: 'Unknown' },
    motherboard: 'Unknown',
    storage: []
  };

  try {
    const gpuInfo = execSync(
      'powershell -Command "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json"',
      { encoding: 'utf-8', timeout: 8000 }
    );
    const gpus = JSON.parse(gpuInfo.trim());
    const gpuList = Array.isArray(gpus) ? gpus : [gpus];
    if (gpuList.length > 0) {
      specs.gpu.model = gpuList[0].Name || 'Unknown';
      specs.gpu.vram = gpuList[0].AdapterRAM ? Math.round(gpuList[0].AdapterRAM / 1073741824) + ' GB' : 'Unknown';
    }
  } catch {}

  try {
    const mbInfo = execSync(
      'powershell -Command "Get-CimInstance Win32_BaseBoard | Select-Object Manufacturer,Product | ConvertTo-Json"',
      { encoding: 'utf-8', timeout: 5000 }
    );
    const mb = JSON.parse(mbInfo.trim());
    specs.motherboard = ((mb.Manufacturer || '') + ' ' + (mb.Product || '')).trim() || 'Unknown';
  } catch {}

  try {
    const diskInfo = execSync(
      'powershell -Command "Get-CimInstance Win32_DiskDrive | Select-Object Model,Size,MediaType | ConvertTo-Json"',
      { encoding: 'utf-8', timeout: 5000 }
    );
    const disks = JSON.parse(diskInfo.trim());
    const diskList = Array.isArray(disks) ? disks : [disks];
    specs.storage = diskList.map(d => ({
      model: d.Model || 'Unknown',
      sizeGB: d.Size ? Math.round(d.Size / 1073741824) : 0,
      type: d.MediaType || 'Unknown'
    }));
  } catch {}

  return specs;
}

function generateOptimizationQuery(specs) {
  const cpuBrand = specs.cpu.model.includes('Intel') ? 'Intel' :
                   specs.cpu.model.includes('AMD') || specs.cpu.model.includes('Ryzen') ? 'AMD' : 'unknown';
  const gpuBrand = specs.gpu.model.includes('NVIDIA') || specs.gpu.model.includes('GeForce') ? 'NVIDIA' :
                   specs.gpu.model.includes('AMD') || specs.gpu.model.includes('Radeon') ? 'AMD' :
                   specs.gpu.model.includes('Intel') ? 'Intel' : 'unknown';

  return `best Windows 10 11 gaming optimizations registry tweaks for ${cpuBrand} ${specs.cpu.model} ${specs.cpu.cores} core ${gpuBrand} ${specs.gpu.model} ${specs.ram.totalGB}GB RAM performance boost fps low latency 2024 2025`;
}

const HARDWARE_OPTIMIZATIONS = {
  intel: {
    cpu: [
      { name: 'Intel Turbo Boost Max', cmd: 'Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerSettings\\2a737441-1930-4402-8d77-b2bebba308a3\\be337238-0d82-4146-a96d-4852001d28c4" -Name "Attributes" -Value 2 -Type DWord', desc: 'Enable Turbo Boost Max 3.0' },
      { name: 'Intel C-States Disable', cmd: 'Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerSettings\\54533251-82be-4824-96c1-47b60b740d00\\5d76a2ca-e8c0-402f-a133-2158492d58ad" -Name "Attributes" -Value 2 -Type DWord', desc: 'Disable Intel C-States for consistent performance' }
    ]
  },
  amd: {
    cpu: [
      { name: 'AMD CPPC Preferred Cores', cmd: 'Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerSettings\\54533251-82be-4824-96c1-47b60b740d00\\bc5038f7-5f70-4b72-9859-8e7826bfb90f" -Name "Attributes" -Value 2 -Type DWord', desc: 'Enable AMD CPPC Preferred Cores' },
      { name: 'AMD Power Plan Performance', cmd: 'powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c', desc: 'Set High Performance power plan' }
    ]
  },
  nvidia: {
    gpu: [
      { name: 'NVIDIA Power Management', cmd: 'Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000" -Name "PerfLevelSrc" -Value 0x2222 -Type DWord -ErrorAction SilentlyContinue; Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000" -Name "PowerMizerEnable" -Value 1 -Type DWord -ErrorAction SilentlyContinue; Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000" -Name "PowerMizerLevel" -Value 1 -Type DWord -ErrorAction SilentlyContinue', desc: 'NVIDIA Maximum Performance mode' },
      { name: 'NVIDIA Preemption Disable', cmd: '$umd = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000\\UMD"; if(-not(Test-Path $umd)){New-Item -Path $umd -Force|Out-Null}; Set-ItemProperty -Path $umd -Name "EnableMidGfxPreemptionVGPU" -Value 0 -Type DWord -ErrorAction SilentlyContinue; Set-ItemProperty -Path $umd -Name "EnableMidGfxPreemption" -Value 0 -Type DWord -ErrorAction SilentlyContinue; Set-ItemProperty -Path $umd -Name "EnableSCGPreemption" -Value 0 -Type DWord -ErrorAction SilentlyContinue', desc: 'Disable NVIDIA preemption for lower latency' }
    ]
  },
  amd_gpu: {
    gpu: [
      { name: 'AMD GPU Shader Cache', cmd: 'Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000\\UMD" -Name "ShaderCacheSize" -Value 1 -Type DWord -ErrorAction SilentlyContinue', desc: 'Enable AMD shader cache' }
    ]
  },
  general: {
    gaming: [
      { name: 'Game Mode Enable', cmd: 'Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\GameBar" -Name "AllowAutoGameMode" -Value 1 -Type DWord; Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\GameBar" -Name "AutoGameModeEnabled" -Value 1 -Type DWord', desc: 'Enable Windows Game Mode' },
      { name: 'Game DVR Disable', cmd: 'Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR" -Name "AppCaptureEnabled" -Value 0 -Type DWord; Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR" -Name "AllowGameDVR" -Value 0 -Type DWord -ErrorAction SilentlyContinue', desc: 'Disable Game DVR for performance' },
      { name: 'Hardware GPU Schedule', cmd: 'Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" -Name "HwSchMode" -Value 2 -Type DWord -ErrorAction SilentlyContinue', desc: 'Enable Hardware Accelerated GPU Scheduling' },
      { name: 'Timer Resolution', cmd: 'bcdedit /set disabledynamictick yes; bcdedit /set useplatformtick yes', desc: 'Set high-resolution timer for gaming' },
      { name: 'Network Throttling Disable', cmd: 'Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" -Name "NetworkThrottlingIndex" -Value 0xffffffff -Type DWord', desc: 'Disable network throttling' },
      { name: 'System Responsiveness', cmd: 'Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" -Name "SystemResponsiveness" -Value 0 -Type DWord', desc: 'Minimize system reserved CPU for multimedia' },
      { name: 'GPU Priority', cmd: 'Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" -Name "GPU Priority" -Value 8 -Type DWord -ErrorAction SilentlyContinue; New-Item -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" -Force -ErrorAction SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" -Name "Priority" -Value 6 -Type DWord -ErrorAction SilentlyContinue; Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" -Name "Scheduling Category" -Value "High" -Type String -ErrorAction SilentlyContinue', desc: 'Optimize GPU priority for games' },
      { name: 'Visual Effects Performance', cmd: 'Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects" -Name "VisualFXSetting" -Value 2 -Type DWord', desc: 'Optimize visual effects for performance' },
      { name: 'Power Plan High Performance', cmd: 'powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c', desc: 'Set High Performance power plan' },
      { name: 'Core Isolation Memory Integrity', cmd: 'Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity" -Name "Enabled" -Value 0 -Type DWord -ErrorAction SilentlyContinue', desc: 'Disable Core Isolation for gaming performance' }
    ]
  }
};

function buildOptimizationScript(specs) {
  const cmds = [];
  const cpuLower = specs.cpu.model.toLowerCase();
  const gpuLower = specs.gpu.model.toLowerCase();

  // CPU-specific
  if (cpuLower.includes('intel')) {
    HARDWARE_OPTIMIZATIONS.intel.cpu.forEach(o => cmds.push(o));
  } else if (cpuLower.includes('amd') || cpuLower.includes('ryzen')) {
    HARDWARE_OPTIMIZATIONS.amd.cpu.forEach(o => cmds.push(o));
  }

  // GPU-specific
  if (gpuLower.includes('nvidia') || gpuLower.includes('geforce')) {
    HARDWARE_OPTIMIZATIONS.nvidia.gpu.forEach(o => cmds.push(o));
  } else if (gpuLower.includes('amd') || gpuLower.includes('radeon')) {
    HARDWARE_OPTIMIZATIONS.amd_gpu.gpu.forEach(o => cmds.push(o));
  }

  // General gaming optimizations
  HARDWARE_OPTIMIZATIONS.general.gaming.forEach(o => cmds.push(o));

  // RAM-specific tweaks
  if (specs.ram.totalGB <= 8) {
    cmds.push({
      name: 'Low RAM Optimization',
      cmd: '$sys = "HKLM:\\SYSTEM\\CurrentControlSet\\Control"; Set-ItemProperty -Path "$sys\\Session Manager\\Memory Management" -Name "LargeSystemCache" -Value 0 -Type DWord; Set-ItemProperty -Path "$sys\\Session Manager\\Memory Management" -Name "DisablePagingExecutive" -Value 1 -Type DWord',
      desc: 'Optimize memory management for ' + specs.ram.totalGB + 'GB RAM'
    });
  }

  return cmds;
}

function generatePowerShellScript(commands) {
  let script = '# PCTG Custom Gaming Optimizations\n';
  script += '# Auto-generated for: ' + os.hostname() + '\n';
  script += '# ' + new Date().toISOString() + '\n\n';
  script += 'Write-Host "=== PCTG Custom Gaming Optimizations ===" -ForegroundColor Red\n';
  script += 'Write-Host "Applying hardware-specific optimizations..."\n\n';

  commands.forEach((cmd, i) => {
    script += `Write-Host "[${i + 1}/${commands.length}] ${cmd.name}..."\n`;
    script += `# ${cmd.desc}\n`;
    script += `try { ${cmd.cmd} } catch { Write-Host "  Warning: $($_.Exception.Message)" -ForegroundColor Yellow }\n`;
    script += 'Write-Host "  Done" -ForegroundColor Green\n\n';
  });

  script += 'Write-Host "\n=== All custom optimizations applied ===" -ForegroundColor Green\n';
  return script;
}

async function searchWebForOptimizations(query) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve([]), 8000);
    try {
      const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=5`;
      https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PCTG-Optimizer' } }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          clearTimeout(timeout);
          const tips = [];
          const registryPattern = /reg\s+(add|delete)\s+["']?HK/gi;
          const powerCfgPattern = /powercfg\s+/gi;
          const bcdeditPattern = /bcdedit\s+/gi;
          if (registryPattern.test(data)) tips.push({ type: 'registry', source: 'web' });
          if (powerCfgPattern.test(data)) tips.push({ type: 'powercfg', source: 'web' });
          if (bcdeditPattern.test(data)) tips.push({ type: 'bcdedit', source: 'web' });
          resolve(tips);
        });
      }).on('error', () => { clearTimeout(timeout); resolve([]); });
    } catch { clearTimeout(timeout); resolve([]); }
  });
}

async function analyzeSystem() {
  const specs = getDetailedSpecs();
  const query = generateOptimizationQuery(specs);
  const webTips = await searchWebForOptimizations(query);
  const commands = buildOptimizationScript(specs);
  const script = generatePowerShellScript(commands);

  const result = {
    specs,
    query,
    webTipsFound: webTips.length,
    commandsCount: commands.length,
    commands: commands.map(c => ({ name: c.name, desc: c.desc })),
    script,
    analyzedAt: Date.now()
  };

  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(result, null, 2));
  } catch {}

  return result;
}

function applyOptimizations(script) {
  const scriptPath = path.join(userDataPath, 'custom-gaming-tweaks.ps1');
  try {
    fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
    fs.writeFileSync(scriptPath, script, 'utf-8');
    const output = execSync(
      `powershell -ExecutionPolicy Bypass -File "${scriptPath}"`,
      { encoding: 'utf-8', timeout: 60000, windowsHide: true }
    );
    return { success: true, output };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function getCachedAnalysis() {
  try {
    if (fs.existsSync(cachePath)) {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      const oneDay = 24 * 60 * 60 * 1000;
      if (Date.now() - data.analyzedAt < oneDay) return data;
    }
  } catch {}
  return null;
}

module.exports = { analyzeSystem, applyOptimizations, getCachedAnalysis, getDetailedSpecs };
