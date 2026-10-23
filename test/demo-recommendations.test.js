const test = require('node:test');
const assert = require('node:assert/strict');
const { getDemoRecommendations } = require('../lib/demoRecommendations');

test('demo recommendations adapt to detected memory and GPU data', () => {
  const recommendations = getDemoRecommendations({
    cpu: { cores: 4 },
    ram: { totalGB: 8 },
    gpu: { model: 'NVIDIA GeForce RTX 4070' },
    storage: [{ model: 'NVMe SSD' }]
  });

  assert.ok(recommendations.some(item => item.includes('RAM upgrade')));
  assert.ok(recommendations.some(item => item.includes('four or fewer logical cores')));
  assert.ok(recommendations.some(item => item.includes('RTX 4070')));
  assert.ok(recommendations.at(-1).includes('no settings'));
});

test('demo recommendations handle missing hardware details without assuming upgrades', () => {
  const recommendations = getDemoRecommendations({
    cpu: { cores: 0 },
    ram: { totalGB: 0 },
    gpu: { model: 'Unknown' },
    storage: []
  });

  assert.ok(recommendations.some(item => item.includes('could not be identified')));
  assert.ok(recommendations.some(item => item.includes('Storage details were unavailable')));
  assert.ok(recommendations.at(-1).includes('no settings'));
});
