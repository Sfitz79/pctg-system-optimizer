const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

const files = [
  { src: 'main.js', dest: 'main.js' },
  { src: 'preload.js', dest: 'preload.js' },
  { src: 'app/renderer.js', dest: 'app/renderer.js' },
  { src: 'report/report.js', dest: 'report/report.js' },
  { src: 'report/systemInfo.js', dest: 'report/systemInfo.js' }
];

const obfuscateOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: true,
  debugProtectionInterval: 4000,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  rotateStringArray: true,
  selfDefending: true,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
  unicodeEscapeSequence: false
};

const rootDir = path.join(__dirname, '..');

for (const file of files) {
  const srcPath = path.join(rootDir, file.src);
  const destPath = path.join(rootDir, file.dest);
  
  console.log(`Obfuscating: ${file.src}`);
  const code = fs.readFileSync(srcPath, 'utf-8');
  const result = JavaScriptObfuscator.obfuscate(code, obfuscateOptions);
  fs.writeFileSync(destPath, result.getObfuscatedCode());
  console.log(`  -> Written to ${file.dest}`);
}

console.log('\nObfuscation complete!');
