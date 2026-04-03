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
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
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

async function run(outputDir, concurrency = 10) {
  const manifestPath = path.join(outputDir, 'assets-manifest.json');
  const assetsDir = path.join(outputDir, 'assets');

  if (!fs.existsSync(manifestPath)) {
    console.log('No assets-manifest.json found. Skipping.');
    return;
  }

  const items = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  if (!Array.isArray(items) || items.length === 0) {
    console.log('No assets to download.');
    return;
  }

  fs.mkdirSync(assetsDir, { recursive: true });

  let ok = 0, fail = 0;
  const queue = [...items];

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      const filename = sanitizeFilename(item.filename);
      const dest = path.join(assetsDir, filename);
      try {
        await downloadFile(item.url, dest);
        ok++;
        console.log(`  OK  ${filename}`);
      } catch (err) {
        fail++;
        console.warn(`  FAIL ${filename}: ${err.message}`);
        createPlaceholder(dest);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );

  console.log(`Done: ${ok} downloaded, ${fail} failed`);
}

if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node tools/download-assets.js <outputDir>'); process.exit(1); }
  run(path.resolve(dir)).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { run, sanitizeFilename };
