const fs = require('fs');
const path = require('path');

const DB_PATH = '/tmp/pctg-keys-db.json';

const INITIAL_KEYS = {
  'IHAVETHEGAMERSEDGE': { tier: 'pro', created: 0, used: false, boundHwid: null, activatedAt: null },
  'PCTG-8C0C28B9-AAD3EE89-A8FB37E2': { tier: 'standard', created: 1780253957261, used: false, boundHwid: null, activatedAt: null },
  'PCTG-42CE3A09-9895BEAF-9D0BC6F7': { tier: 'standard', created: 1780253957263, used: false, boundHwid: null, activatedAt: null },
  'PCTG-FA42411E-56BE3A5A-C82D6FD4': { tier: 'pro', created: 1780253957373, used: false, boundHwid: null, activatedAt: null },
  'PCTG-E2A7014B-DC8666D7-F83821CE': { tier: 'pro', created: 1780253957375, used: false, boundHwid: null, activatedAt: null },
  'PCTG-CC98C0DC-36AA4E69-8646A227': { tier: 'fps', created: 1780253957485, used: false, boundHwid: null, activatedAt: null },
  'PCTG-6C8256E0-9E3CEB40-8E0D288F': { tier: 'fps', created: 1780253957487, used: false, boundHwid: null, activatedAt: null },
  'PCTG-62AA8365-5CD80BF7-CDE69998': { tier: 'security', created: 1780253957594, used: false, boundHwid: null, activatedAt: null },
  'PCTG-7A3452BD-36662E24-1033EE7C': { tier: 'security', created: 1780253957596, used: false, boundHwid: null, activatedAt: null },
  'PCTG-C273AFA2-5B38AFBB-5CD03C53': { tier: 'internet', created: 1780253957707, used: false, boundHwid: null, activatedAt: null },
  'PCTG-B095B337-CE60DB7E-F7129ECB': { tier: 'internet', created: 1780253957710, used: false, boundHwid: null, activatedAt: null },
  'PCTG-D8156D50-EBA44443-EFD49DBA': { tier: 'winfix', created: 1780253957823, used: false, boundHwid: null, activatedAt: null },
  'PCTG-EE39D076-090DD8D2-91694E1E': { tier: 'winfix', created: 1780253957824, used: false, boundHwid: null, activatedAt: null },
  'PCTG-35BC5049-8C0952D7-8BEBB3C6': { tier: 'deep', created: 1780256251386, used: false, boundHwid: null, activatedAt: null },
  'PCTG-0F10F5C4-8B49826A-B8922DE6': { tier: 'deep', created: 1780256251387, used: false, boundHwid: null, activatedAt: null },
  'PCTG-A1B2C3D4-E5F6G7H8-I9J0K1L2': { tier: 'repair', created: Date.now(), used: false, boundHwid: null, activatedAt: null },
  'PCTG-M2N3O4P5-Q6R7S8T9-U0V1W2X3': { tier: 'repair', created: Date.now(), used: false, boundHwid: null, activatedAt: null }
};

function loadDb() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
      return data;
    }
  } catch {}
  const fresh = { ...INITIAL_KEYS };
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(fresh, null, 2));
  } catch {}
  return fresh;
}

function saveDb(db) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  } catch {}
}

module.exports = (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { key, machineId } = req.body || {};

  if (!key || typeof key !== 'string') {
    return res.status(400).json({ active: false, message: 'No key provided' });
  }
  if (!machineId || typeof machineId !== 'string') {
    return res.status(400).json({ active: false, message: 'No machine ID provided' });
  }

  const trimmed = key.trim();
  const db = loadDb();
  const entry = db[trimmed];

  if (!entry) {
    return res.status(200).json({
      active: false,
      message: 'Invalid license key. Purchase at https://www.paypal.me/pctechguyonline305'
    });
  }

  if (entry.used && entry.boundHwid !== machineId) {
    return res.status(200).json({
      active: false,
      message: 'This license key is already activated on another computer.'
    });
  }

  if (entry.used && entry.boundHwid === machineId) {
    return res.status(200).json({
      active: true,
      tier: entry.tier,
      message: 'License renewed.',
      unlimited: true
    });
  }

  entry.used = true;
  entry.boundHwid = machineId;
  entry.activatedAt = Date.now();
  saveDb(db);

  return res.status(200).json({
    active: true,
    tier: entry.tier,
    message: `Activated ${entry.tier.toUpperCase()} tier!`,
    unlimited: true
  });
};
