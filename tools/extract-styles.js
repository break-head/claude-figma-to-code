/**
 * extract-styles.js
 * Playwright로 렌더된 페이지에서 data-node-id가 있는 요소들의 computed style을 추출한다.
 */

const path = require('node:path');

/**
 * @param {string} url - 프리뷰 서버 URL
 * @returns {{ [nodeId: string]: object }} - 노드별 실제 스타일 값
 */
async function extractStyles(url) {
  const { chromium } = require('playwright');

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 800 },
    deviceScaleFactor: 2,
  });

  await page.goto(url, { waitUntil: 'load' });

  const results = await page.evaluate(() => {
    const nodes = document.querySelectorAll('[data-node-id]');
    const map = {};

    for (const node of nodes) {
      const nodeId = node.getAttribute('data-node-id');
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();

      map[nodeId] = {
        // 타이포그래피
        fontSize: parseFloat(style.fontSize),
        fontWeight: parseInt(style.fontWeight, 10),
        lineHeight: style.lineHeight === 'normal' ? null : parseFloat(style.lineHeight),
        color: style.color,
        textAlign: style.textAlign,

        // 박스
        width: Math.round(rect.width),
        height: Math.round(rect.height),

        // 위치 (viewport 기준)
        boundingLeft: Math.round(rect.left),
        boundingTop: Math.round(rect.top),

        // 배경
        backgroundColor: style.backgroundColor,
        borderRadius: parseFloat(style.borderRadius) || 0,

        // 이미지 관련
        tagName: node.tagName.toLowerCase(),
        objectFit: node.tagName === 'IMG' ? style.objectFit : null,
        // 이미지가 absolute + 퍼센트 크롭인지 확인
        position: style.position,
        maxWidth: style.maxWidth,
      };

      // img 요소인 경우 추가 정보
      if (node.tagName === 'IMG' && style.position === 'absolute') {
        map[nodeId].imgWidth = style.width;
        map[nodeId].imgHeight = style.height;
        map[nodeId].imgLeft = style.left;
        map[nodeId].imgTop = style.top;
      }
    }

    return map;
  });

  await browser.close();
  return results;
}

/**
 * RGB 문자열을 hex로 변환
 * "rgb(43, 43, 43)" → "#2b2b2b"
 */
function rgbToHex(rgb) {
  if (!rgb || rgb === 'transparent' || rgb.startsWith('#')) return rgb;
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return rgb;
  const r = parseInt(m[1]).toString(16).padStart(2, '0');
  const g = parseInt(m[2]).toString(16).padStart(2, '0');
  const b = parseInt(m[3]).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

// ── CLI ──
if (require.main === module) {
  const url = process.argv[2] || 'http://localhost:3100';

  extractStyles(url).then((results) => {
    // 색상을 hex로 변환해서 출력
    for (const [nodeId, styles] of Object.entries(results)) {
      if (styles.color) styles.colorHex = rgbToHex(styles.color);
      if (styles.backgroundColor) styles.backgroundColorHex = rgbToHex(styles.backgroundColor);
    }

    console.log(JSON.stringify(results, null, 2));
    console.log(`\n[extract-styles] ${Object.keys(results).length}개 노드에서 스타일 추출 완료`);
  }).catch((err) => {
    console.error('[extract-styles] Error:', err.message);
    process.exit(1);
  });
}

module.exports = { extractStyles, rgbToHex };
