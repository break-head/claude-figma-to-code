/**
 * classify-nodes.js — MCP JSX를 파싱하여 에셋 전략을 자동 분류
 *
 * Usage:
 *   node tools/classify-nodes.js <source.jsx> [output-path]
 *
 * Output: asset-plan.json
 *   - restApiExports: Figma REST API로 래스터 내보내기할 노드
 *   - mcpAssets: MCP URL로 다운로드할 에셋
 */

const fs = require('node:fs');
const path = require('node:path');

// ── JSX 파싱 ──

function parseImageVars(jsx) {
  const vars = {};
  const re = /const\s+(\w+)\s*=\s*"(https:\/\/[^"]+)"/g;
  let m;
  while ((m = re.exec(jsx))) vars[m[1]] = m[2];
  return vars;
}

// 특정 nodeId가 jsx에서 다른 nodeId의 실제 자식인지 확인
// 부모 노드의 열린 태그부터 깊이를 추적하여, 부모가 닫히기 전에 자식이 나오는지 확인
function isDescendantOf(jsx, childId, parentId) {
  const parentIdx = jsx.indexOf(`data-node-id="${parentId}"`);
  const childIdx = jsx.indexOf(`data-node-id="${childId}"`);
  if (parentIdx === -1 || childIdx === -1 || childIdx <= parentIdx) return false;

  // 부모의 시작 태그 <div ...>를 찾아 깊이 1로 시작
  const between = jsx.slice(parentIdx, childIdx);

  // 깊이 추적: 부모의 <div> 에서 시작 (depth=1), 이후 open/close 추적
  let depth = 1;
  const tagRe = /<(\/?)div[\s>]/g;
  // 첫 번째 매치(부모 자신의 div)를 건너뛰기 위해 태그 위치부터 시작
  const startSearch = between.indexOf('>') + 1;
  const inner = between.slice(startSearch);

  let m;
  while ((m = tagRe.exec(inner))) {
    if (m[1] === '/') depth--;
    else depth++;

    // 부모의 깊이가 0이 되면 부모가 닫힌 것 → 자식이 아님
    if (depth <= 0) return false;
  }

  // 부모가 아직 닫히지 않은 상태에서 자식이 나옴 → 실제 자식
  return true;
}

// nodeId 주변의 직접 컨텍스트만 추출 (중첩된 data-node-id 이전까지)
function getDirectContext(jsx, nodeId, maxLen = 800) {
  const idx = jsx.indexOf(`data-node-id="${nodeId}"`);
  if (idx === -1) return '';
  const start = idx;
  const rawEnd = Math.min(jsx.length, start + maxLen);
  const slice = jsx.slice(start, rawEnd);

  // 다른 data-node-id가 나오면 거기까지만 (첫 번째 자식까지)
  const nextNode = slice.indexOf('data-node-id=', 20);
  if (nextNode > 0 && nextNode < maxLen - 100) {
    return slice.slice(0, nextNode);
  }
  return slice;
}

// nodeId가 포함된 넓은 영역 (자식 포함)
function getTreeContext(jsx, nodeId, maxLen = 2000) {
  const idx = jsx.indexOf(`data-node-id="${nodeId}"`);
  if (idx === -1) return '';
  return jsx.slice(idx, Math.min(jsx.length, idx + maxLen));
}

// ── 복합 이미지 그룹 감지 ──

function detectCompositeGroups(jsx) {
  const groups = [];
  const compositeNames = ['봉투', 'envelope', 'mockup', '목업'];

  const re = /data-name="([^"]+)"[^>]*data-node-id="([^"]+)"/g;
  let m;

  while ((m = re.exec(jsx))) {
    const name = m[1];
    const nodeId = m[2];

    // 이름이 합성 패턴인 경우만
    if (!compositeNames.some(h => name.includes(h))) continue;

    // 트리 컨텍스트에서 직접 <img> src 수 카운트
    const tree = getTreeContext(jsx, nodeId, 2500);
    const imgSrcs = tree.match(/src=\{(\w+)\}/g) || [];

    // 2개 이상 이미지가 겹쳐야 복합 그룹
    if (imgSrcs.length < 2) continue;

    // 텍스트 추출 (alt용)
    const textMatches = tree.match(/>([가-힣a-zA-Z0-9,._ ]{2,30})</g) || [];
    const texts = textMatches.map(t => t.slice(1).trim()).filter(Boolean);

    groups.push({
      nodeId, name,
      reason: 'composite-group',
      childImgCount: imgSrcs.length,
      altText: texts.slice(0, 3).join(', ')
    });
  }

  return groups;
}

// ── 플레이스홀더 후보 감지 ──

function detectPlaceholderCandidates(jsx, imageVars) {
  const candidates = [];
  // 큰 사이즈 컨테이너 + inset 오프셋 + 단일 img
  const re = /(?:h-\[([0-9.]+)px\]|w-\[([0-9.]+)px\])[^>]*data-node-id="([^"]+)"/g;
  let m;

  while ((m = re.exec(jsx))) {
    const h = parseFloat(m[1] || '0');
    const w = parseFloat(m[2] || '0');
    const nodeId = m[3];
    const maxDim = Math.max(w, h);

    if (maxDim < 400) continue; // 작은 것 제외

    const ctx = getTreeContext(jsx, nodeId, 500);
    const hasInset = /inset-\[/.test(ctx);
    const imgMatch = ctx.match(/src=\{(\w+)\}/);
    const imgCount = (ctx.match(/src=\{/g) || []).length;

    // inset이 있고, 이미지가 정확히 1개인 경우 (복합 아님, 플레이스홀더)
    if (hasInset && imgCount === 1 && imgMatch) {
      candidates.push({
        nodeId,
        varName: imgMatch[1],
        url: imageVars[imgMatch[1]] || null,
        reason: 'placeholder-candidate',
        size: [Math.round(w), Math.round(h)]
      });
    }
  }

  return candidates;
}

// ── 복잡한 레이아웃 노드 (step 카드 등) ──

function detectComplexLayouts(jsx) {
  const nodes = [];
  const hints = ['step 1', 'step 2', 'step 3', 'step1', 'step2', 'step3'];

  const re = /data-name="([^"]+)"[^>]*data-node-id="([^"]+)"/g;
  let m;

  while ((m = re.exec(jsx))) {
    const name = m[1];
    const nodeId = m[2];
    const nameLower = name.toLowerCase();

    if (!hints.some(h => nameLower === h)) continue;

    const tree = getTreeContext(jsx, nodeId, 3000);
    const imgCount = (tree.match(/src=\{/g) || []).length;
    const hasGrid = tree.includes('inline-grid') || tree.includes('grid-cols');

    if (imgCount >= 1 && hasGrid) {
      nodes.push({
        nodeId, name,
        reason: 'complex-layout',
        imgCount
      });
    }
  }

  return nodes;
}

// ── 장식 요소 감지 ──

function detectDecorations(jsx, imageVars) {
  const decorations = [];
  const re = /data-name="([^"]*)"[^>]*data-node-id="([^"]+)"/g;
  let m;

  while ((m = re.exec(jsx))) {
    const name = m[1];
    const nodeId = m[2];
    const ctx = getTreeContext(jsx, nodeId, 400);

    const hasPointerNone = ctx.includes('pointer-events-none');
    const hasOpacity = /opacity-[0-9]|opacity-\[/.test(ctx);
    const hasBlur = /blur-\[/.test(ctx);

    if (hasPointerNone && (hasOpacity || hasBlur)) {
      const srcMatch = ctx.match(/src=\{(\w+)\}/);
      if (srcMatch) {
        decorations.push({
          varName: srcMatch[1],
          url: imageVars[srcMatch[1]] || null,
          nodeId, name,
          role: 'decoration', layer: 'background'
        });
      }
    }
  }

  // 같은 URL 중복 제거
  const seen = new Set();
  return decorations.filter(d => {
    if (seen.has(d.url)) return false;
    seen.add(d.url);
    return true;
  });
}

// ── 아이콘 감지 ──

function detectIcons(jsx, imageVars) {
  const icons = [];
  const re = /size-\[([0-9.]+)px\][^>]*data-name="([^"]*)"[^>]*data-node-id="([^"]+)"/g;
  let m;

  while ((m = re.exec(jsx))) {
    const size = parseFloat(m[1]);
    const name = m[2];
    const nodeId = m[3];

    if (size > 250) continue; // 아이콘은 250px 이하

    const ctx = getDirectContext(jsx, nodeId, 300);
    const srcMatch = ctx.match(/src=\{(\w+)\}/);
    if (srcMatch) {
      icons.push({
        varName: srcMatch[1],
        url: imageVars[srcMatch[1]] || null,
        nodeId, name, size: Math.round(size),
        role: 'content', layer: 'foreground'
      });
    }
  }

  return icons;
}

// ── 계층 중복 제거 ──

function deduplicateHierarchy(jsx, nodes) {
  const result = [];
  const nodeIds = nodes.map(n => n.nodeId);

  for (const node of nodes) {
    // 이 노드가 다른 감지된 노드의 자식인지 확인
    const isChild = nodeIds.some(parentId =>
      parentId !== node.nodeId && isDescendantOf(jsx, node.nodeId, parentId)
    );
    if (!isChild) result.push(node);
  }

  return result;
}

// ── 나머지 이미지 추출 ──

function extractRemainingImages(imageVars, classifiedVarNames) {
  const remaining = [];
  for (const [varName, url] of Object.entries(imageVars)) {
    if (!classifiedVarNames.has(varName)) {
      remaining.push({ varName, url, role: 'content', layer: 'foreground' });
    }
  }
  return remaining;
}

// ── 메인 ──

function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Usage: node tools/classify-nodes.js <source.jsx> [output-path]');
    process.exit(1);
  }

  const jsxPath = args[0];
  const outputPath = args[1] || path.join(path.dirname(jsxPath), 'asset-plan.json');
  const jsx = fs.readFileSync(jsxPath, 'utf-8');
  const imageVars = parseImageVars(jsx);

  console.log(`이미지 변수: ${Object.keys(imageVars).length}개`);

  // 1. 분류
  const composites = detectCompositeGroups(jsx);
  const placeholders = detectPlaceholderCandidates(jsx, imageVars);
  const complexLayouts = detectComplexLayouts(jsx);
  const decorations = detectDecorations(jsx, imageVars);
  const icons = detectIcons(jsx, imageVars);

  // 2. REST API 대상 통합 + 계층 중복 제거
  // 복합 그룹: 자식 복합 그룹 제거 (봉투뒤 inside 봉투 등)
  const dedupedComposites = deduplicateHierarchy(jsx, composites);
  // 복잡 레이아웃: 이름 정규화로 중복 제거 (step1→step 1)
  const layoutByNorm = new Map();
  for (const l of complexLayouts) {
    const norm = l.name.toLowerCase().replace(/\s+/g, '');
    if (!layoutByNorm.has(norm)) layoutByNorm.set(norm, l);
  }
  const dedupedLayouts = [...layoutByNorm.values()];
  // 플레이스홀더: 복합 그룹 또는 복잡 레이아웃의 자식이면 제거
  const allParents = [...dedupedComposites, ...dedupedLayouts];
  const dedupedPlaceholders = placeholders.filter(p =>
    !allParents.some(parent => isDescendantOf(jsx, p.nodeId, parent.nodeId))
  );
  const restApiExports = [...dedupedComposites, ...dedupedPlaceholders, ...dedupedLayouts];

  // 3. 분류된 변수 수집 (REST 내보내기 대상의 자식 이미지도 포함)
  const classifiedVarNames = new Set();
  decorations.forEach(d => classifiedVarNames.add(d.varName));
  icons.forEach(i => classifiedVarNames.add(i.varName));

  for (const node of restApiExports) {
    // 이 노드 트리 안의 모든 이미지 변수를 수집 → MCP 다운로드에서 제외
    const tree = getTreeContext(jsx, node.nodeId, 4000);
    const srcs = tree.match(/src=\{(\w+)\}/g) || [];
    srcs.forEach(s => {
      const v = s.match(/\{(\w+)\}/);
      if (v) classifiedVarNames.add(v[1]);
    });
    if (node.varName) classifiedVarNames.add(node.varName);
  }

  // 4. 나머지 → MCP 에셋
  const remaining = extractRemainingImages(imageVars, classifiedVarNames);
  const mcpAssets = [...decorations, ...icons, ...remaining];

  // URL 중복 제거
  const seenUrls = new Set();
  const uniqueMcp = mcpAssets.filter(a => {
    if (!a.url || seenUrls.has(a.url)) return false;
    seenUrls.add(a.url);
    return true;
  });

  const plan = {
    summary: {
      totalImageVars: Object.keys(imageVars).length,
      restApiExports: restApiExports.length,
      mcpAssets: uniqueMcp.length,
      compositeGroups: composites.length,
      placeholders: placeholders.length,
      complexLayouts: complexLayouts.length
    },
    restApiExports,
    mcpAssets: uniqueMcp
  };

  fs.writeFileSync(outputPath, JSON.stringify(plan, null, 2) + '\n');

  console.log(`\n분류 결과:`);
  console.log(`  REST API 내보내기: ${restApiExports.length}개`);
  restApiExports.forEach(n =>
    console.log(`    → ${n.nodeId} "${n.name || ''}" [${n.reason}]`)
  );
  console.log(`  MCP 에셋 다운로드: ${uniqueMcp.length}개`);
  console.log(`\n→ ${outputPath}`);
  console.log(JSON.stringify({ ok: true, output: outputPath, ...plan.summary }));
}

main();
