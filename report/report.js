const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const os = require('os');

function generateReport(data) {
  const doc = new PDFDocument();
  const reportDir = path.join(os.tmpdir(), 'pctg-reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  const filePath = path.join(reportDir, `PCTG_Report_${Date.now()}.pdf`);
  const stream = fs.createWriteStream(filePath);

  doc.pipe(stream);

  try {
    doc.image(path.join(__dirname, '..', 'assets', 'pctg-logo.png'), 50, 40, { width: 60 });
  } catch {}
  doc
    .fontSize(22)
    .fillColor('#4AF2A1')
    .text('PCTG Optimizer Pro', 130, 50)
    .fontSize(12)
    .fillColor('#333333')
    .text('Your PC. Faster. Cleaner. Smoother.', 130, 80);

  doc.moveDown(2);

  doc
    .fontSize(18)
    .fillColor('#4AF2A1')
    .text('System Optimisation Report', { underline: true });

  doc.moveDown();

  doc
    .fontSize(12)
    .fillColor('#333333')
    .text(`Date: ${new Date().toLocaleString()}`);

  doc.moveDown();

  doc
    .fontSize(14)
    .fillColor('#4AF2A1')
    .text('System Information');

  doc
    .fontSize(12)
    .fillColor('#333333')
    .text(`OS: ${data.os}`)
    .text(`CPU: ${data.cpu}`)
    .text(`RAM: ${data.ram}`)
    .text(`GPU: ${data.gpu}`);

  doc.moveDown();

  doc
    .fontSize(14)
    .fillColor('#4AF2A1')
    .text('Optimisation Summary');

  doc
    .fontSize(12)
    .fillColor('#333333')
    .list(data.phases);

  doc.moveDown();

  doc
    .fontSize(14)
    .fillColor('#4AF2A1')
    .text('Recommendations');

  doc
    .fontSize(12)
    .fillColor('#333333')
    .list(data.recommendations);

  doc.moveDown();

  doc
    .fontSize(10)
    .fillColor('#4AF2A1')
    .text('PcTechGuyOnline — UK Performance Specialists', { align: 'center' })
    .text('pctechguyonline.com', { align: 'center' });

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}

module.exports = { generateReport };
