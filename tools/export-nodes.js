/**
 * export-nodes.js — Figma REST API를 사용하여 노드를 래스터 이미지로 내보내기
 *
 * Usage:
 *   node tools/export-nodes.js <output-dir> -f <fileKey> -n <nodeId:filename,...>
 *
 * Options:
 *   -f, --file-key   Figma file key (필수)
 *   -n, --nodes      노드 목록, "nodeId:filename" 쌍을 쉼표로 구분
 *                     예: "69:251:envelope-gas,69:274:envelope-sub"
 *   -s, --scale      스케일 팩터 (기본: 2)
 *   --format         출력 포맷: png, jpg, svg (기본: png)
 *
 * Example:
 *   node tools/export-nodes.js output/test1/ \
 *     -f P5zje405FYEwGZrj6ogWTT \
 *     -n "69:251:envelope-gas-voucher,69:274:envelope-subscription"
 *
 * .env 파일에 FIGMA_TOKEN이 필요합니다.
 */

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

// ── .env 로드 ──

function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

// ── HTTP 유틸 ──

function fetchJson(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const handler = (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, handler).on('error', reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        return;
      }
      const ws = fs.createWriteStream(destPath);
      res.pipe(ws);
      ws.on('finish', () => {
        ws.close();
        resolve(fs.statSync(destPath).size);
      });
    };

    const mod = url.startsWith('https') ? https : require('node:http');
    mod.get(url, handler).on('error', reject);
  });
}

// ── 인자 파싱 ──

function parseArgs(argv) {
  const args = { nodes: [], scale: 2, format: 'png' };
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === '-f' || a === '--file-key') { args.fileKey = argv[++i]; }
    else if (a === '-n' || a === '--nodes') { args.nodesRaw = argv[++i]; }
    else if (a === '-s' || a === '--scale') { args.scale = parseInt(argv[++i], 10); }
    else if (a === '--format') { args.format = argv[++i]; }
    else if (!a.startsWith('-') && !args.outputDir) { args.outputDir = a; }
    i++;
  }

  if (args.nodesRaw) {
    for (const entry of args.nodesRaw.split(',')) {
      const parts = entry.trim().split(':');
      if (parts.length >= 3) {
        // "69:251:filename" → nodeId = "69:251", filename = rest
        const nodeId = `${parts[0]}:${parts[1]}`;
        const filename = parts.slice(2).join(':');
        args.nodes.push({ nodeId, filename });
      } else if (parts.length === 2) {
        // Could be "69:251" (just nodeId, no filename)
        args.nodes.push({ nodeId: entry.trim(), filename: null });
      }
    }
  }

  return args;
}

// ── 매니페스트 업데이트 ──

function updateManifest(manifestPath, newEntries) {
  let manifest = [];
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  }

  for (const entry of newEntries) {
    const existing = manifest.findIndex(m => m.filename === entry.filename);
    if (existing !== -1) {
      manifest[existing] = { ...manifest[existing], ...entry };
    } else {
      manifest.push(entry);
    }
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}

// ── HTML 이미지 참조 동기화 ──

function syncHtmlRefs(htmlPath, oldName, newName) {
  if (!fs.existsSync(htmlPath)) return;
  let html = fs.readFileSync(htmlPath, 'utf-8');
  const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, 'g');
  if (re.test(html)) {
    html = html.replace(re, newName);
    fs.writeFileSync(htmlPath, html);
  }
}

// ── 메인 ──

async function main() {
  loadEnv();

  const token = process.env.FIGMA_TOKEN;
  if (!token) {
    console.error('ERROR: FIGMA_TOKEN이 설정되지 않았습니다.');
    console.error('.env 파일에 FIGMA_TOKEN=your_token 을 추가하세요.');
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));

  if (!args.outputDir || !args.fileKey || args.nodes.length === 0) {
    console.error('Usage: node tools/export-nodes.js <output-dir> -f <fileKey> -n <nodeId:filename,...>');
    console.error('Example: node tools/export-nodes.js output/test1/ -f ABC123 -n "69:251:envelope,69:274:card"');
    process.exit(1);
  }

  const assetsDir = path.join(args.outputDir, 'assets');
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

  // 1. Figma REST API 호출
  const nodeIds = args.nodes.map(n => n.nodeId).join(',');
  const apiUrl = `https://api.figma.com/v1/images/${args.fileKey}?ids=${encodeURIComponent(nodeIds)}&format=${args.format}&scale=${args.scale}`;

  console.log(`Figma API: ${args.nodes.length}개 노드 내보내기 (scale=${args.scale}, format=${args.format})`);

  let data;
  try {
    data = await fetchJson(apiUrl, { 'X-FIGMA-TOKEN': token });
  } catch (err) {
    console.error(`API 호출 실패: ${err.message}`);
    process.exit(1);
  }

  if (data.err) {
    console.error(`Figma API 에러: ${JSON.stringify(data.err)}`);
    process.exit(1);
  }

  // 2. 이미지 다운로드
  const manifestEntries = [];
  const htmlPath = path.join(args.outputDir, 'index.html');
  let downloaded = 0;
  let failed = 0;

  for (const node of args.nodes) {
    const imageUrl = data.images[node.nodeId];
    if (!imageUrl) {
      console.error(`  SKIP  ${node.nodeId} — API에서 URL이 반환되지 않음`);
      failed++;
      continue;
    }

    const ext = `.${args.format}`;
    const filename = (node.filename || `node-${node.nodeId.replace(':', '-')}`) + ext;
    const destPath = path.join(assetsDir, filename);

    try {
      const size = await downloadFile(imageUrl, destPath);
      const sizeKB = (size / 1024).toFixed(1);
      console.log(`  OK  ${filename} (${sizeKB}KB) ← ${node.nodeId}`);
      downloaded++;

      manifestEntries.push({
        url: imageUrl,
        filename,
        role: 'content',
        layer: 'foreground',
        figmaNodeId: node.nodeId,
        exportedViaApi: true
      });
    } catch (err) {
      console.error(`  FAIL  ${filename} — ${err.message}`);
      failed++;
    }
  }

  // 3. 매니페스트 업데이트
  const manifestPath = path.join(args.outputDir, 'assets-manifest.json');
  if (manifestEntries.length > 0) {
    updateManifest(manifestPath, manifestEntries);
    console.log(`\nManifest updated: ${manifestEntries.length} entries`);
  }

  // 4. 결과 출력
  console.log(`\nDone: ${downloaded} downloaded, ${failed} failed`);

  // JSON 결과
  const result = { ok: failed === 0, downloaded, failed, files: manifestEntries.map(e => e.filename) };
  console.log(JSON.stringify(result));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
