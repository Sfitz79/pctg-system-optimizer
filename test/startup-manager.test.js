const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createStartupManager, parseRegistryValues } = require('../lib/startup-manager');

function withTempDirectory(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pctg-startup-test-'));
  try {
    run(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('parses Run values with spaces and marks unsupported registry types read-only', () => {
  const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  const entries = parseRegistryValues(
    'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\r\n' +
    '    Cloud Client    REG_EXPAND_SZ    "%ProgramFiles%\\Cloud\\client.exe" /background\r\n' +
    '    Binary Value    REG_BINARY    0102\r\n',
    key
  );

  assert.equal(entries.length, 2);
  assert.equal(entries[0].name, 'Cloud Client');
  assert.equal(entries[0].command, '"%ProgramFiles%\\Cloud\\client.exe" /background');
  assert.equal(entries[0].manageable, true);
  assert.equal(entries[1].manageable, false);
});

test('disables and restores a Startup-folder item without deleting it', () => {
  withTempDirectory(directory => {
    const startupFolder = path.join(directory, 'Startup');
    const userDataPath = path.join(directory, 'user-data');
    fs.mkdirSync(startupFolder);
    const itemPath = path.join(startupFolder, 'Example.lnk');
    fs.writeFileSync(itemPath, 'test shortcut');

    const manager = createStartupManager({
      platform: 'win32',
      userDataPath,
      startupFolders: [startupFolder],
      execFile: () => ''
    });

    const [item] = manager.listStartupApps();
    assert.equal(item.enabled, true);
    assert.deepEqual(manager.setStartupAppEnabled(item.id, false), { success: true, enabled: false });
    assert.equal(fs.existsSync(itemPath), false);
    const [disabled] = manager.listStartupApps();
    assert.equal(disabled.enabled, false);
    assert.equal(disabled.available, true);

    assert.deepEqual(manager.setStartupAppEnabled(item.id, true), { success: true, enabled: true });
    assert.equal(fs.readFileSync(itemPath, 'utf8'), 'test shortcut');
    assert.equal(manager.listStartupApps()[0].enabled, true);
  });
});

test('backs up and restores a supported per-user registry startup value', () => {
  withTempDirectory(directory => {
    const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
    const values = new Map([['Cloud Client', { type: 'REG_SZ', data: '"C:\\Cloud\\client.exe" /background' }]]);
    const execFile = (_executable, args) => {
      if (args[0] === 'query') {
        return [...values.entries()]
          .map(([name, value]) => `    ${name}    ${value.type}    ${value.data}`)
          .join('\r\n');
      }
      if (args[0] === 'delete') {
        if (!values.delete(args[3])) {
          const error = new Error('value not found');
          error.status = 1;
          error.stderr = 'value not found';
          throw error;
        }
        return '';
      }
      if (args[0] === 'add') {
        const name = args[3];
        const type = args[5];
        const data = args[7];
        values.set(name, { type, data });
        return '';
      }
      throw new Error(`Unexpected registry operation: ${args[0]}`);
    };
    const manager = createStartupManager({
      platform: 'win32',
      userDataPath: directory,
      startupFolders: [],
      execFile
    });

    const item = manager.listStartupApps().find(entry => entry.location === key);
    assert.equal(item.name, 'Cloud Client');
    assert.deepEqual(manager.setStartupAppEnabled(item.id, false), { success: true, enabled: false });
    assert.equal(values.has(item.name), false);
    assert.equal(manager.listStartupApps().find(entry => entry.id === item.id).enabled, false);
    assert.deepEqual(manager.setStartupAppEnabled(item.id, true), { success: true, enabled: true });
    assert.deepEqual(values.get(item.name), { type: 'REG_SZ', data: '"C:\\Cloud\\client.exe" /background' });
  });
});

test('rejects an unknown startup item without touching files', () => {
  withTempDirectory(directory => {
    const manager = createStartupManager({
      platform: 'win32',
      userDataPath: directory,
      startupFolders: [],
      execFile: () => ''
    });
    assert.throws(() => manager.setStartupAppEnabled('a'.repeat(64), false), /missing/);
  });
});
