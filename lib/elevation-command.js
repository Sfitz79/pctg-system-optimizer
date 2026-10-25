// Start-Process joins ArgumentList into a command line. Keep the development
// app path quoted separately from the flag. Packaged Electron needs only the flag.
function buildElevationCommand(executable, appPath, packaged) {
  const literal = value => "'" + String(value).replace(/'/g, "''") + "'";
  const args = packaged ? ['--elevated'] : ['"' + appPath + '"', '--elevated'];
  return 'Start-Process -FilePath ' + literal(executable) +
    ' -ArgumentList @(' + args.map(literal).join(', ') + ') -Verb RunAs';
}
module.exports = { buildElevationCommand };
