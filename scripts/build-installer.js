const { execSync } = require('child_process');
const path = require('path');

const iscc = 'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe';
const iss = path.join(__dirname, 'installer.iss');

console.log('Compiling Inno Setup installer...');
execSync(`"${iscc}" "${iss}"`, { stdio: 'inherit', cwd: __dirname, timeout: 180000 });

console.log('\nInstaller build complete!');
console.log('Output: dist/PCTG-Optimizer-Pro-Setup-v1.2.0.exe');
