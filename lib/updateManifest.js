function isVersionNewer(candidate, current) {
  const candidateParts = String(candidate).split('.').map(Number);
  const currentParts = String(current).split('.').map(Number);
  if (candidateParts.length !== 3 || currentParts.length !== 3 || [...candidateParts, ...currentParts].some(Number.isNaN)) return false;
  for (let index = 0; index < 3; index++) {
    if (candidateParts[index] !== currentParts[index]) return candidateParts[index] > currentParts[index];
  }
  return false;
}

function isTrustedInstallerUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'github.com'
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
      && /^\/Sfitz79\/pctg-system-optimizer\/releases\/download\/v?\d+\.\d+\.\d+\/PCTG-Optimizer-Setup\.exe$/.test(url.pathname);
  } catch {
    return false;
  }
}

function parseGitHubRelease(release) {
  const version = String(release?.tag_name || '').replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Latest GitHub release has an invalid version tag.');
  const asset = Array.isArray(release.assets)
    ? release.assets.find(candidate => candidate.name === 'PCTG-Optimizer-Setup.exe')
    : null;
  if (!asset || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > 500 * 1024 * 1024 || !isTrustedInstallerUrl(asset.browser_download_url)) {
    throw new Error('Latest GitHub release is missing a valid Windows installer asset.');
  }
  return {
    version,
    url: asset.browser_download_url,
    notes: String(release.body || '').slice(0, 1000),
    publishedAt: release.published_at || null
  };
}

module.exports = { isVersionNewer, isTrustedInstallerUrl, parseGitHubRelease };
