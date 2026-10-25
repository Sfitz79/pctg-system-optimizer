const test=require('node:test');
const assert=require('node:assert/strict');
const {buildElevationCommand}=require('../lib/elevation-command.js');
test('development relaunch keeps the app path and elevation flag as separate arguments',()=>{
  const command=buildElevationCommand('C:\\Program Files\\Electron\\electron.exe','C:\\My Projects\\PCTG Optimizer',false);
  assert.match(command,/-ArgumentList @\('"C:\\My Projects\\PCTG Optimizer"', '--elevated'\)/);
  assert.match(command,/-Verb RunAs$/);
});
test('packaged relaunch uses the embedded entry point',()=>{
  const command=buildElevationCommand('C:\\Program Files\\PCTG\\PCTG Optimizer Pro.exe','C:\\app.asar\\main.js',true);
  assert.match(command,/-ArgumentList @\('--elevated'\)/);
  assert.doesNotMatch(command,/app\.asar/);
});
test('PowerShell paths preserve apostrophes without expanding commands',()=>{
  const command=buildElevationCommand("C:\\O'Brien\\electron.exe","C:\\O'Brien\\My App",false);
  assert.match(command,/O''Brien/);
});
