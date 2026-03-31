const path = require('node:path');

async function capture({ url, outputPath, width = 1440, deviceScaleFactor = 2 }) {
  const { chromium } = require('playwright');

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width, height: 800 },
    deviceScaleFactor,
  });

  await page.goto(url, { waitUntil: 'load' });

  await page.screenshot({
    path: outputPath,
    fullPage: true,
  });

  await browser.close();

  console.log(`[capture] Screenshot saved: ${outputPath} (${width}px @ ${deviceScaleFactor}x)`);
  return outputPath;
}

if (require.main === module) {
  const url = process.argv[2] || 'http://localhost:3100';
  const outputPath = process.argv[3] || 'output/.preview-screenshot.png';
  const width = parseInt(process.argv[4] || '1440', 10);

  capture({ url, outputPath: path.resolve(outputPath), width }).catch(err => {
    console.error('[capture] Error:', err.message);
    process.exit(1);
  });
}

module.exports = { capture };
