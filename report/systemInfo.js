const os = require('os');

function getSystemInfo() {
  return {
    os: `${os.type()} ${os.release()}`,
    cpu: os.cpus()[0].model,
    ram: `${Math.round(os.totalmem() / 1024 / 1024 / 1024)} GB`,
    gpu: "Auto-detect coming soon"
  };
}

module.exports = { getSystemInfo };
