const assert = require('node:assert/strict');
const test = require('node:test');
const {
  classifyCpu,
  classifyGpu,
  getHardwareTuningTools,
  findInstalledToolApp
} = require('../lib/hardware-tuning');

test('matches Intel CPU and NVIDIA GPU utilities only to detected vendors', () => {
  const result = getHardwareTuningTools({
    cpu: { model: '13th Gen Intel(R) Core(TM) i7-13700K' },
    gpu: { model: 'NVIDIA GeForce RTX 4070' }
  });

  assert.equal(result.cpuVendor, 'intel');
  assert.equal(result.gpuVendor, 'nvidia');
  assert.deepEqual(result.tools.map(tool => tool.id), [
    'intel-xtu',
    'nvidia-app',
    'msi-afterburner',
    'intel-presentmon'
  ]);
  assert.match(result.tools[0].compatibility, /unlocked processors/i);
});

test('matches an AMD APU family to Ryzen Master and Radeon software', () => {
  const result = getHardwareTuningTools({
    cpu: { model: 'AMD Ryzen 7 8700G with Radeon Graphics' },
    gpu: { model: 'AMD Radeon 780M Graphics' }
  });

  assert.equal(result.cpuVendor, 'amd');
  assert.equal(result.gpuVendor, 'amd');
  assert.deepEqual(result.tools.map(tool => tool.id), [
    'amd-ryzen-master',
    'amd-adrenalin',
    'msi-afterburner',
    'intel-presentmon'
  ]);
});

test('only offers Intel Graphics Software for identified Arc graphics', () => {
  const arc = getHardwareTuningTools({
    cpu: { model: 'Intel Core Ultra 7' },
    gpu: { model: 'Intel Arc B580' }
  });
  assert.ok(arc.tools.some(tool => tool.id === 'intel-graphics'));

  const integrated = getHardwareTuningTools({
    cpu: { model: 'Intel Core i7-13700' },
    gpu: { model: 'Intel UHD Graphics 770' }
  });
  assert.equal(integrated.tools.some(tool => tool.id === 'intel-graphics'), false);
});

test('unknown hardware receives no vendor tuning recommendation', () => {
  assert.equal(classifyCpu('Unknown CPU'), 'unknown');
  assert.equal(classifyGpu('Microsoft Basic Display Adapter'), 'unknown');
  assert.deepEqual(getHardwareTuningTools({
    cpu: { model: 'Unknown CPU' },
    gpu: { model: 'Microsoft Basic Display Adapter' }
  }), { cpuVendor: 'unknown', gpuVendor: 'unknown', tools: [] });
});

test('installed utility matching rejects untrusted app identifiers', () => {
  const apps = [
    { name: 'NVIDIA App', appId: 'NVIDIA.NVIDIAApp_8wekyb3d8bbwe!NVIDIA' },
    { name: 'MSI Afterburner', appId: '{7C5A40EF-A0FB-4BFC-874A-C0F2E0B9FA8E}\\MSI Afterburner\\MSIAfterburner.exe' },
    { name: 'NVIDIA App', appId: 'bad;Start-Process-payload' },
    { name: 'NVIDIA App', appId: 'folder\\..\\payload' }
  ];
  assert.equal(
    findInstalledToolApp(apps, 'msi-afterburner').appId,
    '{7C5A40EF-A0FB-4BFC-874A-C0F2E0B9FA8E}\\MSI Afterburner\\MSIAfterburner.exe'
  );
  assert.equal(findInstalledToolApp([{ name: 'NVIDIA App', appId: 'bad;payload' }], 'nvidia-app'), null);
  assert.equal(findInstalledToolApp(apps, 'unknown-tool'), null);
});
