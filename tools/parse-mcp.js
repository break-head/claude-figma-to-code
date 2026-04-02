/**
 * parse-mcp.js
 * MCP가 반환한 React+Tailwind JSX에서 각 노드의 "의도된 스타일"을 추출한다.
 * data-node-id 기준으로 맵핑된 객체를 반환.
 */

const fs = require('node:fs');
const path = require('node:path');

// ── Tailwind 파서 ──

/** text-[20px] → { fontSize: 20 } */
function parseFontSize(cls) {
  const m = cls.match(/text-\[(\d+(?:\.\d+)?)px\]/);
  return m ? { fontSize: parseFloat(m[1]) } : null;
}

/** text-[#2b2b2b] → { color: "#2b2b2b" } */
function parseColor(cls) {
  const m = cls.match(/text-\[(#[0-9a-fA-F]{3,8})\]/);
  return m ? { color: m[1].toLowerCase() } : null;
}

/** font-['YouandiNewKr_Title:Bold',...] → { fontWeight: 700 } */
function parseFontWeight(cls) {
  if (/font-\[.*Bold.*\]/.test(cls) || /font-\[.*bold.*\]/.test(cls)) {
    return { fontWeight: 700 };
  }
  if (/font-\[.*Regular.*\]/.test(cls) || /font-\[.*regular.*\]/.test(cls)) {
    return { fontWeight: 400 };
  }
  return null;
}

/** leading-[30px] → { lineHeight: 30 } */
function parseLineHeight(cls) {
  const m = cls.match(/leading-\[(\d+(?:\.\d+)?)px\]/);
  return m ? { lineHeight: parseFloat(m[1]) } : null;
}

/** w-[1052px] → { width: 1052 } */
function parseWidth(cls) {
  const m = cls.match(/(?:^|\s)w-\[(\d+(?:\.\d+)?)px\]/);
  return m ? { width: parseFloat(m[1]) } : null;
}

/** h-[365px] → { height: 365 } */
function parseHeight(cls) {
  const m = cls.match(/(?:^|\s)h-\[(\d+(?:\.\d+)?)px\]/);
  return m ? { height: parseFloat(m[1]) } : null;
}

/** text-center → { textAlign: "center" } */
function parseTextAlign(cls) {
  if (/text-center/.test(cls)) return { textAlign: 'center' };
  return null;
}

/** left-[432px] → { left: 432 } */
function parseLeft(cls) {
  const m = cls.match(/left-\[(\d+(?:\.\d+)?)px\]/);
  return m ? { left: parseFloat(m[1]) } : null;
}

/** top-[1234px] → { top: 1234 } */
function parseTop(cls) {
  const m = cls.match(/top-\[(\d+(?:\.\d+)?)px\]/);
  return m ? { top: parseFloat(m[1]) } : null;
}

/** -translate-x-1/2 + left-[calc(50%...)] → 중앙 정렬 힌트 */
function parseCenterHint(cls) {
  if (/-translate-x-1\/2/.test(cls) && /left-\[calc\(50%/.test(cls)) {
    return { alignHint: 'center' };
  }
  return null;
}

/**
 * 이미지 크롭 감지:
 * h-[276.42%] left-[-493.07%] w-[652.38%] top-[-39.22%]
 */
function parseImageCrop(cls) {
  const wMatch = cls.match(/w-\[(\d+(?:\.\d+)?)%\]/);
  const hMatch = cls.match(/h-\[(\d+(?:\.\d+)?)%\]/);
  const lMatch = cls.match(/left-\[(-?\d+(?:\.\d+)?)%\]/);
  const tMatch = cls.match(/top-\[(-?\d+(?:\.\d+)?)%\]/);

  if (wMatch && (parseFloat(wMatch[1]) > 100 || (lMatch && parseFloat(lMatch[1]) < 0))) {
    return {
      imageCrop: {
        width: wMatch ? `${wMatch[1]}%` : null,
        height: hMatch ? `${hMatch[1]}%` : null,
        left: lMatch ? `${lMatch[1]}%` : null,
        top: tMatch ? `${tMatch[1]}%` : null,
      },
    };
  }
  return null;
}

/** bg-[#f9bb34] → { backgroundColor: "#f9bb34" } */
function parseBgColor(cls) {
  const m = cls.match(/bg-\[(#[0-9a-fA-F]{3,8})\]/);
  return m ? { backgroundColor: m[1].toLowerCase() } : null;
}

/** rounded-[10px] → { borderRadius: 10 } */
function parseBorderRadius(cls) {
  const m = cls.match(/rounded-\[(\d+(?:\.\d+)?)px\]/);
  return m ? { borderRadius: parseFloat(m[1]) } : null;
}

// ── 모든 파서 ──
const PARSERS = [
  parseFontSize,
  parseColor,
  parseFontWeight,
  parseLineHeight,
  parseWidth,
  parseHeight,
  parseTextAlign,
  parseLeft,
  parseTop,
  parseCenterHint,
  parseImageCrop,
  parseBgColor,
  parseBorderRadius,
];

/**
 * className 문자열에서 모든 의도값을 추출
 */
function parseClassName(className) {
  const result = {};
  for (const parser of PARSERS) {
    const parsed = parser(className);
    if (parsed) Object.assign(result, parsed);
  }
  return result;
}

/**
 * JSX 문자열에서 data-node-id별 의도값 맵을 추출
 * @returns {{ [nodeId: string]: { className: string, intended: object, tagName: string } }}
 */
function parseMcpSource(jsxString) {
  const nodeMap = {};

  // data-node-id="42:353" 를 포함하는 요소에서 className과 태그를 추출
  // 패턴: <tagName className="..." ... data-node-id="XX:YY"
  //    or: <tagName ... data-node-id="XX:YY" ... className="..."
  const elementRegex = /<(\w+)\s[^>]*?data-node-id="([^"]+)"[^>]*>/g;
  let match;

  while ((match = elementRegex.exec(jsxString)) !== null) {
    const fullTag = match[0];
    const tagName = match[1];
    const nodeId = match[2];

    // className 추출
    const clsMatch = fullTag.match(/className="([^"]+)"/);
    const className = clsMatch ? clsMatch[1] : '';

    const intended = parseClassName(className);

    // 부모-자식 관계를 위해 className에 "contents"가 있으면 표시
    if (/\bcontents\b/.test(className)) {
      intended._isContents = true;
    }

    nodeMap[nodeId] = { className, intended, tagName };
  }

  return nodeMap;
}

/**
 * 부모 컨테이너 폭 대비 정렬 의도를 추론
 * @param {object} nodeMap - parseMcpSource 결과
 * @param {number} containerWidth - 부모 컨테이너 폭 (기본 1052)
 * @param {number} containerLeft - 부모 컨테이너 left 오프셋 (기본 186)
 */
function inferAlignment(nodeMap, containerWidth = 1052, containerLeft = 186) {
  for (const [nodeId, node] of Object.entries(nodeMap)) {
    const { intended } = node;
    if (intended.alignHint) continue; // 이미 중앙 힌트 있으면 스킵
    if (intended.left == null || intended.width == null) continue;

    const relativeLeft = intended.left - containerLeft;
    const elementRight = relativeLeft + intended.width;
    const leftMargin = relativeLeft;
    const rightMargin = containerWidth - elementRight;

    // 양쪽 마진 차이가 컨테이너 폭의 10% 이내면 중앙 정렬로 추론
    if (Math.abs(leftMargin - rightMargin) < containerWidth * 0.1) {
      intended.inferredAlign = 'center';
    } else if (relativeLeft < containerWidth * 0.1) {
      intended.inferredAlign = 'left';
    } else if (rightMargin < containerWidth * 0.1) {
      intended.inferredAlign = 'right';
    }
  }

  return nodeMap;
}

// ── CLI ──
if (require.main === module) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: node tools/parse-mcp.js <mcp-source.jsx>');
    process.exit(1);
  }

  const jsx = fs.readFileSync(path.resolve(inputPath), 'utf-8');
  const nodeMap = parseMcpSource(jsx);
  inferAlignment(nodeMap);

  // 의도값이 있는 노드만 출력
  const meaningful = {};
  for (const [id, data] of Object.entries(nodeMap)) {
    if (Object.keys(data.intended).length > 0) {
      meaningful[id] = data;
    }
  }

  console.log(JSON.stringify(meaningful, null, 2));
  console.log(`\n[parse-mcp] ${Object.keys(meaningful).length}개 노드에서 의도값 추출 완료`);
}

module.exports = { parseMcpSource, parseClassName, inferAlignment };
