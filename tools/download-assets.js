const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const http = require('node:http');

function sanitizeFilename(name) {
  if (!name || name.trim() === '') return `asset-${Date.now()}`;
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  const sanitized = base
    .replace(/[()[\]{}]/g, '')
    .replace(/[^a-zA-Z0-9가-힣._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return (sanitized || `asset-${Date.now()}`) + ext;
}

function parseManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    console.warn(`[download-assets] ${manifestPath} not found.`);
    return [];
  }
  const data = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  return Array.isArray(data) ? data : [];
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    client.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        fs.unlinkSync(destPath);
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(destPath); });
    }).on('error', (err) => {
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

function createPlaceholder(destPath) {
  const placeholder = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNl7BcQAAAABJRU5ErkJggg==',
    'base64'
  );
  fs.writeFileSync(destPath, placeholder);
}

async function run(outputDir, concurrency = 5) {
  const manifestPath = path.join(outputDir, 'assets-manifest.json');
  const assetsDir = path.join(outputDir, 'assets');
  const items = parseManifest(manifestPath);

  if (items.length === 0) {
    console.log('[download-assets] No assets to download.');
    return { downloaded: 0, failed: 0 };
  }

  fs.mkdirSync(assetsDir, { recursive: true });

  let downloaded = 0;
  let failed = 0;
  const queue = [...items];

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      const filename = sanitizeFilename(item.filename);
      const destPath = path.join(assetsDir, filename);
      try {
        await downloadFile(item.url, destPath);
        downloaded++;
        console.log(`  [OK] ${filename}`);
      } catch (err) {
        failed++;
        console.warn(`  [FAIL] ${filename}: ${err.message}`);
        createPlaceholder(destPath);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);

  console.log(`[download-assets] Done: ${downloaded} downloaded, ${failed} failed.`);
  return { downloaded, failed };
}

if (require.main === module) {
  const outputDir = process.argv[2];
  if (!outputDir) {
    console.error('Usage: node tools/download-assets.js <outputDir>');
    process.exit(1);
  }
  run(outputDir);
}

module.exports = { parseManifest, sanitizeFilename, downloadFile, run };
