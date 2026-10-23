const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REGISTRY_RUN_KEYS = [
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
  'HKCU\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Run',
  'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
  'HKLM\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Run'
];
const REGISTRY_TYPES = new Set(['REG_SZ', 'REG_EXPAND_SZ']);

function startupId(kind, location, name) {
  return crypto.createHash('sha256')
    .update(`${kind}\0${location.toLowerCase()}\0${name.toLowerCase()}`)
    .digest('hex');
}

function parseRegistryValues(output, key) {
  return output.split(/\r?\n/)
    .map(line => line.match(/^\s+(.+?)\s+(REG_[A-Z0-9_]+)\s+(.*)$/))
    .filter(Boolean)
    .map(([, name, type, data]) => ({
      id: startupId('registry', key, name),
      kind: 'registry',
      name,
      location: key,
      type,
      command: data.trim(),
      manageable: REGISTRY_TYPES.has(type),
      enabled: true
    }));
}

function createStartupManager({
  platform = process.platform,
  userDataPath,
  startupFolders = [
    process.env.APPDATA && path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'),
    process.env.PROGRAMDATA && path.join(process.env.PROGRAMDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
  ].filter(Boolean),
  execFile = execFileSync,
  fileSystem = fs
}) {
  const disabledPath = path.join(userDataPath, 'startup-disabled.json');
  const disabledFilesPath = path.join(userDataPath, 'startup-disabled-files');

  function assertSupportedPlatform() {
    if (platform !== 'win32') throw new Error('Startup Apps manager is available on Windows only.');
  }

  function runReg(args) {
    try {
      return execFile('reg.exe', args, { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    } catch (error) {
      if (error.status === 1 && /unable to find|not found/i.test(String(error.stderr || error.message))) return '';
      throw new Error(`Could not read or update Windows startup settings: ${String(error.stderr || error.message).trim()}`);
    }
  }

  function readDisabled() {
    try {
      const data = JSON.parse(fileSystem.readFileSync(disabledPath, 'utf8'));
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid startup backup data.');
      return data;
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw new Error(`Could not read saved startup-item backups: ${error.message}`);
    }
  }

  function writeDisabled(data) {
    fileSystem.mkdirSync(path.dirname(disabledPath), { recursive: true });
    const temporaryPath = `${disabledPath}.tmp`;
    fileSystem.writeFileSync(temporaryPath, JSON.stringify(data, null, 2), 'utf8');
    fileSystem.renameSync(temporaryPath, disabledPath);
  }

  function getStartupFolderItems() {
    const items = [];
    for (const folder of startupFolders) {
      if (!fileSystem.existsSync(folder)) continue;
      for (const entry of fileSystem.readdirSync(folder, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const source = path.join(folder, entry.name);
        items.push({
          id: startupId('folder', source, entry.name),
          kind: 'folder',
          name: entry.name,
          location: source,
          command: source,
          manageable: true,
          enabled: true
        });
      }
    }
    return items;
  }

  function listStartupApps() {
    assertSupportedPlatform();
    const disabled = readDisabled();
    const active = [];
    for (const key of REGISTRY_RUN_KEYS) {
      active.push(...parseRegistryValues(runReg(['query', key]), key));
    }
    active.push(...getStartupFolderItems());

    const byId = new Map(active.map(item => [item.id, item]));
    for (const [id, backup] of Object.entries(disabled)) {
      if (backup.kind === 'registry') {
        if (byId.has(id)) continue;
        byId.set(id, {
          id,
          kind: 'registry',
          name: backup.name,
          location: backup.location,
          type: backup.type,
          command: backup.command,
          manageable: true,
          enabled: false,
          available: true
        });
      } else if (backup.kind === 'folder') {
        if (byId.has(id) && !fileSystem.existsSync(backup.disabledPath)) continue;
        byId.set(id, {
          id,
          kind: 'folder',
          name: backup.name,
          location: backup.originalPath,
          command: backup.originalPath,
          manageable: true,
          enabled: false,
          available: fileSystem.existsSync(backup.disabledPath)
        });
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  function setStartupAppEnabled(id, enabled) {
    assertSupportedPlatform();
    if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id) || typeof enabled !== 'boolean') {
      throw new Error('Invalid startup-item selection.');
    }
    const backups = readDisabled();
    const backup = backups[id];

    if (enabled) {
      if (!backup) throw new Error('This startup item is not disabled by PCTG Optimizer.');
      if (backup.kind === 'registry') {
        if (!REGISTRY_RUN_KEYS.includes(backup.location) || !REGISTRY_TYPES.has(backup.type) ||
            typeof backup.name !== 'string' || backup.name.length > 1024 ||
            typeof backup.command !== 'string' || backup.command.length > 8192 ||
            startupId('registry', backup.location, backup.name) !== id) {
          throw new Error('The saved registry backup is invalid and cannot be restored.');
        }
        const existing = parseRegistryValues(runReg(['query', backup.location]), backup.location);
        if (existing.some(item => item.name.toLowerCase() === backup.name.toLowerCase())) {
          throw new Error(`A startup value named "${backup.name}" already exists. It was not overwritten.`);
        }
        runReg(['add', backup.location, '/v', backup.name, '/t', backup.type, '/d', backup.command, '/f']);
      } else if (backup.kind === 'folder') {
        if (typeof backup.originalPath !== 'string' || typeof backup.disabledPath !== 'string' ||
            typeof backup.name !== 'string' || path.basename(backup.originalPath) !== backup.name ||
            startupId('folder', backup.originalPath, backup.name) !== id) {
          throw new Error('The saved Startup-folder backup is invalid and cannot be restored.');
        }
        const allowedFolder = startupFolders.some(folder => {
          const relative = path.relative(path.resolve(folder), path.resolve(backup.originalPath));
          return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
        });
        const relativeDisabled = path.relative(path.resolve(disabledFilesPath), path.resolve(backup.disabledPath));
        if (!allowedFolder || !relativeDisabled || relativeDisabled.startsWith('..') || path.isAbsolute(relativeDisabled)) {
          throw new Error('The saved startup-folder backup is outside the managed folders and cannot be restored.');
        }
        if (!fileSystem.existsSync(backup.disabledPath)) throw new Error(`The saved startup item is missing: ${backup.name}`);
        if (fileSystem.existsSync(backup.originalPath)) throw new Error(`A file already exists at "${backup.originalPath}". It was not overwritten.`);
        fileSystem.mkdirSync(path.dirname(backup.originalPath), { recursive: true });
        fileSystem.renameSync(backup.disabledPath, backup.originalPath);
      } else {
        throw new Error('The saved startup backup has an unsupported type.');
      }
      delete backups[id];
      writeDisabled(backups);
      return { success: true, enabled: true };
    }

    if (backup) {
      const active = listStartupApps().some(item => item.id === id && item.enabled);
      if (!active) return { success: true, enabled: false };
      delete backups[id];
      writeDisabled(backups);
    }
    const item = listStartupApps().find(candidate => candidate.id === id);
    if (!item || !item.enabled || !item.manageable) {
      throw new Error('The selected startup item is missing, already disabled, or cannot be safely managed.');
    }

    if (item.kind === 'registry') {
      if (!REGISTRY_RUN_KEYS.includes(item.location) || !REGISTRY_TYPES.has(item.type)) {
        throw new Error('This registry startup value uses an unsupported type and was not changed.');
      }
      const record = {
        kind: 'registry',
        name: item.name,
        location: item.location,
        type: item.type,
        command: item.command
      };
      backups[id] = record;
      writeDisabled(backups);
      try {
        runReg(['delete', item.location, '/v', item.name, '/f']);
      } catch (error) {
        delete backups[id];
        writeDisabled(backups);
        throw error;
      }
    } else {
      const originalPath = path.resolve(item.location);
      const allowedFolder = startupFolders.some(folder => {
        const relative = path.relative(path.resolve(folder), originalPath);
        return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
      });
      if (!allowedFolder || !fileSystem.statSync(originalPath).isFile()) {
        throw new Error('The selected file is outside the Windows Startup folders and was not changed.');
      }
      const disabledPath = path.join(disabledFilesPath, id, path.basename(originalPath));
      const record = { kind: 'folder', name: item.name, originalPath, disabledPath };
      fileSystem.mkdirSync(path.dirname(disabledPath), { recursive: true });
      fileSystem.renameSync(originalPath, disabledPath);
      backups[id] = record;
      try {
        writeDisabled(backups);
      } catch (error) {
        fileSystem.renameSync(disabledPath, originalPath);
        throw error;
      }
    }

    return { success: true, enabled: false };
  }

  return { listStartupApps, setStartupAppEnabled };
}

module.exports = { createStartupManager, parseRegistryValues };
