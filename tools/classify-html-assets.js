/**
 * classify-html-assets.js — 다운로드된 에셋을 분석하여 HTML 전환 후보를 분류
 *
 * 이 도구는 AI 에이전트가 사용합니다.
 * - 자동 휴리스틱으로 분류하되, 판단이 어려운 이미지는 `ai-review-required`로 표시
 * - AI 에이전트는 `ai-review-required` 이미지를 반드시 Read로 확인해야 합니다
 * - `css-replace`는 단색 배경 이미지로, CSS background-color로 대체합니다
 *
 * Usage:
 *   node tools/classify-html-assets.js <outputDir>
 *
 * Output: asset-html-plan.json
 *   - html-table:          표 형태 → HTML <table> 변환
 *   - html-content:        텍스트/리스트 → HTML 요소 변환
 *   - css-replace:         단색 배경 → CSS background-color 대체
 *   - ai-review-required:  AI가 반드시 Read로 확인 필요 (강제)
 *   - keep-image:          사진/일러스트 → <img> 유지
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// ── PNG 헤더에서 dimensions 읽기 ──

function readPngDimensions(filePath) {
  try {
    const buf = Buffer.alloc(24);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, 24, 0);
    fs.closeSync(fd);

    if (
      buf[0] !== 0x89 || buf[1] !== 0x50 ||
      buf[2] !== 0x4E || buf[3] !== 0x47
    ) {
      return null;
    }

    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { width, height };
  } catch {
    return null;
  }
}

// ── PNG 단색 감지 (IDAT 청크 크기 기반 휴리스틱) ──

function detectSolidColor(filePath, dims, filesize) {
  if (!dims || !filesize) return null;

  const { width, height } = dims;
  const pixelCount = width * height;

  // 단색 이미지의 특성: 픽셀 수 대비 파일 크기가 극히 작음
  // 압축 후 단색은 거의 헤더 크기만 남음
  const bytesPerPixel = filesize / pixelCount;

  // 단색 PNG: 보통 0.01 bytes/pixel 이하 (매우 작은 파일)
  // 일반 사진: 보통 1~4 bytes/pixel
  if (bytesPerPixel < 0.05 && filesize < 50 * 1024) {
    return true;
  }

  return false;
}

// ── JSX 컨텍스트 분석 ──

function parseImageVars(jsx) {
  const vars = {};
  const re = /const\s+(\w+)\s*=\s*"(https:\/\/[^"]+)"/g;
  let m;
  while ((m = re.exec(jsx))) vars[m[1]] = m[2];
  return vars;
}

function findVarNameByUrl(imageVars, url) {
  for (const [varName, varUrl] of Object.entries(imageVars)) {
    if (varUrl === url) return varName;
  }
  return null;
}

function getJsxContextForVar(jsx, varName, maxLen = 600) {
  if (!varName) return '';
  const pattern = `src={${varName}}`;
  const idx = jsx.indexOf(pattern);
  if (idx === -1) return '';
  const start = Math.max(0, idx - maxLen);
  return jsx.slice(start, Math.min(jsx.length, idx + 200));
}

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

// ── UI 패턴 휴리스틱 ──

function detectUIPattern(filename, dims, filesize) {
  if (!dims) return null;

  const { width, height } = dims;
  const aspectRatio = height > 0 ? width / height : 0;

  const patterns = [];

  // Header/Nav: 매우 넓고 낮은 이미지 (비율 > 8:1)
  if (aspectRatio > 8 && height < 200) {
    patterns.push('header-nav');
  }

  // Breadcrumb/Tab bar: 넓고 낮은 이미지 (비율 > 5:1, 높이 < 150)
  if (aspectRatio > 5 && height < 150 && filesize < 100 * 1024) {
    patterns.push('breadcrumb-tab');
  }

  // Footer: 넓고 중간 높이 (비율 > 2.5:1, 파일 < 200KB)
  if (aspectRatio > 2.5 && width > 800 && filesize < 200 * 1024) {
    const nameLower = filename.toLowerCase();
    if (nameLower.includes('footer') || nameLower.includes('bottom')) {
      patterns.push('footer');
    }
  }

  // 카드 리스트: 파일명에 반복 구조 키워드 → 파일 크기 무관하게 감지
  // (호텔 카드 스크린샷은 사진 포함으로 400KB+ 가능)
  const nameLower = filename.toLowerCase();
  if (nameLower.includes('list') || nameLower.includes('card') ||
      nameLower.includes('row') || nameLower.includes('detail') ||
      nameLower.includes('review')) {
    patterns.push('card-list');
  }

  return patterns.length > 0 ? patterns : null;
}

// ── 분류 로직 ──

function classifyAsset(item, dims, filesize, jsxCtx) {
  const hints = analyzeJsxContext(jsxCtx);
  const filename = item.filename || '';

  // 1. exportedViaApi: true → keep-image (HIGH)
  if (item.exportedViaApi) {
    return {
      classification: 'keep-image',
      confidence: 'HIGH',
      reason: 'REST API로 내보낸 복합 이미지 (exportedViaApi)',
      aiAction: null,
    };
  }

  // 2. 치수 없음 → ai-review-required
  if (!dims) {
    return {
      classification: 'ai-review-required',
      confidence: null,
      reason: 'PNG 헤더를 읽을 수 없음 (SVG이거나 손상된 파일)',
      aiAction: 'Read로 열어서 이미지 내용 확인. 텍스트 위주면 HTML 전환.',
    };
  }

  const { width, height } = dims;
  const aspectRatio = height > 0 ? width / height : 0;
  const aspectStr = `${(aspectRatio).toFixed(1)}:1`;

  // 3. 단색 이미지 감지 → css-replace
  const isSolid = detectSolidColor(item._filePath || '', dims, filesize);
  if (isSolid) {
    return {
      classification: 'css-replace',
      confidence: 'HIGH',
      reason: `단색 배경 추정 (${width}×${height}, ${(filesize / 1024).toFixed(1)}KB, bytes/px=${(filesize / (width * height)).toFixed(3)})`,
      aiAction: 'Read로 확인 후 CSS background-color로 대체. 색상값 추출.',
    };
  }

  // 4. UI 패턴 감지 → ai-review-required (강제 확인)
  // UI 패턴은 object-cover 힌트보다 우선 (카드 리스트가 object-cover로 표시될 수 있음)
  const uiPatterns = detectUIPattern(filename, dims, filesize);
  if (uiPatterns) {
    const patternStr = uiPatterns.join(', ');

    // 광고 배너는 예외 (keep-image)
    const nameLower = filename.toLowerCase();
    if (nameLower.includes('ad-') || nameLower.includes('banner') || nameLower.includes('promo')) {
      // 광고지만 텍스트가 많을 수 있으므로 확인 필요
      if (filesize < 50 * 1024) {
        return {
          classification: 'ai-review-required',
          confidence: null,
          reason: `광고/배너 추정이나 파일이 작음 (${patternStr}, ${(filesize / 1024).toFixed(1)}KB)`,
          aiAction: 'Read로 확인. 단순 텍스트 배너면 HTML 전환, 복잡한 비주얼이면 keep-image.',
        };
      }
    }

    return {
      classification: 'ai-review-required',
      confidence: null,
      reason: `UI 패턴 감지: ${patternStr} (${width}×${height}, ${aspectStr}, ${(filesize / 1024).toFixed(1)}KB)`,
      aiAction: `Read로 열어서 확인. 텍스트/링크/구조화 데이터가 있으면 HTML로 변환. 사진/일러스트면 keep-image.`,
    };
  }

  // 5. object-cover / 크로핑 → keep-image (HIGH)
  // 단, UI 패턴이 이미 감지된 경우는 Step 4에서 처리됨
  if (hints.hasObjectCover || (hints.hasTranslate && hints.hasClip)) {
    return {
      classification: 'keep-image',
      confidence: 'HIGH',
      reason: `object-cover 또는 크로핑 사용 (JSX 컨텍스트)`,
      aiAction: null,
    };
  }

  // 6. 큰 파일 (>200KB) → keep-image (HIGH) — 사진일 가능성 높음
  // 단, UI 패턴이 이미 감지된 경우는 Step 4에서 처리됨
  if (filesize > 200 * 1024) {
    return {
      classification: 'keep-image',
      confidence: 'HIGH',
      reason: `큰 파일 크기 (${(filesize / 1024).toFixed(1)}KB > 200KB) — 사진/복합 비주얼`,
      aiAction: null,
    };
  }

  // 7. 가로 비율 >2.5 + 작은 파일 + border/bg-white → html-table (HIGH)
  if (aspectRatio > 2.5 && filesize < 100 * 1024 && (hints.hasBorder || hints.hasBgWhite)) {
    const ctxHint = hints.hasBorder ? 'border 클래스' : 'bg-white 배경';
    return {
      classification: 'html-table',
      confidence: 'HIGH',
      reason: `넓은 비율 (${aspectStr}), 작은 파일 (${(filesize / 1024).toFixed(1)}KB), ${ctxHint}`,
      aiAction: 'Read로 확인 후 HTML <table>로 변환.',
    };
  }

  // 8. 가로 비율 1.5~2.5 + 파일 <200KB + 크로핑 없음 → ai-review-required
  if (aspectRatio >= 1.5 && aspectRatio <= 2.5 && filesize < 200 * 1024 && !hints.hasObjectCover && !hints.hasClip) {
    return {
      classification: 'ai-review-required',
      confidence: null,
      reason: `중간 비율 (${aspectStr}), ${(filesize / 1024).toFixed(1)}KB — 구조화된 데이터 가능성`,
      aiAction: 'Read로 확인. 카드/리스트/테이블이면 HTML 전환, 사진이면 keep-image.',
    };
  }

  // 9. 파일 <50KB + 텍스트 형제 요소 → ai-review-required
  if (filesize < 50 * 1024 && hints.hasTextSiblings) {
    return {
      classification: 'ai-review-required',
      confidence: null,
      reason: `작은 파일 (${(filesize / 1024).toFixed(1)}KB), 텍스트 형제 요소 존재`,
      aiAction: 'Read로 확인. 텍스트 위주면 HTML 전환.',
    };
  }

  // 10. 가로 비율 >2.5 + 작은 파일 → ai-review-required
  if (aspectRatio > 2.5 && filesize < 100 * 1024) {
    return {
      classification: 'ai-review-required',
      confidence: null,
      reason: `넓은 비율 (${aspectStr}), 작은 파일 (${(filesize / 1024).toFixed(1)}KB) — 네비게이션/헤더 가능성`,
      aiAction: 'Read로 확인. 텍스트/링크면 HTML 전환.',
    };
  }

  // 11. 세로형 이미지 → keep-image (HIGH)
  if (aspectRatio < 1.0 && aspectRatio > 0) {
    return {
      classification: 'keep-image',
      confidence: 'HIGH',
      reason: `세로형 이미지 (비율 ${aspectStr})`,
      aiAction: null,
    };
  }

  // 12. 나머지: 100KB 미만 → ai-review-required, 이상 → keep-image
  if (filesize < 100 * 1024) {
    return {
      classification: 'ai-review-required',
      confidence: null,
      reason: `분류 불확실 (비율 ${aspectStr}, ${(filesize / 1024).toFixed(1)}KB)`,
      aiAction: 'Read로 직접 확인하여 분류 결정.',
    };
  }

  return {
    classification: 'keep-image',
    confidence: 'MEDIUM',
    reason: `기본값 (비율 ${aspectStr}, ${(filesize / 1024).toFixed(1)}KB)`,
    aiAction: null,
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

  // source.jsx 읽기
  let jsx = '';
  let imageVars = {};
  if (fs.existsSync(jsxPath)) {
    try {
      jsx = fs.readFileSync(jsxPath, 'utf-8');
      imageVars = parseImageVars(jsx);
    } catch {
      console.warn('source.jsx 읽기 실패 — dimensions만으로 분류합니다.');
    }
  }

  const results = [];

  for (const item of items) {
    if (item.placeholder) continue;

    const filename = item.filename || '';
    const filePath = path.join(assetsDir, filename);

    let filesize = item.filesize || 0;
    if (!filesize && fs.existsSync(filePath)) {
      try { filesize = fs.statSync(filePath).size; } catch { filesize = 0; }
    }

    let dims = null;
    if (item.width && item.height) {
      dims = { width: item.width, height: item.height };
    } else if (fs.existsSync(filePath) && path.extname(filename).toLowerCase() === '.png') {
      dims = readPngDimensions(filePath);
    }

    // 파일 경로를 item에 임시 저장 (단색 감지용)
    item._filePath = filePath;

    const varName = findVarNameByUrl(imageVars, item.url);
    const jsxCtx = getJsxContextForVar(jsx, varName);
    const { classification, confidence, reason, aiAction } = classifyAsset(item, dims, filesize, jsxCtx);

    results.push({
      filename,
      classification,
      confidence,
      reason,
      aiAction,
      dimensions: dims || null,
      filesize,
    });
  }

  // 결과 저장
  fs.writeFileSync(resultPath, JSON.stringify(results, null, 2) + '\n');

  // ── 요약 출력 ──

  const counts = {};
  for (const r of results) counts[r.classification] = (counts[r.classification] || 0) + 1;

  console.log('\n=== 에셋 HTML 전환 분석 ===');

  const order = ['css-replace', 'html-table', 'html-content', 'ai-review-required', 'keep-image'];
  for (const cls of order) {
    const group = results.filter(r => r.classification === cls);
    for (const r of group) {
      const conf = r.confidence ? `(${r.confidence})`.padEnd(8) : '        ';
      const label = cls.padEnd(20);
      console.log(`  ${label} ${conf} ${r.filename} — ${r.reason}`);
    }
  }

  // ── AI 에이전트 강제 리포트 ──

  const actionRequired = results.filter(r => r.aiAction);

  console.log('');
  console.log(
    `Summary: ${counts['html-table'] || 0} html-table, ` +
    `${counts['html-content'] || 0} html-content, ` +
    `${counts['css-replace'] || 0} css-replace, ` +
    `${counts['ai-review-required'] || 0} ai-review-required, ` +
    `${counts['keep-image'] || 0} keep-image`
  );

  if (actionRequired.length > 0) {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  ⚠  AI_ACTION_REQUIRED — 아래 이미지를 반드시 Read로 확인  ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    for (const r of actionRequired) {
      console.log(`║  📋 ${r.filename}`);
      console.log(`║     분류: ${r.classification} | ${r.reason}`);
      console.log(`║     액션: ${r.aiAction}`);
      console.log('║');
    }
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║  총 ${actionRequired.length}개 이미지 확인 필요                                ║`);
    console.log('║  이 리포트를 무시하고 완료를 선언하지 마세요.               ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
  } else {
    console.log('\n✅ 모든 에셋 자동 분류 완료. AI 추가 확인 불필요.');
  }

  console.log(`\n→ ${resultPath}`);
}

main();
