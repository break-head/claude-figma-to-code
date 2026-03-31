# Figma-to-Code Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Figma URL을 입력하면 바닐라 HTML/CSS/JS 단일 페이지를 생성하고, 브라우저 live-preview에서 스타일/텍스트를 실시간 수정할 수 있는 Claude Code 플러그인을 구현한다.

**Architecture:** tools/ 디렉토리에 Node.js 스크립트 파이프라인을 구성한다. pipeline.js가 오케스트레이터로서 token-extractor → download-assets → inject-ids → live-server 순으로 실행한다. live-server는 정적 파일 서빙 + WebSocket 기반 파일 수정 API + 브라우저 오버레이(overlay.js)를 제공한다. Claude는 Figma MCP 호출 → 코드 생성 → `node tools/pipeline.js output/` 3단계만 수행한다.

**Tech Stack:** Node.js (>=18), cheerio (HTML 파싱), ws (WebSocket), chokidar (파일 감시)

**Spec:** `docs/superpowers/specs/2026-03-31-figma-to-code-phase1-design.md`

---

## File Structure

```
figma-to-code/
├── .claude-plugin/
│   ├── plugin.json              (modify — version, skills, tools 경로 추가)
│   └── marketplace.json         (exists — 변경 없음)
├── .mcp.json                    (create — Figma remote MCP 번들)
├── .gitignore                   (create)
├── skills/
│   └── figma-to-code/
│       └── SKILL.md             (modify — tools 연동 흐름 반영)
├── tools/
│   ├── package.json             (create — 공유 의존성)
│   ├── pipeline.js              (create — 오케스트레이터)
│   ├── token-extractor.js       (create — Figma 데이터 → 디자인 토큰)
│   ├── download-assets.js       (create — 이미지 다운로드)
│   ├── inject-ids.js            (create — data-element-id 삽입)
│   └── live-server/
│       ├── server.js            (create — 정적 서빙 + WebSocket + 수정 API)
│       └── overlay.js           (create — 브라우저 오버레이 스크립트)
├── tools/__tests__/
│   ├── token-extractor.test.js  (create)
│   ├── download-assets.test.js  (create)
│   └── inject-ids.test.js       (create)
├── commands/
│   └── figma-mcp-setup.md       (create — MCP 연결 트러블슈팅 가이드)
└── docs/
    └── superpowers/
        ├── specs/
        └── plans/
```

---

### Task 1: 프로젝트 스캐폴딩

**Files:**
- Create: `tools/package.json`
- Create: `.gitignore`
- Create: `.mcp.json`

- [ ] **Step 1: git 초기화**

```bash
cd /Users/leejuhwan/Desktop/figma-to-code
git init
```

- [ ] **Step 2: .gitignore 생성**

```gitignore
node_modules/
output/
.DS_Store
*.log
```

- [ ] **Step 3: tools/package.json 생성**

```json
{
  "name": "figma-to-code-tools",
  "version": "0.1.0",
  "private": true,
  "description": "Figma-to-Code pipeline tools",
  "scripts": {
    "test": "node --test tools/__tests__/*.test.js",
    "pipeline": "node tools/pipeline.js"
  },
  "dependencies": {
    "cheerio": "^1.0.0",
    "chokidar": "^4.0.0",
    "ws": "^8.18.0"
  }
}
```

- [ ] **Step 4: 의존성 설치**

```bash
cd /Users/leejuhwan/Desktop/figma-to-code
npm install
```

Expected: `node_modules/` 생성, `package-lock.json` 생성

- [ ] **Step 5: .mcp.json 생성**

Figma remote MCP를 플러그인에 번들:

```json
{
  "mcpServers": {
    "figma": {
      "type": "url",
      "url": "https://mcp.figma.com/mcp"
    }
  }
}
```

- [ ] **Step 6: 커밋**

```bash
git add .gitignore package.json package-lock.json tools/package.json .mcp.json
git commit -m "chore: 프로젝트 스캐폴딩 — 의존성, gitignore, Figma MCP 설정"
```

---

### Task 2: token-extractor.js

Figma MCP 응답 데이터(`.figma-data.json`)에서 색상, 폰트, 간격을 추출하여 `.design-tokens.json`으로 저장한다.

**Files:**
- Create: `tools/token-extractor.js`
- Create: `tools/__tests__/token-extractor.test.js`

- [ ] **Step 1: 테스트 파일 작성**

```js
// tools/__tests__/token-extractor.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { extractTokens } = require('../token-extractor.js');

describe('extractTokens', () => {
  it('색상 토큰을 추출한다', () => {
    const figmaData = {
      nodes: {
        'node-1': {
          fills: [{ type: 'SOLID', color: { r: 0.878, g: 0, b: 0.302, a: 1 } }],
          name: 'Primary Button'
        }
      }
    };
    const tokens = extractTokens(figmaData);
    assert.ok(tokens.colors);
    assert.ok(Object.keys(tokens.colors).length > 0);
  });

  it('폰트 토큰을 추출한다', () => {
    const figmaData = {
      nodes: {
        'node-1': {
          type: 'TEXT',
          style: {
            fontFamily: 'Poppins',
            fontSize: 32,
            fontWeight: 700
          },
          name: 'Heading'
        },
        'node-2': {
          type: 'TEXT',
          style: {
            fontFamily: 'Inter',
            fontSize: 16,
            fontWeight: 400
          },
          name: 'Body'
        }
      }
    };
    const tokens = extractTokens(figmaData);
    assert.ok(tokens.fonts);
    assert.ok(Object.keys(tokens.fonts).length > 0);
  });

  it('간격 토큰을 추출한다', () => {
    const figmaData = {
      nodes: {
        'node-1': {
          type: 'FRAME',
          paddingTop: 16,
          paddingRight: 32,
          paddingBottom: 16,
          paddingLeft: 32,
          itemSpacing: 8
        }
      }
    };
    const tokens = extractTokens(figmaData);
    assert.ok(tokens.spacing);
    assert.ok(Object.keys(tokens.spacing).length > 0);
  });

  it('빈 데이터를 처리한다', () => {
    const tokens = extractTokens({});
    assert.deepStrictEqual(tokens, { colors: {}, fonts: {}, spacing: {} });
  });

  it('중복 색상을 제거한다', () => {
    const figmaData = {
      nodes: {
        'node-1': {
          fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }]
        },
        'node-2': {
          fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }]
        }
      }
    };
    const tokens = extractTokens(figmaData);
    const colorValues = Object.values(tokens.colors);
    const unique = [...new Set(colorValues)];
    assert.strictEqual(colorValues.length, unique.length);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
node --test tools/__tests__/token-extractor.test.js
```

Expected: FAIL — `Cannot find module '../token-extractor.js'`

- [ ] **Step 3: token-extractor.js 구현**

```js
// tools/token-extractor.js
const fs = require('node:fs');
const path = require('node:path');

/**
 * Figma RGBA(0~1) → hex 문자열 변환
 */
function rgbaToHex(color) {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
}

/**
 * 노드 트리를 재귀 순회하며 모든 노드를 flat 배열로 반환
 */
function flattenNodes(data) {
  const nodes = [];
  if (data.nodes) {
    for (const node of Object.values(data.nodes)) {
      nodes.push(node);
    }
  }
  if (data.children) {
    for (const child of data.children) {
      nodes.push(child, ...flattenNodes(child));
    }
  }
  return nodes;
}

/**
 * Figma 데이터에서 디자인 토큰을 추출한다.
 */
function extractTokens(figmaData) {
  const colors = {};
  const fonts = {};
  const spacingSet = new Set();

  const nodes = flattenNodes(figmaData);

  for (const node of nodes) {
    // 색상 추출 — SOLID fill만
    if (node.fills && Array.isArray(node.fills)) {
      for (const fill of node.fills) {
        if (fill.type === 'SOLID' && fill.color) {
          const hex = rgbaToHex(fill.color);
          if (!Object.values(colors).includes(hex)) {
            const key = `color-${Object.keys(colors).length + 1}`;
            colors[key] = hex;
          }
        }
      }
    }

    // 폰트 추출 — TEXT 노드
    if (node.type === 'TEXT' && node.style) {
      const { fontFamily, fontSize, fontWeight } = node.style;
      if (fontFamily && !Object.values(fonts).some(f => f.family === fontFamily)) {
        const key = Object.keys(fonts).length === 0 ? 'heading' : `font-${Object.keys(fonts).length + 1}`;
        fonts[key] = { family: fontFamily, size: fontSize, weight: fontWeight };
      }
    }

    // 간격 추출 — FRAME 노드의 padding, itemSpacing
    if (node.type === 'FRAME' || node.paddingTop !== undefined) {
      for (const prop of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'itemSpacing']) {
        if (node[prop] !== undefined && node[prop] > 0) {
          spacingSet.add(node[prop]);
        }
      }
    }
  }

  // 간격을 정규화된 스케일로 변환
  const sortedSpacing = [...spacingSet].sort((a, b) => a - b);
  const spacingLabels = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'];
  const spacing = {};
  sortedSpacing.forEach((val, i) => {
    const label = i < spacingLabels.length ? spacingLabels[i] : `space-${val}`;
    spacing[label] = val;
  });

  return { colors, fonts, spacing };
}

/**
 * CLI 실행: node tools/token-extractor.js <outputDir>
 */
function run(outputDir) {
  const figmaDataPath = path.join(outputDir, '.figma-data.json');
  const tokensPath = path.join(outputDir, '.design-tokens.json');

  if (!fs.existsSync(figmaDataPath)) {
    console.warn('[token-extractor] .figma-data.json not found, skipping.');
    return null;
  }

  const figmaData = JSON.parse(fs.readFileSync(figmaDataPath, 'utf-8'));
  const tokens = extractTokens(figmaData);
  fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 2));
  console.log(`[token-extractor] Extracted ${Object.keys(tokens.colors).length} colors, ${Object.keys(tokens.fonts).length} fonts, ${Object.keys(tokens.spacing).length} spacing values.`);
  return tokens;
}

if (require.main === module) {
  const outputDir = process.argv[2];
  if (!outputDir) {
    console.error('Usage: node tools/token-extractor.js <outputDir>');
    process.exit(1);
  }
  run(outputDir);
}

module.exports = { extractTokens, rgbaToHex, run };
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
node --test tools/__tests__/token-extractor.test.js
```

Expected: 모든 5개 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
git add tools/token-extractor.js tools/__tests__/token-extractor.test.js
git commit -m "feat: token-extractor — Figma 데이터에서 디자인 토큰 추출"
```

---

### Task 3: download-assets.js

`assets-manifest.json`의 이미지 URL 목록을 병렬 다운로드하여 `output/assets/`에 저장한다.

**Files:**
- Create: `tools/download-assets.js`
- Create: `tools/__tests__/download-assets.test.js`

- [ ] **Step 1: 테스트 파일 작성**

```js
// tools/__tests__/download-assets.test.js
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseManifest, sanitizeFilename } = require('../download-assets.js');

const TMP_DIR = path.join(__dirname, '__tmp_assets_test__');

beforeEach(() => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('parseManifest', () => {
  it('유효한 매니페스트를 파싱한다', () => {
    const manifest = [
      { url: 'https://example.com/img.png', filename: 'hero.png' },
      { url: 'https://example.com/logo.svg', filename: 'logo.svg' }
    ];
    const manifestPath = path.join(TMP_DIR, 'assets-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));

    const result = parseManifest(manifestPath);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].filename, 'hero.png');
  });

  it('빈 매니페스트를 처리한다', () => {
    const manifestPath = path.join(TMP_DIR, 'assets-manifest.json');
    fs.writeFileSync(manifestPath, '[]');

    const result = parseManifest(manifestPath);
    assert.strictEqual(result.length, 0);
  });

  it('파일이 없으면 빈 배열을 반환한다', () => {
    const result = parseManifest(path.join(TMP_DIR, 'nonexistent.json'));
    assert.deepStrictEqual(result, []);
  });
});

describe('sanitizeFilename', () => {
  it('특수문자를 제거한다', () => {
    assert.strictEqual(sanitizeFilename('hero image (1).png'), 'hero-image-1.png');
  });

  it('한글 파일명을 유지한다', () => {
    const result = sanitizeFilename('배경이미지.png');
    assert.ok(result.endsWith('.png'));
  });

  it('빈 이름에 fallback을 제공한다', () => {
    const result = sanitizeFilename('');
    assert.ok(result.length > 0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
node --test tools/__tests__/download-assets.test.js
```

Expected: FAIL — `Cannot find module '../download-assets.js'`

- [ ] **Step 3: download-assets.js 구현**

```js
// tools/download-assets.js
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const http = require('node:http');

/**
 * 파일명을 안전한 형태로 변환
 */
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

/**
 * 매니페스트 JSON을 파싱한다.
 */
function parseManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    console.warn(`[download-assets] ${manifestPath} not found.`);
    return [];
  }
  const data = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  return Array.isArray(data) ? data : [];
}

/**
 * URL에서 파일을 다운로드한다.
 */
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

/**
 * 1x1 투명 PNG placeholder 생성
 */
function createPlaceholder(destPath) {
  const placeholder = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB' +
    'Nl7BcQAAAABJRU5ErkJggg==',
    'base64'
  );
  fs.writeFileSync(destPath, placeholder);
}

/**
 * 매니페스트의 모든 이미지를 병렬 다운로드한다.
 * @param {string} outputDir - output 디렉토리 경로
 * @param {number} concurrency - 최대 동시 다운로드 수
 */
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
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
node --test tools/__tests__/download-assets.test.js
```

Expected: 모든 5개 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
git add tools/download-assets.js tools/__tests__/download-assets.test.js
git commit -m "feat: download-assets — 매니페스트 기반 이미지 병렬 다운로드"
```

---

### Task 4: inject-ids.js

`index.html`의 주요 HTML 요소에 `data-element-id` 속성을 자동 삽입한다. live-preview에서 브라우저 요소와 소스 파일을 매핑하는 핵심 도구.

**Files:**
- Create: `tools/inject-ids.js`
- Create: `tools/__tests__/inject-ids.test.js`

- [ ] **Step 1: 테스트 파일 작성**

```js
// tools/__tests__/inject-ids.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { injectIds, TARGET_TAGS } = require('../inject-ids.js');

describe('injectIds', () => {
  it('시맨틱 요소에 data-element-id를 삽입한다', () => {
    const html = '<html><body><header><h1>Title</h1></header><main><p>Hello</p></main></body></html>';
    const result = injectIds(html);
    assert.ok(result.includes('data-element-id="el-'));
    assert.ok(result.includes('<header data-element-id='));
    assert.ok(result.includes('<h1 data-element-id='));
    assert.ok(result.includes('<main data-element-id='));
    assert.ok(result.includes('<p data-element-id='));
  });

  it('이미 data-element-id가 있는 요소는 건너뛴다', () => {
    const html = '<div data-element-id="existing"><p>Hello</p></div>';
    const result = injectIds(html);
    assert.ok(result.includes('data-element-id="existing"'));
    // p에는 새 ID가 삽입되어야 함
    assert.ok(result.includes('<p data-element-id="el-'));
  });

  it('ID가 순차적으로 부여된다', () => {
    const html = '<section><h2>A</h2><h2>B</h2></section>';
    const result = injectIds(html);
    assert.ok(result.includes('el-001'));
    assert.ok(result.includes('el-002'));
    assert.ok(result.includes('el-003'));
  });

  it('빈 HTML을 처리한다', () => {
    const result = injectIds('');
    assert.strictEqual(result, '');
  });

  it('script, style, link, meta 태그는 건너뛴다', () => {
    const html = '<head><meta charset="utf-8"><link rel="stylesheet" href="styles.css"><style>body{}</style></head><body><p>Hello</p></body>';
    const result = injectIds(html);
    assert.ok(!result.includes('<meta data-element-id'));
    assert.ok(!result.includes('<link data-element-id'));
    assert.ok(!result.includes('<style data-element-id'));
    assert.ok(result.includes('<p data-element-id'));
  });
});

describe('TARGET_TAGS', () => {
  it('주요 시맨틱 태그를 포함한다', () => {
    assert.ok(TARGET_TAGS.includes('header'));
    assert.ok(TARGET_TAGS.includes('main'));
    assert.ok(TARGET_TAGS.includes('section'));
    assert.ok(TARGET_TAGS.includes('div'));
    assert.ok(TARGET_TAGS.includes('p'));
    assert.ok(TARGET_TAGS.includes('img'));
    assert.ok(TARGET_TAGS.includes('button'));
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
node --test tools/__tests__/inject-ids.test.js
```

Expected: FAIL — `Cannot find module '../inject-ids.js'`

- [ ] **Step 3: inject-ids.js 구현**

```js
// tools/inject-ids.js
const fs = require('node:fs');
const path = require('node:path');
const cheerio = require('cheerio');

const TARGET_TAGS = [
  'header', 'nav', 'main', 'section', 'article', 'aside', 'footer',
  'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'a', 'button', 'img', 'figure', 'figcaption',
  'ul', 'ol', 'li', 'span', 'blockquote', 'form', 'input', 'textarea', 'select',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'video', 'audio', 'picture', 'source'
];

const SKIP_TAGS = ['html', 'head', 'body', 'script', 'style', 'link', 'meta', 'title', 'br', 'hr'];

/**
 * HTML 문자열의 주요 요소에 data-element-id를 삽입한다.
 * @param {string} html - 원본 HTML 문자열
 * @returns {string} - data-element-id가 삽입된 HTML
 */
function injectIds(html) {
  if (!html || html.trim() === '') return html;

  const $ = cheerio.load(html, { decodeEntities: false });
  let counter = 0;

  const selector = TARGET_TAGS.join(', ');
  $(selector).each((_, el) => {
    const $el = $(el);
    if ($el.attr('data-element-id')) return; // 이미 있으면 건너뜀
    if (SKIP_TAGS.includes(el.tagName)) return;

    counter++;
    const id = `el-${String(counter).padStart(3, '0')}`;
    $el.attr('data-element-id', id);
  });

  return $.html();
}

/**
 * CLI 실행: node tools/inject-ids.js <outputDir>
 */
function run(outputDir) {
  const htmlPath = path.join(outputDir, 'index.html');

  if (!fs.existsSync(htmlPath)) {
    console.warn('[inject-ids] index.html not found, skipping.');
    return;
  }

  const html = fs.readFileSync(htmlPath, 'utf-8');
  const result = injectIds(html);
  fs.writeFileSync(htmlPath, result);

  const count = (result.match(/data-element-id="/g) || []).length;
  console.log(`[inject-ids] Injected ${count} element IDs.`);
}

if (require.main === module) {
  const outputDir = process.argv[2];
  if (!outputDir) {
    console.error('Usage: node tools/inject-ids.js <outputDir>');
    process.exit(1);
  }
  run(outputDir);
}

module.exports = { injectIds, TARGET_TAGS, run };
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
node --test tools/__tests__/inject-ids.test.js
```

Expected: 모든 7개 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
git add tools/inject-ids.js tools/__tests__/inject-ids.test.js
git commit -m "feat: inject-ids — HTML 요소에 data-element-id 자동 삽입"
```

---

### Task 5: live-server/server.js

정적 파일 서빙 + WebSocket 기반 파일 수정 API + 파일 감시 자동 리로드.

**Files:**
- Create: `tools/live-server/server.js`

- [ ] **Step 1: server.js 구현**

```js
// tools/live-server/server.js
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocketServer } = require('ws');
const cheerio = require('cheerio');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/**
 * overlay.js 스크립트를 HTML에 주입한다.
 */
function injectOverlay(html, wsPort) {
  const overlayPath = path.join(__dirname, 'overlay.js');
  const overlayCode = fs.readFileSync(overlayPath, 'utf-8');
  const injection = `
<script>
  window.__FIGMA_TO_CODE_WS_PORT__ = ${wsPort};
  ${overlayCode}
</script>`;
  return html.replace('</body>', `${injection}\n</body>`);
}

/**
 * CSS 파일에서 특정 selector의 속성 값을 변경한다.
 */
function updateCssProperty(cssContent, elementId, property, value) {
  const selector = `[data-element-id="${elementId}"]`;
  const selectorRegex = new RegExp(
    `(\\[data-element-id="${elementId}"\\]\\s*\\{[^}]*)${property}\\s*:[^;]*;`,
    's'
  );

  if (selectorRegex.test(cssContent)) {
    return cssContent.replace(selectorRegex, `$1${property}: ${value};`);
  }

  // selector가 없으면 새로 추가
  const existingSelectorRegex = new RegExp(`\\[data-element-id="${elementId}"\\]\\s*\\{`, 's');
  if (existingSelectorRegex.test(cssContent)) {
    return cssContent.replace(
      existingSelectorRegex,
      `[data-element-id="${elementId}"] {\n  ${property}: ${value};`
    );
  }

  // selector 자체가 없으면 파일 끝에 추가
  return cssContent + `\n\n${selector} {\n  ${property}: ${value};\n}\n`;
}

/**
 * HTML 파일에서 특정 요소의 텍스트를 변경한다.
 */
function updateHtmlText(htmlContent, elementId, newText) {
  const $ = cheerio.load(htmlContent, { decodeEntities: false });
  const $el = $(`[data-element-id="${elementId}"]`);
  if ($el.length === 0) return htmlContent;

  // 자식 요소가 있으면 직접 텍스트 노드만 변경
  if ($el.children().length > 0) {
    $el.contents().filter(function() { return this.type === 'text'; }).first().replaceWith(newText);
  } else {
    $el.text(newText);
  }
  return $.html();
}

function startServer(outputDir, port = 3100, wsPort = 3101) {
  // --- HTTP 서버 ---
  const httpServer = http.createServer((req, res) => {
    let filePath = path.join(outputDir, req.url === '/' ? 'index.html' : req.url);
    const ext = path.extname(filePath);

    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    if (ext === '.html') {
      const html = fs.readFileSync(filePath, 'utf-8');
      const injected = injectOverlay(html, wsPort);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(injected);
    } else {
      const stream = fs.createReadStream(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      stream.pipe(res);
    }
  });

  // --- WebSocket 서버 ---
  const wss = new WebSocketServer({ port: wsPort });
  const clients = new Set();

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      const htmlPath = path.join(outputDir, 'index.html');
      const cssPath = path.join(outputDir, 'styles.css');

      if (msg.type === 'style-update') {
        if (!fs.existsSync(cssPath)) return;
        const css = fs.readFileSync(cssPath, 'utf-8');
        const updated = updateCssProperty(css, msg.elementId, msg.property, msg.value);
        fs.writeFileSync(cssPath, updated);
      }

      if (msg.type === 'text-update') {
        if (!fs.existsSync(htmlPath)) return;
        const html = fs.readFileSync(htmlPath, 'utf-8');
        const updated = updateHtmlText(html, msg.elementId, msg.content);
        fs.writeFileSync(htmlPath, updated);
      }
    });
  });

  function broadcast(data) {
    const payload = JSON.stringify(data);
    for (const client of clients) {
      if (client.readyState === 1) client.send(payload);
    }
  }

  // --- 파일 감시 ---
  let debounceTimer = null;
  const chokidar = require('chokidar');
  const watcher = chokidar.watch(outputDir, {
    ignored: /(^|[/\\])\../, // dotfiles 무시
    ignoreInitial: true,
  });

  watcher.on('change', (changedPath) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      broadcast({ type: 'reload' });
    }, 200);
  });

  httpServer.listen(port, () => {
    console.log(`[live-server] Serving at http://localhost:${port}`);
    console.log(`[live-server] WebSocket at ws://localhost:${wsPort}`);
    console.log(`[live-server] Watching ${outputDir} for changes...`);
  });

  return { httpServer, wss, watcher };
}

if (require.main === module) {
  const outputDir = process.argv[2];
  const port = parseInt(process.argv[3] || '3100', 10);
  const wsPort = parseInt(process.argv[4] || '3101', 10);

  if (!outputDir) {
    console.error('Usage: node tools/live-server/server.js <outputDir> [port] [wsPort]');
    process.exit(1);
  }

  startServer(path.resolve(outputDir), port, wsPort);
}

module.exports = { startServer, updateCssProperty, updateHtmlText, injectOverlay };
```

- [ ] **Step 2: 수동 테스트용 샘플 HTML 생성 및 서버 기동 확인**

```bash
mkdir -p /tmp/figma-test-output
cat > /tmp/figma-test-output/index.html << 'HTMLEOF'
<!DOCTYPE html>
<html><head><link rel="stylesheet" href="styles.css"></head>
<body><header data-element-id="el-001"><h1 data-element-id="el-002">Test</h1></header></body>
</html>
HTMLEOF
cat > /tmp/figma-test-output/styles.css << 'CSSEOF'
[data-element-id="el-002"] { color: #333; font-size: 32px; }
CSSEOF
cd /Users/leejuhwan/Desktop/figma-to-code && timeout 3 node tools/live-server/server.js /tmp/figma-test-output || true
```

Expected: `[live-server] Serving at http://localhost:3100` 출력 후 3초 뒤 종료

- [ ] **Step 3: 커밋**

```bash
git add tools/live-server/server.js
git commit -m "feat: live-server — 정적 서빙 + WebSocket 파일 수정 API"
```

---

### Task 6: live-server/overlay.js

브라우저에 주입되는 오버레이 스크립트. 요소 선택 + 수정 패널 + WebSocket 통신.

**Files:**
- Create: `tools/live-server/overlay.js`

- [ ] **Step 1: overlay.js 구현 — 코어 (요소 선택 + 하이라이트)**

```js
// tools/live-server/overlay.js
// 이 파일은 server.js가 HTML에 인라인으로 주입한다.
// 브라우저에서 실행되는 코드이므로 Node.js API를 사용하지 않는다.
(function() {
  'use strict';

  const WS_PORT = window.__FIGMA_TO_CODE_WS_PORT__ || 3101;
  let ws = null;
  let selectedEl = null;
  let panelEl = null;
  let highlightEl = null;
  let undoStack = [];
  let redoStack = [];

  // --- WebSocket 연결 ---
  function connectWs() {
    ws = new WebSocket(`ws://localhost:${WS_PORT}`);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'reload') location.reload();
    };
    ws.onclose = () => setTimeout(connectWs, 1000);
  }
  connectWs();

  function sendWs(msg) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  // --- 하이라이트 오버레이 ---
  function createHighlight() {
    const el = document.createElement('div');
    el.id = '__ftc-highlight__';
    Object.assign(el.style, {
      position: 'fixed', pointerEvents: 'none', border: '2px solid #E0004D',
      borderRadius: '2px', transition: 'all 0.1s ease', zIndex: '99998',
      display: 'none', backgroundColor: 'rgba(224, 0, 77, 0.05)'
    });
    document.body.appendChild(el);
    return el;
  }

  function updateHighlight(target) {
    if (!highlightEl) highlightEl = createHighlight();
    if (!target) { highlightEl.style.display = 'none'; return; }
    const rect = target.getBoundingClientRect();
    Object.assign(highlightEl.style, {
      display: 'block', top: rect.top + 'px', left: rect.left + 'px',
      width: rect.width + 'px', height: rect.height + 'px'
    });
  }

  // --- 수정 패널 ---
  function createPanel() {
    const panel = document.createElement('div');
    panel.id = '__ftc-panel__';
    panel.innerHTML = `
      <style>
        #__ftc-panel__ {
          position: fixed; right: 16px; top: 16px; width: 280px;
          background: #fff; border: 1px solid #ddd; border-radius: 8px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.12); z-index: 99999;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 13px; color: #333; max-height: 80vh; overflow-y: auto;
        }
        #__ftc-panel__ .ftc-header {
          padding: 12px 16px; border-bottom: 1px solid #eee;
          font-weight: 600; display: flex; justify-content: space-between; align-items: center;
        }
        #__ftc-panel__ .ftc-close { cursor: pointer; font-size: 18px; color: #999; background: none; border: none; }
        #__ftc-panel__ .ftc-body { padding: 12px 16px; }
        #__ftc-panel__ .ftc-row {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 8px; gap: 8px;
        }
        #__ftc-panel__ .ftc-label { font-size: 11px; color: #888; min-width: 60px; }
        #__ftc-panel__ .ftc-input {
          flex: 1; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px;
          font-size: 12px; outline: none;
        }
        #__ftc-panel__ .ftc-input:focus { border-color: #E0004D; }
        #__ftc-panel__ .ftc-color { width: 32px; height: 24px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; padding: 0; }
        #__ftc-panel__ .ftc-section { font-size: 11px; font-weight: 600; color: #E0004D; margin: 12px 0 6px; text-transform: uppercase; }
        #__ftc-panel__ .ftc-select {
          flex: 1; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px;
        }
        #__ftc-panel__ .ftc-slider { flex: 1; }
        #__ftc-panel__ .ftc-spacing-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; flex: 1; }
        #__ftc-panel__ .ftc-spacing-grid input { width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 4px; font-size: 11px; text-align: center; }
      </style>
      <div class="ftc-header">
        <span class="ftc-tag"></span>
        <button class="ftc-close">&times;</button>
      </div>
      <div class="ftc-body">
        <div class="ftc-section">Text</div>
        <div class="ftc-row">
          <span class="ftc-label">Content</span>
          <input class="ftc-input" data-prop="text" placeholder="Text content">
        </div>

        <div class="ftc-section">Typography</div>
        <div class="ftc-row">
          <span class="ftc-label">Size</span>
          <input class="ftc-input" data-prop="font-size" type="number" min="1" style="width:60px">
          <span style="font-size:11px;color:#888">px</span>
        </div>
        <div class="ftc-row">
          <span class="ftc-label">Weight</span>
          <select class="ftc-select" data-prop="font-weight">
            <option value="300">300 Light</option>
            <option value="400">400 Regular</option>
            <option value="500">500 Medium</option>
            <option value="600">600 SemiBold</option>
            <option value="700">700 Bold</option>
          </select>
        </div>

        <div class="ftc-section">Colors</div>
        <div class="ftc-row">
          <span class="ftc-label">Text</span>
          <input class="ftc-color" data-prop="color" type="color">
          <input class="ftc-input" data-prop="color-hex" style="width:80px" placeholder="#000000">
        </div>
        <div class="ftc-row">
          <span class="ftc-label">Background</span>
          <input class="ftc-color" data-prop="background-color" type="color">
          <input class="ftc-input" data-prop="background-color-hex" style="width:80px" placeholder="#FFFFFF">
        </div>

        <div class="ftc-section">Spacing</div>
        <div class="ftc-row">
          <span class="ftc-label">Padding</span>
          <div class="ftc-spacing-grid">
            <input data-prop="padding-top" type="number" min="0" placeholder="Top">
            <input data-prop="padding-right" type="number" min="0" placeholder="Right">
            <input data-prop="padding-bottom" type="number" min="0" placeholder="Bottom">
            <input data-prop="padding-left" type="number" min="0" placeholder="Left">
          </div>
        </div>
        <div class="ftc-row">
          <span class="ftc-label">Margin</span>
          <div class="ftc-spacing-grid">
            <input data-prop="margin-top" type="number" min="0" placeholder="Top">
            <input data-prop="margin-right" type="number" min="0" placeholder="Right">
            <input data-prop="margin-bottom" type="number" min="0" placeholder="Bottom">
            <input data-prop="margin-left" type="number" min="0" placeholder="Left">
          </div>
        </div>

        <div class="ftc-section">Effects</div>
        <div class="ftc-row">
          <span class="ftc-label">Radius</span>
          <input class="ftc-input" data-prop="border-radius" type="number" min="0" style="width:60px">
          <span style="font-size:11px;color:#888">px</span>
        </div>
        <div class="ftc-row">
          <span class="ftc-label">Opacity</span>
          <input class="ftc-slider" data-prop="opacity" type="range" min="0" max="1" step="0.05">
          <span class="ftc-opacity-val" style="font-size:11px;width:30px;text-align:right">1</span>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
    return panel;
  }

  function getComputedVal(el, prop) {
    return getComputedStyle(el).getPropertyValue(prop).trim();
  }

  function rgbToHex(rgb) {
    const match = rgb.match(/\d+/g);
    if (!match || match.length < 3) return '#000000';
    return '#' + match.slice(0, 3).map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
  }

  function populatePanel(el) {
    if (!panelEl) panelEl = createPanel();
    panelEl.style.display = 'block';
    const id = el.getAttribute('data-element-id');
    panelEl.querySelector('.ftc-tag').textContent = `<${el.tagName.toLowerCase()}> ${id}`;

    // Text
    const textInput = panelEl.querySelector('[data-prop="text"]');
    const directText = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ');
    textInput.value = directText || el.textContent.substring(0, 100);

    // Typography
    panelEl.querySelector('[data-prop="font-size"]').value = parseInt(getComputedVal(el, 'font-size')) || 16;
    panelEl.querySelector('[data-prop="font-weight"]').value = getComputedVal(el, 'font-weight') || '400';

    // Colors
    const textColor = rgbToHex(getComputedVal(el, 'color'));
    panelEl.querySelector('[data-prop="color"]').value = textColor;
    panelEl.querySelector('[data-prop="color-hex"]').value = textColor;
    const bgColor = rgbToHex(getComputedVal(el, 'background-color'));
    panelEl.querySelector('[data-prop="background-color"]').value = bgColor;
    panelEl.querySelector('[data-prop="background-color-hex"]').value = bgColor;

    // Spacing
    ['padding', 'margin'].forEach(type => {
      ['top', 'right', 'bottom', 'left'].forEach(dir => {
        const input = panelEl.querySelector(`[data-prop="${type}-${dir}"]`);
        input.value = parseInt(getComputedVal(el, `${type}-${dir}`)) || 0;
      });
    });

    // Effects
    panelEl.querySelector('[data-prop="border-radius"]').value = parseInt(getComputedVal(el, 'border-radius')) || 0;
    const opacity = parseFloat(getComputedVal(el, 'opacity')) || 1;
    panelEl.querySelector('[data-prop="opacity"]').value = opacity;
    panelEl.querySelector('.ftc-opacity-val').textContent = opacity;
  }

  // --- 이벤트 바인딩 ---
  function bindPanelEvents() {
    if (!panelEl) return;

    panelEl.querySelector('.ftc-close').onclick = () => {
      panelEl.style.display = 'none';
      selectedEl = null;
      updateHighlight(null);
    };

    // 스타일 변경 핸들러
    function handleStyleChange(prop, value) {
      if (!selectedEl) return;
      const id = selectedEl.getAttribute('data-element-id');

      // undo 스택에 저장
      undoStack.push({ id, prop, oldValue: getComputedVal(selectedEl, prop) });
      redoStack = [];

      // 즉시 브라우저 반영
      selectedEl.style[prop] = value;

      // 서버에 전송
      sendWs({ type: 'style-update', elementId: id, property: prop, value });
    }

    // Text
    panelEl.querySelector('[data-prop="text"]').addEventListener('input', (e) => {
      if (!selectedEl) return;
      const id = selectedEl.getAttribute('data-element-id');
      undoStack.push({ id, type: 'text', oldValue: selectedEl.textContent });
      redoStack = [];
      // 자식 요소가 없으면 직접 변경
      if (selectedEl.children.length === 0) {
        selectedEl.textContent = e.target.value;
      }
      sendWs({ type: 'text-update', elementId: id, content: e.target.value });
    });

    // Font size
    panelEl.querySelector('[data-prop="font-size"]').addEventListener('input', (e) => {
      handleStyleChange('font-size', e.target.value + 'px');
    });

    // Font weight
    panelEl.querySelector('[data-prop="font-weight"]').addEventListener('change', (e) => {
      handleStyleChange('font-weight', e.target.value);
    });

    // Color picker + hex sync
    panelEl.querySelector('[data-prop="color"]').addEventListener('input', (e) => {
      panelEl.querySelector('[data-prop="color-hex"]').value = e.target.value;
      handleStyleChange('color', e.target.value);
    });
    panelEl.querySelector('[data-prop="color-hex"]').addEventListener('change', (e) => {
      panelEl.querySelector('[data-prop="color"]').value = e.target.value;
      handleStyleChange('color', e.target.value);
    });

    // Background color picker + hex sync
    panelEl.querySelector('[data-prop="background-color"]').addEventListener('input', (e) => {
      panelEl.querySelector('[data-prop="background-color-hex"]').value = e.target.value;
      handleStyleChange('background-color', e.target.value);
    });
    panelEl.querySelector('[data-prop="background-color-hex"]').addEventListener('change', (e) => {
      panelEl.querySelector('[data-prop="background-color"]').value = e.target.value;
      handleStyleChange('background-color', e.target.value);
    });

    // Spacing (padding, margin)
    ['padding', 'margin'].forEach(type => {
      ['top', 'right', 'bottom', 'left'].forEach(dir => {
        panelEl.querySelector(`[data-prop="${type}-${dir}"]`).addEventListener('input', (e) => {
          handleStyleChange(`${type}-${dir}`, e.target.value + 'px');
        });
      });
    });

    // Border radius
    panelEl.querySelector('[data-prop="border-radius"]').addEventListener('input', (e) => {
      handleStyleChange('border-radius', e.target.value + 'px');
    });

    // Opacity
    panelEl.querySelector('[data-prop="opacity"]').addEventListener('input', (e) => {
      panelEl.querySelector('.ftc-opacity-val').textContent = e.target.value;
      handleStyleChange('opacity', e.target.value);
    });
  }

  // --- 메인 이벤트 리스너 ---
  function isOverlayElement(el) {
    return el.closest('#__ftc-panel__') || el.closest('#__ftc-highlight__');
  }

  document.addEventListener('mousemove', (e) => {
    if (isOverlayElement(e.target)) return;
    const target = e.target.closest('[data-element-id]');
    updateHighlight(target);
  });

  document.addEventListener('click', (e) => {
    if (isOverlayElement(e.target)) return;
    e.preventDefault();
    e.stopPropagation();

    const target = e.target.closest('[data-element-id]');
    if (!target) return;

    selectedEl = target;
    populatePanel(target);
    if (!panelEl.__bound) {
      bindPanelEvents();
      panelEl.__bound = true;
    }
  }, true);

  // --- Undo/Redo ---
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        // Redo
        const action = redoStack.pop();
        if (!action) return;
        const el = document.querySelector(`[data-element-id="${action.id}"]`);
        if (!el) return;
        if (action.type === 'text') {
          undoStack.push({ ...action, oldValue: el.textContent });
          el.textContent = action.newValue;
        } else {
          undoStack.push({ ...action, oldValue: getComputedVal(el, action.prop) });
          el.style[action.prop] = action.newValue;
        }
      } else {
        // Undo
        const action = undoStack.pop();
        if (!action) return;
        const el = document.querySelector(`[data-element-id="${action.id}"]`);
        if (!el) return;
        if (action.type === 'text') {
          redoStack.push({ ...action, newValue: el.textContent });
          el.textContent = action.oldValue;
          sendWs({ type: 'text-update', elementId: action.id, content: action.oldValue });
        } else {
          redoStack.push({ ...action, newValue: getComputedVal(el, action.prop) });
          el.style[action.prop] = action.oldValue;
          sendWs({ type: 'style-update', elementId: action.id, property: action.prop, value: action.oldValue });
        }
      }
    }
  });

  // --- ESC로 선택 해제 ---
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (panelEl) panelEl.style.display = 'none';
      selectedEl = null;
      updateHighlight(null);
    }
  });
})();
```

- [ ] **Step 2: 커밋**

```bash
git add tools/live-server/overlay.js
git commit -m "feat: overlay.js — 브라우저 요소 선택 + 수정 패널 + undo/redo"
```

---

### Task 7: pipeline.js

모든 도구를 순차 실행하는 오케스트레이터.

**Files:**
- Create: `tools/pipeline.js`

- [ ] **Step 1: pipeline.js 구현**

```js
// tools/pipeline.js
const path = require('node:path');
const fs = require('node:fs');
const { execSync } = require('node:child_process');

async function run(outputDir) {
  const absDir = path.resolve(outputDir);
  const toolsDir = __dirname;

  console.log(`\n=== figma-to-code pipeline ===`);
  console.log(`Output: ${absDir}\n`);

  // 0. 의존성 확인 — node_modules가 없으면 자동 설치
  const nodeModulesPath = path.join(path.dirname(toolsDir), 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    console.log('[pipeline] Installing dependencies...');
    execSync('npm install', { cwd: path.dirname(toolsDir), stdio: 'inherit' });
  }

  // 1. Token Extractor
  console.log('\n--- Step 1: Token Extractor ---');
  const { run: runTokens } = require('./token-extractor.js');
  runTokens(absDir);

  // 2. Download Assets
  console.log('\n--- Step 2: Download Assets ---');
  const { run: runDownload } = require('./download-assets.js');
  await runDownload(absDir);

  // 3. Inject IDs
  console.log('\n--- Step 3: Inject Element IDs ---');
  const { run: runInject } = require('./inject-ids.js');
  runInject(absDir);

  // 4. Live Server
  console.log('\n--- Step 4: Live Server ---');
  const { startServer } = require('./live-server/server.js');
  startServer(absDir);

  console.log('\n=== Pipeline complete ===');
  console.log(`Preview: http://localhost:3100`);
  console.log(`Press Ctrl+C to stop.\n`);
}

if (require.main === module) {
  const outputDir = process.argv[2];
  if (!outputDir) {
    console.error('Usage: node tools/pipeline.js <outputDir>');
    console.error('Example: node tools/pipeline.js output/');
    process.exit(1);
  }

  if (!fs.existsSync(outputDir)) {
    console.error(`[pipeline] Directory not found: ${outputDir}`);
    process.exit(1);
  }

  run(outputDir).catch((err) => {
    console.error('[pipeline] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { run };
```

- [ ] **Step 2: 통합 테스트 — 샘플 output으로 파이프라인 실행**

```bash
mkdir -p /tmp/figma-pipeline-test/assets
cat > /tmp/figma-pipeline-test/index.html << 'EOF'
<!DOCTYPE html>
<html><head><link rel="stylesheet" href="styles.css"></head>
<body>
<header><h1>Hello Figma</h1></header>
<main><section><p>This is a test page.</p></section></main>
</body></html>
EOF
cat > /tmp/figma-pipeline-test/styles.css << 'EOF'
:root { --color-primary: #E0004D; }
body { font-family: sans-serif; }
EOF
echo '[]' > /tmp/figma-pipeline-test/assets-manifest.json
cd /Users/leejuhwan/Desktop/figma-to-code && timeout 5 node tools/pipeline.js /tmp/figma-pipeline-test || true
```

Expected:
- Token Extractor: `.figma-data.json not found, skipping.`
- Download Assets: `No assets to download.`
- Inject Element IDs: `Injected N element IDs.`
- Live Server: `Serving at http://localhost:3100`

- [ ] **Step 3: inject 결과 확인**

```bash
grep 'data-element-id' /tmp/figma-pipeline-test/index.html
```

Expected: `header`, `h1`, `main`, `section`, `p`에 `data-element-id` 속성이 삽입됨

- [ ] **Step 4: 커밋**

```bash
git add tools/pipeline.js
git commit -m "feat: pipeline.js — 원커맨드 후처리 오케스트레이터"
```

---

### Task 8: SKILL.md 업데이트

tools 연동 흐름을 반영하여 스킬 문서를 재작성한다.

**Files:**
- Modify: `skills/figma-to-code/SKILL.md`

- [ ] **Step 1: SKILL.md 재작성**

```markdown
---
name: figma-to-code
description: Figma URL을 넣으면 배포 가능한 HTML/CSS/JS를 생성하고 브라우저에서 실시간 수정할 수 있습니다. "figma", "피그마", "디자인을 코드로", "HTML로 만들어줘", "figma.com" URL이 포함된 요청에 사용됩니다.
---

# Figma-to-Code

Figma 디자인 URL을 받아 배포 가능한 Vanilla HTML/CSS/JS 단일 페이지를 생성한다.
생성 후 브라우저 live-preview에서 요소를 선택해 스타일/텍스트를 실시간으로 수정할 수 있다.

## 트리거

다음과 같은 요청에 이 스킬이 활성화된다:
- "이 Figma 디자인을 HTML로 만들어줘"
- "figma.com/design/... 이걸 코드로 변환해줘"
- "/figma-to-code <URL>"
- 메시지에 figma.com URL이 포함된 경우

## 실행 단계

### Step 1: Figma URL 파싱

사용자 메시지에서 Figma URL을 추출하고 파싱한다:
- `figma.com/design/:fileKey/:fileName?node-id=:nodeId` → nodeId의 `-`를 `:`로 변환
- `figma.com/file/:fileKey/:fileName?node-id=:nodeId` → 동일
- `figma.com/design/:fileKey/branch/:branchKey/:fileName` → branchKey를 fileKey로 사용

node-id가 없으면 사용자에게 특정 프레임 URL을 요청한다:
> "전체 파일 URL이네요. Figma에서 변환할 프레임을 선택하고 우클릭 → 'Copy link to selection'으로 특정 프레임 URL을 알려주세요."

### Step 2: Figma MCP로 디자인 데이터 수집

Figma MCP 도구를 호출한다:

1. **`get_design_context`**(fileKey, nodeId): 디자인 데이터, 코드 힌트, 스크린샷
2. **`get_metadata`**(fileKey, nodeId): 프레임 이름, 크기, 구조

### Step 3: Frame Analyzer — mobile/desktop 판단

get_metadata 결과로 프레임 유형을 판단한다. 단순 width가 아닌 복합 판단:

1. **프레임 이름** — "Mobile", "Desktop", "375", "1440" 등 키워드 → 확정
2. **크기 비율** — width < height → 모바일 가능성 높음
3. **width 구간** — 보조 지표 (<=480 모바일, >=1024 데스크탑)
4. **레이아웃 구조** — 단일 컬럼 → 모바일, 다중 컬럼 → 데스크탑
5. **형제 프레임** — 동일 섹션에 375px + 1440px이 나란히 있으면 반응형 세트
6. **확신 못하면** → 사용자에게 "이 프레임은 모바일인가요, 데스크탑인가요?" 질문

결과에 따른 분기:
- **데스크탑만** → "모바일 반응형도 추가할까요?" 질문. Yes면 모바일 URL 요청
- **모바일만** → 모바일 전용 코드 생성
- **둘 다 제공** → Step 3-1 Responsive Mapper 실행

#### Step 3-1: Responsive Mapper (둘 다 제공된 경우)

두 프레임의 디자인 데이터를 **코드 생성 전에** 매핑한다:
- 노드 매칭: 이름, 구조, 텍스트 내용 기반으로 같은 요소 판단
- 차이점 추출: layout, font-size, spacing, 표시/숨김 차이 기록
- 구조 차이 감지: 3열→1열, 데스크탑에만 있는 요소, 순서 변경
- 통합 스펙 생성: 하나의 HTML 구조 + desktop CSS 기본 + `@media` mobile 오버라이드

### Step 4: 코드 생성

다음 규칙을 반드시 따른다:

**HTML:**
- 시맨틱 HTML5 태그: `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<footer>`
- BEM 스타일 클래스명: `.hero`, `.hero__title`, `.hero__cta`
- 접근성: alt 텍스트, heading 계층 (h1 > h2 > h3)
- `styles.css`와 `script.js`를 외부 파일로 링크

**CSS:**
- `:root`에 디자인 토큰을 CSS 변수로 정의 (색상, 폰트, 간격)
- 색상/폰트 하드코딩 금지 — 반드시 CSS 변수 참조
- Flexbox 또는 CSS Grid로 레이아웃
- 반응형이면 desktop-first + `max-width` 미디어 쿼리

**JS:**
- 인터랙션이 필요할 때만 생성. Vanilla JS만 사용.

**이미지:**
- Figma에서 이미지 URL 수집 → `output/assets-manifest.json`에 목록 작성
- HTML에서 `<img src="assets/파일명.확장자">`로 참조

**출력 파일:**
- `output/index.html`
- `output/styles.css`
- `output/script.js` (필요 시에만)
- `output/assets-manifest.json` — 이미지 URL 목록 JSON 배열:
  ```json
  [{ "url": "https://figma-image-url/...", "filename": "hero.png" }]
  ```
- `output/.figma-data.json` — `get_design_context` 응답 원본 저장 (Write 도구로)

### Step 5: 후처리 파이프라인 실행

코드 생성이 완료되면 다음 명령을 실행한다:

```bash
node tools/pipeline.js output/
```

이 명령이 자동으로 수행하는 작업:
1. 디자인 토큰 추출 및 검증
2. 이미지 에셋 다운로드 (`assets-manifest.json` → `output/assets/`)
3. HTML 요소에 `data-element-id` 자동 삽입
4. Live-preview 서버 기동 (`http://localhost:3100`)

### Step 6: 결과 안내

```
생성 완료!

output/index.html — 메인 HTML
output/styles.css — 스타일시트
output/assets/    — 이미지 에셋

Live Preview가 http://localhost:3100 에서 실행 중입니다.
브라우저에서 요소를 클릭하면 스타일과 텍스트를 직접 수정할 수 있습니다.

수정하려면 이 대화에서 바로 요청하세요:
  "히어로 섹션 배경색을 파란색으로 바꿔줘"
  "버튼 텍스트를 '무료 시작'으로 변경해줘"
  "카드 레이아웃을 3열에서 2열로 바꿔줘"
```

## 수정 워크플로우

사용자가 수정을 요청하면:
1. `output/` 폴더의 해당 파일을 Read로 읽는다
2. 정확한 위치를 찾아 Edit으로 수정한다
3. CSS 변수 체계를 유지한다 (색상 변경 시 `:root` 변수를 수정)
4. live-preview 서버가 자동으로 브라우저에 반영한다

## 주의사항

- Figma Pro/Org Dev seat 이상 권장 (Starter/View/Collab은 월 6회 API 제한)
- 단일 페이지(랜딩, 프로모션)에 최적화. 복잡한 SPA/멀티페이지에는 부적합
- live-preview 수정은 스타일/텍스트만 지원 (Phase 1)
```

- [ ] **Step 2: 커밋**

```bash
git add skills/figma-to-code/SKILL.md
git commit -m "docs: SKILL.md — tools 파이프라인 연동 흐름 반영"
```

---

### Task 9: 플러그인 설정 업데이트

plugin.json, .mcp.json을 최종 구조에 맞게 업데이트한다.

**Files:**
- Modify: `.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`

- [ ] **Step 1: plugin.json 업데이트**

```json
{
  "name": "figma-to-code",
  "version": "0.1.0",
  "description": "Figma URL을 넣으면 HTML/CSS/JS를 생성하고 브라우저에서 실시간 수정할 수 있는 플러그인",
  "author": {
    "name": "leejuhwan"
  },
  "keywords": ["figma", "html", "css", "design-to-code", "live-preview"],
  "skills": "./skills/",
  "license": "MIT"
}
```

- [ ] **Step 2: 커밋**

```bash
git add .claude-plugin/plugin.json
git commit -m "chore: plugin.json — keywords, license 추가"
```

---

### Task 10: figma-mcp-setup 커맨드

Figma MCP 연결 문제 발생 시 사용하는 트러블슈팅 가이드.

**Files:**
- Create: `commands/figma-mcp-setup.md`

- [ ] **Step 1: figma-mcp-setup.md 작성**

```markdown
---
name: figma-mcp-setup
description: Figma MCP 연결 확인 및 트러블슈팅 가이드
---

# Figma MCP Setup

figma-to-code 스킬이 Figma 디자인 데이터를 가져오려면 Figma MCP 서버가 연결되어 있어야 합니다.

## 연결 확인

1. `/mcp` 명령으로 MCP 서버 목록을 확인하세요.
2. `figma` 서버가 목록에 있고 상태가 정상이면 사용 가능합니다.
3. `whoami` 도구를 호출하여 Figma 계정 인증 상태를 확인하세요.

## 연결이 안 되어 있다면

이 플러그인에 `.mcp.json`이 번들되어 있으므로, 플러그인이 설치되면 자동으로 Figma remote MCP가 등록됩니다.

수동으로 등록하려면:
```
claude mcp add --transport http --scope user figma https://mcp.figma.com/mcp
```

## 인증

Figma MCP는 Figma 계정 인증이 필요합니다. `/mcp`에서 figma 서버를 선택하고 인증 절차를 완료하세요.

## 요금제 참고

- **Pro/Org Dev seat 이상**: API 호출 제한 없음 (권장)
- **Starter/View/Collab**: 월 6회 제한 — figma-to-code 스킬과 궁합이 약함
```

- [ ] **Step 2: 커밋**

```bash
git add commands/figma-mcp-setup.md
git commit -m "docs: figma-mcp-setup 트러블슈팅 커맨드 추가"
```

---

### Task 11: 최종 통합 테스트

모든 도구가 파이프라인에서 올바르게 연동되는지 확인한다.

**Files:**
- (변경 없음 — 테스트만)

- [ ] **Step 1: 전체 유닛 테스트 실행**

```bash
cd /Users/leejuhwan/Desktop/figma-to-code && npm test
```

Expected: 모든 테스트 PASS

- [ ] **Step 2: 풀 파이프라인 E2E 테스트**

샘플 output 디렉토리를 만들어 전체 파이프라인을 실행한다:

```bash
mkdir -p /tmp/figma-e2e-test
cat > /tmp/figma-e2e-test/index.html << 'HTMLEOF'
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>E2E Test</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header>
    <nav>
      <a href="#">Logo</a>
      <ul><li><a href="#">Menu</a></li></ul>
    </nav>
  </header>
  <main>
    <section>
      <h1>Hero Title</h1>
      <p>Hero description text.</p>
      <button>CTA Button</button>
    </section>
    <section>
      <div>
        <h2>Card 1</h2>
        <p>Card description.</p>
      </div>
      <div>
        <h2>Card 2</h2>
        <p>Card description.</p>
      </div>
    </section>
  </main>
  <footer>
    <p>Footer text</p>
  </footer>
</body>
</html>
HTMLEOF

cat > /tmp/figma-e2e-test/styles.css << 'CSSEOF'
:root {
  --color-primary: #E0004D;
  --color-text: #333;
  --color-bg: #fff;
  --font-heading: 'Poppins', sans-serif;
  --font-body: 'Inter', sans-serif;
}
body { font-family: var(--font-body); color: var(--color-text); background: var(--color-bg); margin: 0; }
h1, h2 { font-family: var(--font-heading); }
button { background: var(--color-primary); color: #fff; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; }
CSSEOF

echo '[]' > /tmp/figma-e2e-test/assets-manifest.json
```

```bash
cd /Users/leejuhwan/Desktop/figma-to-code && timeout 5 node tools/pipeline.js /tmp/figma-e2e-test || true
```

Expected:
1. `[token-extractor] .figma-data.json not found, skipping.`
2. `[download-assets] No assets to download.`
3. `[inject-ids] Injected N element IDs.` (15개 이상)
4. `[live-server] Serving at http://localhost:3100`

- [ ] **Step 3: inject 결과 검증**

```bash
grep -c 'data-element-id' /tmp/figma-e2e-test/index.html
```

Expected: 15 이상 (header, nav, a, ul, li, a, main, section, h1, p, button, section, div, h2, p, div, h2, p, footer, p)

- [ ] **Step 4: 최종 커밋**

```bash
cd /Users/leejuhwan/Desktop/figma-to-code
git add -A
git commit -m "chore: Phase 1 구현 완료 — figma-to-code pipeline + live-preview"
```
