const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const keysPath = path.join(__dirname, 'keys.json');
const serverKeysPath = path.join(__dirname, '..', '..', 'api', 'server-keys.json');

const TIERS = {
  basic: { price: 25, unlocks: ['cleanup', 'performance', 'final', 'restore', 'registry', 'disk'] },
  standard: { price: 40, unlocks: ['cleanup', 'performance', 'final', 'restore', 'registry', 'disk', 'fps', 'security'] },
  pro: { price: 55, unlocks: ['cleanup', 'performance', 'final', 'pro', 'fps', 'security', 'internet', 'winfix', 'restore', 'registry', 'disk', 'deep'] },
  repair: { price: 25, unlocks: ['repair', 'restore'] }
};

function generateKey() {
  const seg1 = crypto.randomBytes(4).toString('hex').toUpperCase();
  const seg2 = crypto.randomBytes(4).toString('hex').toUpperCase();
  const seg3 = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `PCTG-${seg1}-${seg2}-${seg3}`;
}

function loadLocalKeys() {
  try { return JSON.parse(fs.readFileSync(keysPath, 'utf-8')); } catch {}
  return { keys: [], used: {} };
}

function saveLocalKeys(keys) {
  fs.writeFileSync(keysPath, JSON.stringify(keys, null, 2));
}

function loadServerKeys() {
  try { return JSON.parse(fs.readFileSync(serverKeysPath, 'utf-8')); } catch {}
  return {};
}

function saveServerKeys(keys) {
  fs.writeFileSync(serverKeysPath, JSON.stringify(keys, null, 2));
}

function generateAndAdd(tier, count = 1) {
  if (!TIERS[tier]) {
    console.error(`Unknown tier '${tier}'. Valid: ${Object.keys(TIERS).join(', ')}`);
    process.exit(1);
  }

  const localData = loadLocalKeys();
  const serverData = loadServerKeys();

  for (let i = 0; i < count; i++) {
    const key = generateKey();
    const created = Date.now();

    localData.keys.push({ key, tier, created, used: false, activatedAt: null });
    serverData[key] = { tier, created, used: false, boundHwid: null, activatedAt: null };

    console.log(`[${tier.toUpperCase()}] £${TIERS[tier].price}  ${key}`);
  }

  saveLocalKeys(localData);
  saveServerKeys(serverData);

  console.log(`\nSaved ${count} ${tier} key(s) to:`);
  console.log(`  - ${keysPath} (local client)`);
  console.log(`  - ${serverKeysPath} (server)`);

  if (!fs.existsSync(serverKeysPath)) {
    console.log(`\nNOTE: Created server-keys.json. Deploy it alongside api/validate.js or`);
    console.log(`      copy its contents into the INITIAL_KEYS object in api/validate.js`);
  }
}

const tier = (process.argv[2] || '').toLowerCase();
const count = parseInt(process.argv[3], 10) || 1;
if (!TIERS[tier]) {
  console.log('Usage: node genkey.js <tier> [count]');
  console.log(`Tiers: ${Object.keys(TIERS).join(', ')}`);
  console.log('Example: node genkey.js pro 5');
  process.exit(1);
}
generateAndAdd(tier, count);
