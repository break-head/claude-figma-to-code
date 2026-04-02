/**
 * validate.js
 * MCP 원본의 의도값과 렌더된 페이지의 실제값을 비교하여 불일치 리포트를 생성한다.
 *
 * 사용법:
 *   node tools/validate.js output/ [http://localhost:3100]
 *
 * 전제:
 *   - output/.mcp-source.jsx 가 존재해야 함 (MCP 원본 코드)
 *   - 프리뷰 서버가 실행 중이거나 URL을 지정해야 함
 */

const fs = require('node:fs');
const path = require('node:path');
const { parseMcpSource, inferAlignment } = require('./parse-mcp.js');
const { extractStyles, rgbToHex } = require('./extract-styles.js');

// ── 비교 규칙 ──

const TOLERANCE = {
  fontSize: 1,       // ±1px
  lineHeight: 2,     // ±2px
  width: 10,         // ±10px (flex 레이아웃 차이 허용)
  height: 10,
  borderRadius: 1,
};

/**
 * 두 hex 색상이 같은지 비교 (대소문자 무시)
 */
function colorsMatch(a, b) {
  if (!a || !b) return true; // 한쪽이 없으면 스킵
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * 숫자값 비교 (허용 오차 내인지)
 */
function numbersMatch(actual, expected, tolerance) {
  if (expected == null || actual == null) return true;
  return Math.abs(actual - expected) <= tolerance;
}

/**
 * 단일 노드의 의도값과 실제값을 비교
 * @returns {Array<{property: string, expected: any, actual: any, severity: string}>}
 */
function compareNode(nodeId, intended, actual) {
  const issues = [];

  if (!actual) {
    issues.push({
      property: 'element',
      expected: 'exists',
      actual: 'missing',
      severity: 'error',
      message: `data-node-id="${nodeId}" 요소가 렌더된 페이지에 없음`,
    });
    return issues;
  }

  // 1. fontSize
  if (intended.fontSize != null) {
    if (!numbersMatch(actual.fontSize, intended.fontSize, TOLERANCE.fontSize)) {
      issues.push({
        property: 'fontSize',
        expected: `${intended.fontSize}px`,
        actual: `${actual.fontSize}px`,
        severity: 'warning',
      });
    }
  }

  // 2. fontWeight
  if (intended.fontWeight != null) {
    if (actual.fontWeight !== intended.fontWeight) {
      issues.push({
        property: 'fontWeight',
        expected: intended.fontWeight,
        actual: actual.fontWeight,
        severity: 'error', // 볼드/레귤러 구분은 중요
      });
    }
  }

  // 3. color
  if (intended.color != null) {
    const actualHex = rgbToHex(actual.color);
    if (!colorsMatch(actualHex, intended.color)) {
      issues.push({
        property: 'color',
        expected: intended.color,
        actual: actualHex,
        severity: 'warning',
      });
    }
  }

  // 4. backgroundColor
  if (intended.backgroundColor != null) {
    const actualHex = rgbToHex(actual.backgroundColor);
    if (!colorsMatch(actualHex, intended.backgroundColor)) {
      issues.push({
        property: 'backgroundColor',
        expected: intended.backgroundColor,
        actual: actualHex,
        severity: 'warning',
      });
    }
  }

  // 5. lineHeight
  if (intended.lineHeight != null && actual.lineHeight != null) {
    if (!numbersMatch(actual.lineHeight, intended.lineHeight, TOLERANCE.lineHeight)) {
      issues.push({
        property: 'lineHeight',
        expected: `${intended.lineHeight}px`,
        actual: `${actual.lineHeight}px`,
        severity: 'info',
      });
    }
  }

  // 6. textAlign (명시적 text-center)
  if (intended.textAlign === 'center') {
    if (actual.textAlign !== 'center') {
      issues.push({
        property: 'textAlign',
        expected: 'center',
        actual: actual.textAlign,
        severity: 'error',
      });
    }
  }

  // 7. 중앙 정렬 추론 (alignHint or inferredAlign)
  if (intended.alignHint === 'center' || intended.inferredAlign === 'center') {
    // 렌더된 요소가 뷰포트 내에서 중앙에 있는지 체크
    // 1440px 기준, 요소의 중심이 720px 근처(±50px)인지
    if (actual.width > 0) {
      const elementCenter = actual.boundingLeft + actual.width / 2;
      const viewportCenter = 720; // 1440 / 2
      if (Math.abs(elementCenter - viewportCenter) > 50) {
        issues.push({
          property: 'alignment',
          expected: 'center (추론됨)',
          actual: `center=${Math.round(elementCenter)}px (viewport center=720px)`,
          severity: 'warning',
        });
      }
    }
  }

  // 8. 이미지 크롭 보존 체크
  if (intended.imageCrop) {
    if (actual.tagName === 'img') {
      // object-fit: cover인데 크롭이 있어야 하면 문제
      if (actual.objectFit === 'cover' && actual.position !== 'absolute') {
        issues.push({
          property: 'imageCrop',
          expected: `퍼센트 크롭 (w:${intended.imageCrop.width}, l:${intended.imageCrop.left})`,
          actual: 'object-fit: cover (크롭 좌표 손실)',
          severity: 'error',
        });
      }
    }
  }

  // 9. borderRadius
  if (intended.borderRadius != null) {
    if (!numbersMatch(actual.borderRadius, intended.borderRadius, TOLERANCE.borderRadius)) {
      issues.push({
        property: 'borderRadius',
        expected: `${intended.borderRadius}px`,
        actual: `${actual.borderRadius}px`,
        severity: 'info',
      });
    }
  }

  return issues;
}

/**
 * 전체 검증 실행
 */
async function validate(outputDir, previewUrl = 'http://localhost:3100') {
  const mcpPath = path.join(outputDir, '.mcp-source.jsx');
  if (!fs.existsSync(mcpPath)) {
    console.error(`[validate] MCP 소스 없음: ${mcpPath}`);
    console.error('[validate] 먼저 get_design_context 결과를 output/.mcp-source.jsx에 저장하세요.');
    return { pass: 0, warn: 0, fail: 0, issues: [] };
  }

  // 1. MCP 원본에서 의도값 추출
  console.log('[validate] MCP 원본 파싱 중...');
  const jsx = fs.readFileSync(mcpPath, 'utf-8');
  const nodeMap = parseMcpSource(jsx);
  inferAlignment(nodeMap);

  // 2. 렌더된 페이지에서 실제값 추출
  console.log('[validate] 렌더된 페이지 스타일 추출 중...');
  const actualStyles = await extractStyles(previewUrl);

  // 3. 비교
  console.log('[validate] 비교 중...\n');

  let pass = 0;
  let warn = 0;
  let fail = 0;
  const allIssues = [];

  const checkedNodes = Object.entries(nodeMap).filter(
    ([, data]) => Object.keys(data.intended).length > 0
      && !data.intended._isContents
  );

  for (const [nodeId, data] of checkedNodes) {
    const issues = compareNode(nodeId, data.intended, actualStyles[nodeId]);

    if (issues.length === 0) {
      pass++;
    } else {
      for (const issue of issues) {
        if (issue.severity === 'error') fail++;
        else if (issue.severity === 'warning') warn++;
        else pass++; // info는 pass 취급

        allIssues.push({ nodeId, tagName: data.tagName, ...issue });
      }
    }
  }

  // 4. 리포트 출력
  console.log('=== Validate Report ===\n');

  // 에러 먼저
  const errors = allIssues.filter((i) => i.severity === 'error');
  const warnings = allIssues.filter((i) => i.severity === 'warning');
  const infos = allIssues.filter((i) => i.severity === 'info');

  if (errors.length > 0) {
    console.log('🔴 ERRORS:');
    for (const e of errors) {
      console.log(`  [${e.nodeId}] <${e.tagName}> ${e.property}: expected ${e.expected}, got ${e.actual}`);
      if (e.message) console.log(`    → ${e.message}`);
    }
    console.log();
  }

  if (warnings.length > 0) {
    console.log('🟡 WARNINGS:');
    for (const w of warnings) {
      console.log(`  [${w.nodeId}] <${w.tagName}> ${w.property}: expected ${w.expected}, got ${w.actual}`);
    }
    console.log();
  }

  if (infos.length > 0) {
    console.log('🔵 INFO:');
    for (const i of infos) {
      console.log(`  [${i.nodeId}] <${i.tagName}> ${i.property}: expected ${i.expected}, got ${i.actual}`);
    }
    console.log();
  }

  const total = checkedNodes.length;
  console.log(`총 ${total}개 노드 검증 — ✅ ${pass} pass, 🟡 ${warn} warn, 🔴 ${fail} error`);
  console.log();

  return { pass, warn, fail, issues: allIssues };
}

// ── CLI ──
if (require.main === module) {
  const outputDir = process.argv[2] || 'output';
  const previewUrl = process.argv[3] || 'http://localhost:3100';

  if (!fs.existsSync(outputDir)) {
    console.error(`[validate] 디렉토리 없음: ${outputDir}`);
    process.exit(1);
  }

  validate(path.resolve(outputDir), previewUrl)
    .then(({ fail }) => {
      if (fail > 0) process.exit(1);
    })
    .catch((err) => {
      console.error('[validate] Error:', err.message);
      process.exit(1);
    });
}

module.exports = { validate };
