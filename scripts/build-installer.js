const { execSync } = require('child_process');
const path = require('path');

const iscc = 'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe';
const iss = path.join(__dirname, 'installer.iss');

console.log('Compiling Inno Setup installer...');
execSync(`"${iscc}" "${iss}"`, { stdio: 'inherit', cwd: __dirname, timeout: 180000 });

const fs = require('fs');

console.log('Compiling Inno Setup installer...');
execSync(`"${iscc}" "${iss}"`, { stdio: 'inherit', cwd: __dirname, timeout: 180000 });

// Report the REAL output file rather than a hardcoded name. It previously said
// v1.2.0 unconditionally, so a 1.3.0 build printed a 1.2.0 path - which reads as
// "the version bump did not work" and sends you looking for a fault that isn't there.
const issText = fs.readFileSync(iss, 'utf-8');
const base = (/OutputBaseFilename=(.*)/.exec(issText) || [])[1]?.trim();
const version = (/AppVersion=([\d.]+)/.exec(issText) || [])[1]?.trim() || 'unknown';
const out = path.join(__dirname, '..', 'dist', base + '.exe');

console.log('\nInstaller build complete!');
console.log('Output: ' + (fs.existsSync(out) ? out : 'dist/' + base + '.exe  [NOT FOUND - check the build above]'));
console.log('Version: ' + version);
