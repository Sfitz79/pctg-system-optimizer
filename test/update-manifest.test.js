const test = require('node:test');
const assert = require('node:assert/strict');
const { isVersionNewer, isTrustedInstallerUrl, parseGitHubRelease } = require('../lib/updateManifest');

test('update comparison uses semantic numeric order and rejects downgrades', () => {
  assert.equal(isVersionNewer('1.10.0', '1.9.9'), true);
  assert.equal(isVersionNewer('1.4.0', '1.4.0'), false);
  assert.equal(isVersionNewer('1.3.9', '1.4.0'), false);
  assert.equal(isVersionNewer('latest', '1.4.0'), false);
});

test('only the fixed HTTPS release installer URL is accepted', () => {
  assert.equal(isTrustedInstallerUrl('https://github.com/Sfitz79/pctg-system-optimizer/releases/download/v1.4.0/PCTG-Optimizer-Setup.exe'), true);
  assert.equal(isTrustedInstallerUrl('http://github.com/Sfitz79/pctg-system-optimizer/releases/download/v1.4.0/PCTG-Optimizer-Setup.exe'), false);
  assert.equal(isTrustedInstallerUrl('https://example.com/setup.exe'), false);
  assert.equal(isTrustedInstallerUrl('https://github.com.evil.example/Sfitz79/pctg-system-optimizer/releases/download/v1.4.0/PCTG-Optimizer-Setup.exe'), false);
});

test('latest GitHub release selects only the expected installer and validates its size', () => {
  const release = parseGitHubRelease({
    tag_name: 'v1.5.0',
    body: 'Release notes',
    assets: [{
      name: 'PCTG-Optimizer-Setup.exe',
      size: 120000000,
      browser_download_url: 'https://github.com/Sfitz79/pctg-system-optimizer/releases/download/v1.5.0/PCTG-Optimizer-Setup.exe'
    }]
  });
  assert.equal(release.version, '1.5.0');
  assert.equal(release.url.endsWith('/PCTG-Optimizer-Setup.exe'), true);
  assert.throws(() => parseGitHubRelease({ tag_name: 'v1.5.0', assets: [] }));
});
