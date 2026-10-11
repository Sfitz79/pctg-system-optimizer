const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const iscc = 'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe';
const iss = path.join(__dirname, 'installer.iss');

console.log('Compiling Inno Setup installer...');
// Compiled exactly once. This file used to run ISCC twice, which doubled a multi-minute
// LZMA2 build for no reason.
execSync(`"${iscc}" "${iss}"`, { stdio: 'inherit', cwd: __dirname, timeout: 600000 });

// Report the REAL output file. Two earlier bugs are guarded here: the path was hardcoded
// so it printed a 1.2.0 name for a 1.3.0 build, and it ignored OutputDir so it looked in
// dist/ after the installer started writing to dist/public/.
const issText = fs.readFileSync(iss, 'utf-8');
const base = (/OutputBaseFilename=(.*)/.exec(issText) || [])[1]?.trim();
const outDir = (/OutputDir=(.*)/.exec(issText) || [])[1]?.trim() || '..\\dist';
const version = (/AppVersion=([\d.]+)/.exec(issText) || [])[1]?.trim() || 'unknown';
const out = path.join(__dirname, outDir, base + '.exe');

console.log('\nInstaller build complete!');
console.log('Version: ' + version);
if (fs.existsSync(out)) {
  console.log('Output : ' + out + '  (' + (fs.statSync(out).size / 1048576).toFixed(1) + ' MB)');
} else {
  console.log('Output : ' + out + '  [NOT FOUND - check the build above]');
  process.exit(1);
}
