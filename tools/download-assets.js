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

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── File type detection ──

function detectExtension(buf, contentType) {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return '.png';
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return '.jpg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return '.gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return '.webp';
  const head = buf.slice(0, 256).toString('utf-8').trimStart();
  if (head.startsWith('<svg') || head.startsWith('<?xml') || head.startsWith('<SVG')) return '.svg';
  if (contentType) {
    if (contentType.includes('svg')) return '.svg';
    if (contentType.includes('png')) return '.png';
    if (contentType.includes('jpeg') || contentType.includes('jpg')) return '.jpg';
    if (contentType.includes('gif')) return '.gif';
    if (contentType.includes('webp')) return '.webp';
  }
  return null;
}

// ── SVG metadata extraction ──

function parseSvgMetadata(buf) {
  const content = buf.toString('utf-8');
  const meta = { type: 'svg' };

  // Extract viewBox
  const vbMatch = content.match(/viewBox=["']([^"']+)["']/);
  if (vbMatch) {
    const parts = vbMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4) {
      const [, , w, h] = parts;
      meta.viewBox = { width: Math.round(w), height: Math.round(h) };
      meta.aspectRatio = `${Math.round(w)}/${Math.round(h)}`;
    }
  }

  // Detect placeholder: SVG with only stroke paths, no fill content
  const hasFill = /fill="(?!none|var\(--stroke)[^"]*"/.test(content) ||
                  /fill="url\(#/.test(content);
  const hasImage = /<image\b/.test(content);
  const hasText = /<text\b/.test(content);
  const onlyStroke = !hasFill && !hasImage && !hasText &&
                     /stroke=/.test(content);

  if (onlyStroke) {
    meta.placeholder = true;
    meta.reason = 'stroke-only SVG (빈 프레임)';
  }

  return meta;
}

// ── Download ──

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const buf = Buffer.concat(chunks);
        const contentType = response.headers['content-type'] || '';
        const realExt = detectExtension(buf, contentType);
        let finalPath = destPath;
        if (realExt) {
          const currentExt = path.extname(destPath).toLowerCase();
          if (currentExt !== realExt) {
            finalPath = destPath.replace(/\.[^.]+$/, realExt);
          }
        }
        fs.writeFileSync(finalPath, buf);

        // SVG metadata
        let svgMeta = null;
        const ext = path.extname(finalPath).toLowerCase();
        if (ext === '.svg') {
          svgMeta = parseSvgMetadata(buf);
        }

        resolve({ destPath, finalPath, buf, svgMeta });
      });
    }).on('error', (err) => {
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

// ── HTML sync ──

function syncHtmlReferences(outputDir, items) {
  const htmlFiles = fs.readdirSync(outputDir).filter(f => f.endsWith('.html'));
  for (const htmlFile of htmlFiles) {
    const htmlPath = path.join(outputDir, htmlFile);
    let html = fs.readFileSync(htmlPath, 'utf-8');
    let htmlChanged = false;
    for (const item of items) {
      const base = path.basename(item.filename, path.extname(item.filename));
      const pattern = new RegExp(`assets/${escapeRegex(base)}\\.\\w+`, 'g');
      const replacement = `assets/${item.filename}`;
      const newHtml = html.replace(pattern, replacement);
      if (newHtml !== html) {
        html = newHtml;
        htmlChanged = true;
      }
    }
    if (htmlChanged) {
      fs.writeFileSync(htmlPath, html);
      console.log(`HTML synced: ${htmlFile}`);
    }
  }
}

// ── Main ──

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

  let ok = 0, fail = 0, renamed = 0;
  const queue = [...items];
  const warnings = [];

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      const filename = sanitizeFilename(item.filename);
      const dest = path.join(assetsDir, filename);
      try {
        const result = await downloadFile(item.url, dest);
        ok++;

        // Extension correction
        if (result.finalPath !== result.destPath) {
          const newFilename = path.basename(result.finalPath);
          item.filename = newFilename;
          renamed++;
          console.log(`  OK  ${filename} → ${newFilename} (확장자 보정)`);
        } else {
          console.log(`  OK  ${filename}`);
        }

        // SVG metadata → manifest
        if (result.svgMeta) {
          if (result.svgMeta.aspectRatio) {
            item.aspectRatio = result.svgMeta.aspectRatio;
          }
          if (result.svgMeta.viewBox) {
            item.width = result.svgMeta.viewBox.width;
            item.height = result.svgMeta.viewBox.height;
          }
          if (result.svgMeta.placeholder) {
            item.placeholder = true;
            warnings.push(`  ⚠ ${item.filename} — ${result.svgMeta.reason}. HTML/CSS로 직접 구현 필요`);
          }
        }

        // Small file warning
        const size = result.buf.length;
        if (size < 1024 && !result.svgMeta?.placeholder) {
          warnings.push(`  ⚠ ${item.filename} (${size}B) — 파일이 너무 작음`);
        }

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

  // Always update manifest (metadata added even without renames)
  fs.writeFileSync(manifestPath, JSON.stringify(items, null, 2));
  if (renamed > 0) {
    console.log(`Manifest updated: ${renamed} filename(s) corrected`);
  }

  // Always sync HTML references with manifest
  syncHtmlReferences(outputDir, items);

  // Warnings
  if (warnings.length > 0) {
    console.log(`\nWarnings (${warnings.length}):`);
    warnings.forEach(w => console.log(w));
  }

  console.log(`\nDone: ${ok} downloaded, ${fail} failed, ${renamed} ext-fixed`);
}

if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node tools/download-assets.js <outputDir>'); process.exit(1); }
  run(path.resolve(dir)).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { run, sanitizeFilename };
