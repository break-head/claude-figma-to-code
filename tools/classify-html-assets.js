/**
 * classify-html-assets.js — 다운로드된 에셋을 분석하여 HTML 전환 후보를 분류
 *
 * Usage:
 *   node tools/classify-html-assets.js <outputDir>
 *
 * Output: asset-html-plan.json
 *   - html-table: 표 형태로 HTML 변환 권장
 *   - html-content: 텍스트/리스트 형태로 HTML 변환 권장
 *   - keep-image: <img> 태그 유지
 *   - review: AI가 직접 확인 필요
 */

const fs = require('node:fs');
const path = require('node:path');

// ── PNG 헤더에서 dimensions 읽기 ──

function readPngDimensions(filePath) {
  try {
    const buf = Buffer.alloc(24);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, 24, 0);
    fs.closeSync(fd);

    // PNG 시그니처 확인: 89 50 4E 47 0D 0A 1A 0A
    if (
      buf[0] !== 0x89 || buf[1] !== 0x50 ||
      buf[2] !== 0x4E || buf[3] !== 0x47
    ) {
      return null;
    }

    // IHDR 청크: bytes 16-19 = width, 20-23 = height (big-endian)
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { width, height };
  } catch {
    return null;
  }
}

// ── JSX 컨텍스트 분석 ──

function parseImageVars(jsx) {
  const vars = {};
  const re = /const\s+(\w+)\s*=\s*"(https:\/\/[^"]+)"/g;
  let m;
  while ((m = re.exec(jsx))) vars[m[1]] = m[2];
  return vars;
}

// URL로 변수명 찾기
function findVarNameByUrl(imageVars, url) {
  for (const [varName, varUrl] of Object.entries(imageVars)) {
    if (varUrl === url) return varName;
  }
  return null;
}

// 변수명으로 JSX 사용 컨텍스트 추출
function getJsxContextForVar(jsx, varName, maxLen = 600) {
  if (!varName) return '';

  // src={varName} 패턴 찾기
  const pattern = `src={${varName}}`;
  const idx = jsx.indexOf(pattern);
  if (idx === -1) return '';

  // 앞쪽으로 확장하여 부모 태그 포함
  const start = Math.max(0, idx - maxLen);
  return jsx.slice(start, Math.min(jsx.length, idx + 200));
}

// JSX 컨텍스트에서 클래스 힌트 추출
function analyzeJsxContext(ctx) {
  if (!ctx) return { hasBorder: false, hasObjectCover: false, hasBgWhite: false, hasTranslate: false, hasClip: false };

  return {
    hasBorder: /\bborder\b/.test(ctx),
    hasObjectCover: /object-cover/.test(ctx),
    hasBgWhite: /bg-white|bg-\[#(?:fff|ffffff|d9d9d9|f[0-9a-f]{5})\]/i.test(ctx),
    hasTranslate: /translate-/.test(ctx),
    hasClip: /clip-|overflow-hidden/.test(ctx),
    hasTextSiblings: /<span|<p\b|className="[^"]*text-/.test(ctx),
    hasInset: /inset-\[/.test(ctx),
  };
}

// ── 분류 로직 ──

function classifyAsset(item, dims, filesize, jsxCtx) {
  const hints = analyzeJsxContext(jsxCtx);

  // 1. exportedViaApi: true → 항상 keep-image (HIGH)
  if (item.exportedViaApi) {
    return {
      classification: 'keep-image',
      confidence: 'HIGH',
      reason: 'REST API로 내보낸 복합 이미지 (exportedViaApi)',
    };
  }

  // 2. placeholder: true → 건너뜀 (호출 측에서 skip 처리)
  // (이 함수는 호출 전에 이미 걸러짐)

  // 3. 치수 없음 → review
  if (!dims) {
    return {
      classification: 'review',
      confidence: null,
      reason: 'PNG 헤더를 읽을 수 없음 (SVG이거나 손상된 파일)',
    };
  }

  const { width, height } = dims;
  const aspectRatio = height > 0 ? width / height : 0;
  const aspectStr = `${(aspectRatio).toFixed(1)}:1`;

  // 4. object-cover / 크로핑 → keep-image (HIGH)
  if (hints.hasObjectCover || (hints.hasTranslate && hints.hasClip)) {
    return {
      classification: 'keep-image',
      confidence: 'HIGH',
      reason: `object-cover 또는 크로핑 사용 (JSX 컨텍스트)`,
    };
  }

  // 5. 큰 파일 → keep-image (HIGH)
  if (filesize > 200 * 1024) {
    return {
      classification: 'keep-image',
      confidence: 'HIGH',
      reason: `큰 파일 크기 (${(filesize / 1024).toFixed(1)}KB > 200KB)`,
    };
  }

  // 6. 세로로 긴 이미지 (<1:1) → keep-image (HIGH)
  if (aspectRatio < 1.0 && aspectRatio > 0) {
    return {
      classification: 'keep-image',
      confidence: 'HIGH',
      reason: `세로형 이미지 (비율 ${aspectStr})`,
    };
  }

  // 7. 가로 비율 >2.5 + 작은 파일 + border/bg-white → html-table (HIGH)
  if (aspectRatio > 2.5 && filesize < 100 * 1024 && (hints.hasBorder || hints.hasBgWhite)) {
    const ctxHint = hints.hasBorder ? 'border 클래스' : 'bg-white 배경';
    return {
      classification: 'html-table',
      confidence: 'HIGH',
      reason: `넓은 비율 (${aspectStr}), 작은 파일 (${(filesize / 1024).toFixed(1)}KB), ${ctxHint}`,
    };
  }

  // 8. 가로 비율 1.5~2.5 + 파일 <200KB + 크로핑 없음 → html-table (MEDIUM)
  if (aspectRatio >= 1.5 && aspectRatio <= 2.5 && filesize < 200 * 1024 && !hints.hasObjectCover && !hints.hasClip) {
    return {
      classification: 'html-table',
      confidence: 'MEDIUM',
      reason: `중간 비율 (${aspectStr}), 구조화된 레이아웃 가능성`,
    };
  }

  // 9. 파일 <50KB + 텍스트 형제 요소 → html-content (MEDIUM)
  if (filesize < 50 * 1024 && hints.hasTextSiblings) {
    return {
      classification: 'html-content',
      confidence: 'MEDIUM',
      reason: `작은 파일 (${(filesize / 1024).toFixed(1)}KB), 텍스트 형제 요소 존재`,
    };
  }

  // 10. 가로 비율 >2.5 + 작은 파일 (border 없어도) → html-table (MEDIUM)
  if (aspectRatio > 2.5 && filesize < 100 * 1024) {
    return {
      classification: 'html-table',
      confidence: 'MEDIUM',
      reason: `넓은 비율 (${aspectStr}), 작은 파일 (${(filesize / 1024).toFixed(1)}KB)`,
    };
  }

  // 11. 나머지 → review
  return {
    classification: 'review',
    confidence: null,
    reason: `명확한 패턴 없음 (비율 ${aspectStr}, ${(filesize / 1024).toFixed(1)}KB)`,
  };
}

// ── 메인 ──

function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Usage: node tools/classify-html-assets.js <outputDir>');
    process.exit(1);
  }

  const outputDir = path.resolve(args[0]);
  const manifestPath = path.join(outputDir, 'assets-manifest.json');
  const assetsDir = path.join(outputDir, 'assets');
  const jsxPath = path.join(outputDir, 'source.jsx');
  const resultPath = path.join(outputDir, 'asset-html-plan.json');

  if (!fs.existsSync(manifestPath)) {
    console.error(`assets-manifest.json not found: ${manifestPath}`);
    process.exit(1);
  }

  const items = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  if (!Array.isArray(items) || items.length === 0) {
    console.log('No assets in manifest.');
    return;
  }

  // source.jsx 읽기 (없어도 진행)
  let jsx = '';
  let imageVars = {};
  if (fs.existsSync(jsxPath)) {
    try {
      jsx = fs.readFileSync(jsxPath, 'utf-8');
      imageVars = parseImageVars(jsx);
    } catch {
      console.warn('source.jsx 읽기 실패 — dimensions만으로 분류합니다.');
    }
  } else {
    console.warn('source.jsx 없음 — dimensions만으로 분류합니다.');
  }

  const results = [];

  for (const item of items) {
    // placeholder: true → 건너뜀
    if (item.placeholder) continue;

    const filename = item.filename || '';
    const filePath = path.join(assetsDir, filename);

    // 파일 크기
    let filesize = item.filesize || 0;
    if (!filesize && fs.existsSync(filePath)) {
      try {
        filesize = fs.statSync(filePath).size;
      } catch {
        filesize = 0;
      }
    }

    // PNG dimensions
    let dims = null;
    if (item.width && item.height) {
      dims = { width: item.width, height: item.height };
    } else if (fs.existsSync(filePath) && path.extname(filename).toLowerCase() === '.png') {
      dims = readPngDimensions(filePath);
    }

    // JSX 컨텍스트
    const varName = findVarNameByUrl(imageVars, item.url);
    const jsxCtx = getJsxContextForVar(jsx, varName);

    // 분류
    const { classification, confidence, reason } = classifyAsset(item, dims, filesize, jsxCtx);

    const entry = {
      filename,
      classification,
      confidence,
      reason,
      dimensions: dims || null,
      filesize,
    };

    results.push(entry);
  }

  // 결과 저장
  fs.writeFileSync(resultPath, JSON.stringify(results, null, 2) + '\n');

  // ── 요약 출력 ──

  const counts = { 'html-table': 0, 'html-content': 0, 'keep-image': 0, review: 0 };
  for (const r of results) counts[r.classification] = (counts[r.classification] || 0) + 1;

  console.log('\n=== 에셋 HTML 전환 분석 ===');

  // html-table / html-content 먼저, keep-image, review 순
  const order = ['html-table', 'html-content', 'keep-image', 'review'];
  for (const cls of order) {
    const group = results.filter(r => r.classification === cls);
    for (const r of group) {
      const conf = r.confidence ? `(${r.confidence})`.padEnd(8) : '        ';
      const label = cls.padEnd(14);
      console.log(`  ${label} ${conf} ${r.filename} — ${r.reason}`);
    }
  }

  console.log('');
  console.log(
    `Summary: ${counts['html-table']} html-table, ` +
    `${counts['html-content']} html-content, ` +
    `${counts['keep-image']} keep-image, ` +
    `${counts['review']} review`
  );

  if (counts['html-table'] > 0 || counts['html-content'] > 0) {
    console.log('→ AI는 html-table/html-content 에셋을 Read로 확인 후 HTML 테이블로 변환하세요.');
  }
  if (counts['review'] > 0) {
    console.log('→ review 에셋은 반드시 Read로 직접 확인하세요.');
  }

  console.log(`\n→ ${resultPath}`);
}

main();
