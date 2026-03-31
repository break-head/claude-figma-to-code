# Figma-to-Code v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Figma MCP 코드 기반 섹션별 변환 + 후처리 정규화 + Playwright 시각적 보정 루프로 Figma 디자인에 충실한 바닐라 HTML/CSS/JS를 생성하는 Claude Code 플러그인

**Architecture:** Figma MCP `get_design_context` → Claude가 섹션별 React+Tailwind→바닐라 변환 → 후처리 스크립트(assemble→normalize→download→inject-ids) → Playwright 스크린샷 캡처 → Figma 원본과 비교 보정 루프(최대 2회)

**Tech Stack:** Node.js, cheerio (HTML 파싱), chokidar (파일 감시), playwright (스크린샷)

---

## File Structure

### 새로 생성

| 파일 | 책임 |
|---|---|
| `tools/assemble.js` | `output/sections/*.html` + `*.css`를 index.html + styles.css로 합침 |
| `tools/normalize.js` | CSS 변수 네이밍 통일, 하드코딩 색상→변수 교체, Figma 토큰 불일치 교정 |
| `tools/postprocess.js` | 원커맨드 오케스트레이터 (assemble → token-extractor → normalize → download-assets → inject-ids) |
| `tools/preview-server.js` | 정적 파일 서빙 + 자동 리로드 (수정 기능 없음) |
| `tools/capture.js` | Playwright로 localhost:3100 스크린샷 캡처 |
| `tools/__tests__/assemble.test.js` | assemble.js 테스트 |
| `tools/__tests__/normalize.test.js` | normalize.js 테스트 |
| `tools/__tests__/postprocess.test.js` | postprocess.js 테스트 |
| `tools/__tests__/preview-server.test.js` | preview-server.js 테스트 |
| `tools/__tests__/capture.test.js` | capture.js 테스트 |

### 수정

| 파일 | 변경 내용 |
|---|---|
| `skills/figma-to-code/SKILL.md` | v2 프로세스로 전면 재작성 |
| `package.json` | playwright 추가, @babel/* 제거, scripts 업데이트 |

### 삭제

| 파일 | 이유 |
|---|---|
| `tools/react-to-vanilla.js` | Claude 직접 변환으로 대체 |
| `tools/pipeline.js` | postprocess.js로 대체 |
| `tools/live-server/server.js` | preview-server.js로 대체 |
| `tools/live-server/overlay.js` | 수정 기능 Phase 1 제외 |

### 유지 (변경 없음)

| 파일 | 이유 |
|---|---|
| `tools/token-extractor.js` | 그대로 사용. 인터페이스 동일 |
| `tools/download-assets.js` | 그대로 사용. 인터페이스 동일 |
| `tools/inject-ids.js` | 그대로 사용. 인터페이스 동일 |
| `tools/__tests__/token-extractor.test.js` | 기존 테스트 유지 |
| `tools/__tests__/download-assets.test.js` | 기존 테스트 유지 |
| `tools/__tests__/inject-ids.test.js` | 기존 테스트 유지 |

---

## Task 1: v1 코드 정리 + 의존성 업데이트

**Files:**
- Delete: `tools/react-to-vanilla.js`
- Delete: `tools/pipeline.js`
- Delete: `tools/live-server/server.js`
- Delete: `tools/live-server/overlay.js`
- Modify: `package.json`

- [ ] **Step 1: v1 파일 삭제**

```bash
rm tools/react-to-vanilla.js
rm tools/pipeline.js
rm -rf tools/live-server/
```

- [ ] **Step 2: package.json 업데이트**

`package.json`을 다음으로 교체:

```json
{
  "name": "figma-to-code-tools",
  "version": "0.2.0",
  "private": true,
  "description": "Figma-to-Code v2 pipeline tools",
  "scripts": {
    "test": "node --test tools/__tests__/*.test.js",
    "postprocess": "node tools/postprocess.js",
    "preview": "node tools/preview-server.js",
    "capture": "node tools/capture.js"
  },
  "dependencies": {
    "cheerio": "^1.0.0",
    "chokidar": "^4.0.0",
    "playwright": "^1.52.0"
  }
}
```

- [ ] **Step 3: 의존성 설치**

```bash
rm -rf node_modules package-lock.json
npm install
```

Run: `npm install`
Expected: `added N packages` 성공 메시지. @babel/* 제거됨, playwright 추가됨.

- [ ] **Step 4: 기존 테스트가 여전히 통과하는지 확인**

Run: `node --test tools/__tests__/token-extractor.test.js tools/__tests__/inject-ids.test.js tools/__tests__/download-assets.test.js`
Expected: 모든 테스트 PASS

- [ ] **Step 5: Playwright 브라우저 설치**

```bash
npx playwright install chromium
```

Expected: Chromium 다운로드 완료

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "chore: v1 코드 정리 + playwright 의존성 추가"
```

---

## Task 2: assemble.js — 섹션 합치기

**Files:**
- Create: `tools/assemble.js`
- Test: `tools/__tests__/assemble.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`tools/__tests__/assemble.test.js`:

```js
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assemble } = require('../assemble.js');

const TMP_DIR = path.join(__dirname, '__tmp_assemble_test__');

beforeEach(() => {
  fs.mkdirSync(path.join(TMP_DIR, 'sections'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('assemble', () => {
  it('섹션 HTML과 CSS를 순서대로 합친다', () => {
    fs.writeFileSync(
      path.join(TMP_DIR, 'sections', '01-hero.html'),
      '<section class="hero"><h1>Hero</h1></section>'
    );
    fs.writeFileSync(
      path.join(TMP_DIR, 'sections', '01-hero.css'),
      '.hero { background: red; }'
    );
    fs.writeFileSync(
      path.join(TMP_DIR, 'sections', '02-features.html'),
      '<section class="features"><h2>Features</h2></section>'
    );
    fs.writeFileSync(
      path.join(TMP_DIR, 'sections', '02-features.css'),
      '.features { padding: 20px; }'
    );

    assemble(TMP_DIR);

    const html = fs.readFileSync(path.join(TMP_DIR, 'index.html'), 'utf-8');
    const css = fs.readFileSync(path.join(TMP_DIR, 'styles.css'), 'utf-8');

    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('<link rel="stylesheet" href="styles.css">'));
    assert.ok(html.indexOf('Hero') < html.indexOf('Features'));
    assert.ok(css.includes('.hero'));
    assert.ok(css.includes('.features'));
    assert.ok(css.indexOf('.hero') < css.indexOf('.features'));
  });

  it('CSS 파일이 없는 섹션도 처리한다', () => {
    fs.writeFileSync(
      path.join(TMP_DIR, 'sections', '01-hero.html'),
      '<section class="hero"><h1>Hero</h1></section>'
    );

    assemble(TMP_DIR);

    const html = fs.readFileSync(path.join(TMP_DIR, 'index.html'), 'utf-8');
    assert.ok(html.includes('Hero'));
    assert.ok(fs.existsSync(path.join(TMP_DIR, 'styles.css')));
  });

  it('sections 디렉토리가 비어있으면 빈 페이지를 생성한다', () => {
    assemble(TMP_DIR);

    const html = fs.readFileSync(path.join(TMP_DIR, 'index.html'), 'utf-8');
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('<body>'));
  });

  it(':root CSS 변수가 있으면 styles.css 최상단에 배치한다', () => {
    fs.writeFileSync(
      path.join(TMP_DIR, 'sections', '01-hero.html'),
      '<section class="hero"><h1>Hero</h1></section>'
    );
    fs.writeFileSync(
      path.join(TMP_DIR, 'sections', '01-hero.css'),
      ':root { --color-primary: #E0004D; }\n.hero { color: var(--color-primary); }'
    );
    fs.writeFileSync(
      path.join(TMP_DIR, 'sections', '02-footer.css'),
      ':root { --color-secondary: #1A1A1A; }\n.footer { color: var(--color-secondary); }'
    );
    fs.writeFileSync(
      path.join(TMP_DIR, 'sections', '02-footer.html'),
      '<footer class="footer">Footer</footer>'
    );

    assemble(TMP_DIR);

    const css = fs.readFileSync(path.join(TMP_DIR, 'styles.css'), 'utf-8');
    // :root 블록이 최상단에 합쳐져야 함
    const rootMatch = css.match(/:root\s*\{[^}]+\}/);
    assert.ok(rootMatch);
    assert.ok(rootMatch.index === 0 || css.indexOf(':root') < css.indexOf('.hero'));
  });

  it('script.js 링크를 포함한다 (script.js가 존재할 때)', () => {
    fs.writeFileSync(
      path.join(TMP_DIR, 'sections', '01-hero.html'),
      '<section><h1>Hero</h1></section>'
    );
    fs.writeFileSync(path.join(TMP_DIR, 'script.js'), 'console.log("ok")');

    assemble(TMP_DIR);

    const html = fs.readFileSync(path.join(TMP_DIR, 'index.html'), 'utf-8');
    assert.ok(html.includes('<script src="script.js"></script>'));
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test tools/__tests__/assemble.test.js`
Expected: FAIL — `Cannot find module '../assemble.js'`

- [ ] **Step 3: 구현**

`tools/assemble.js`:

```js
const fs = require('node:fs');
const path = require('node:path');

function getSections(sectionsDir) {
  if (!fs.existsSync(sectionsDir)) return [];

  const files = fs.readdirSync(sectionsDir).sort();
  const htmlFiles = files.filter(f => f.endsWith('.html'));

  return htmlFiles.map(htmlFile => {
    const name = htmlFile.replace('.html', '');
    const cssFile = name + '.css';
    const htmlContent = fs.readFileSync(path.join(sectionsDir, htmlFile), 'utf-8');
    const cssPath = path.join(sectionsDir, cssFile);
    const cssContent = fs.existsSync(cssPath)
      ? fs.readFileSync(cssPath, 'utf-8')
      : '';
    return { name, htmlContent, cssContent };
  });
}

function mergeCSS(sections) {
  const rootVars = [];
  const rules = [];

  for (const section of sections) {
    if (!section.cssContent) continue;

    let css = section.cssContent;
    const rootRegex = /:root\s*\{([^}]+)\}/g;
    let match;

    while ((match = rootRegex.exec(css)) !== null) {
      rootVars.push(match[1].trim());
      css = css.slice(0, match.index) + css.slice(match.index + match[0].length);
    }

    const trimmed = css.trim();
    if (trimmed) rules.push(`/* ${section.name} */\n${trimmed}`);
  }

  let merged = '';
  if (rootVars.length > 0) {
    merged += `:root {\n  ${rootVars.join('\n  ')}\n}\n\n`;
  }
  merged += rules.join('\n\n');

  return merged;
}

function assemble(outputDir) {
  const sectionsDir = path.join(outputDir, 'sections');
  const sections = getSections(sectionsDir);

  const bodyContent = sections.map(s => s.htmlContent).join('\n\n');
  const cssContent = mergeCSS(sections);

  const hasScript = fs.existsSync(path.join(outputDir, 'script.js'));
  const scriptTag = hasScript ? '\n    <script src="script.js"></script>' : '';

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="styles.css">
    <title>Page</title>
</head>
<body>
${bodyContent}${scriptTag}
</body>
</html>`;

  fs.writeFileSync(path.join(outputDir, 'index.html'), html);
  fs.writeFileSync(path.join(outputDir, 'styles.css'), cssContent);

  console.log(`[assemble] ${sections.length} sections → index.html + styles.css`);
}

if (require.main === module) {
  const outputDir = process.argv[2];
  if (!outputDir) {
    console.error('Usage: node tools/assemble.js <outputDir>');
    process.exit(1);
  }
  assemble(outputDir);
}

module.exports = { assemble, getSections, mergeCSS };
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test tools/__tests__/assemble.test.js`
Expected: 모든 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
git add tools/assemble.js tools/__tests__/assemble.test.js
git commit -m "feat: assemble.js — 섹션별 HTML/CSS를 단일 파일로 합치기"
```

---

## Task 3: normalize.js — CSS 정규화 + 토큰 검증

**Files:**
- Create: `tools/normalize.js`
- Test: `tools/__tests__/normalize.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`tools/__tests__/normalize.test.js`:

```js
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeCSS, replaceHardcodedColors } = require('../normalize.js');

const TMP_DIR = path.join(__dirname, '__tmp_normalize_test__');

beforeEach(() => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('replaceHardcodedColors', () => {
  it('하드코딩된 색상을 CSS 변수로 교체한다', () => {
    const css = ':root { --color-primary: #E0004D; }\n.hero { color: #E0004D; }';
    const result = replaceHardcodedColors(css);
    assert.ok(result.includes('color: var(--color-primary)'));
    assert.ok(!result.includes('color: #E0004D'));
  });

  it(':root 선언 자체는 교체하지 않는다', () => {
    const css = ':root { --color-primary: #E0004D; }\n.hero { color: #E0004D; }';
    const result = replaceHardcodedColors(css);
    assert.ok(result.includes('--color-primary: #E0004D'));
  });

  it('대소문자 무관하게 매칭한다', () => {
    const css = ':root { --color-primary: #e0004d; }\n.hero { color: #E0004D; }';
    const result = replaceHardcodedColors(css);
    assert.ok(result.includes('var(--color-primary)'));
  });

  it('CSS 변수가 없으면 원본을 그대로 반환한다', () => {
    const css = '.hero { color: red; }';
    const result = replaceHardcodedColors(css);
    assert.strictEqual(result, css);
  });
});

describe('normalizeCSS', () => {
  it('토큰 파일과 비교하여 누락된 색상을 경고한다', () => {
    const cssPath = path.join(TMP_DIR, 'styles.css');
    const tokensPath = path.join(TMP_DIR, '.design-tokens.json');

    fs.writeFileSync(cssPath, ':root { --color-primary: #E0004D; }\n.hero { color: var(--color-primary); }');
    fs.writeFileSync(tokensPath, JSON.stringify({
      colors: { 'color-1': '#E0004D', 'color-2': '#1A1A1A' },
      fonts: {},
      spacing: {}
    }));

    const warnings = normalizeCSS(TMP_DIR);
    // #1A1A1A가 CSS에 없으므로 경고
    assert.ok(warnings.some(w => w.includes('#1A1A1A')));
  });

  it('토큰 파일이 없으면 색상 교체만 수행한다', () => {
    const cssPath = path.join(TMP_DIR, 'styles.css');
    fs.writeFileSync(cssPath, ':root { --color-primary: #E0004D; }\n.hero { color: #E0004D; }');

    const warnings = normalizeCSS(TMP_DIR);
    assert.ok(Array.isArray(warnings));

    const css = fs.readFileSync(cssPath, 'utf-8');
    assert.ok(css.includes('var(--color-primary)'));
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test tools/__tests__/normalize.test.js`
Expected: FAIL — `Cannot find module '../normalize.js'`

- [ ] **Step 3: 구현**

`tools/normalize.js`:

```js
const fs = require('node:fs');
const path = require('node:path');

function parseRootVars(css) {
  const vars = {};
  const rootMatch = css.match(/:root\s*\{([^}]+)\}/);
  if (!rootMatch) return vars;

  const declarations = rootMatch[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g);
  for (const m of declarations) {
    vars[`--${m[1]}`] = m[2].trim();
  }
  return vars;
}

function replaceHardcodedColors(css) {
  const vars = parseRootVars(css);
  if (Object.keys(vars).length === 0) return css;

  // Build color→variable map (hex only)
  const colorToVar = {};
  for (const [varName, value] of Object.entries(vars)) {
    const hexMatch = value.match(/^#[0-9a-fA-F]{3,8}$/);
    if (hexMatch) {
      colorToVar[value.toLowerCase()] = varName;
    }
  }

  if (Object.keys(colorToVar).length === 0) return css;

  // Split into :root block and rest
  const rootRegex = /(:root\s*\{[^}]+\})/;
  const parts = css.split(rootRegex);

  return parts.map(part => {
    if (part.match(/^:root\s*\{/)) return part; // Don't touch :root

    let result = part;
    for (const [hex, varName] of Object.entries(colorToVar)) {
      // Match hex colors (case insensitive) not inside variable declarations
      const hexRegex = new RegExp(
        `(?<!--[\\w-]+:\\s*)${hex.replace('#', '#')}(?![0-9a-fA-F])`,
        'gi'
      );
      result = result.replace(hexRegex, `var(${varName})`);
    }
    return result;
  }).join('');
}

function normalizeCSS(outputDir) {
  const cssPath = path.join(outputDir, 'styles.css');
  const tokensPath = path.join(outputDir, '.design-tokens.json');
  const warnings = [];

  if (!fs.existsSync(cssPath)) {
    warnings.push('[normalize] styles.css not found, skipping.');
    return warnings;
  }

  let css = fs.readFileSync(cssPath, 'utf-8');

  // Step 1: Replace hardcoded colors with CSS variables
  css = replaceHardcodedColors(css);

  // Step 2: Compare with Figma tokens if available
  if (fs.existsSync(tokensPath)) {
    const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf-8'));
    const cssLower = css.toLowerCase();

    // Check for colors in tokens not present in CSS
    if (tokens.colors) {
      for (const [key, hex] of Object.entries(tokens.colors)) {
        if (!cssLower.includes(hex.toLowerCase())) {
          const msg = `[normalize] Figma 토큰 색상 ${hex} (${key})이 CSS에 없습니다`;
          warnings.push(msg);
          console.warn(msg);
        }
      }
    }

    // Check for fonts in tokens not present in CSS
    if (tokens.fonts) {
      for (const [key, font] of Object.entries(tokens.fonts)) {
        if (font.family && !css.includes(font.family)) {
          const msg = `[normalize] Figma 토큰 폰트 "${font.family}" (${key})이 CSS에 없습니다`;
          warnings.push(msg);
          console.warn(msg);
        }
      }
    }
  }

  fs.writeFileSync(cssPath, css);
  console.log(`[normalize] CSS 정규화 완료. ${warnings.length}개 경고.`);
  return warnings;
}

if (require.main === module) {
  const outputDir = process.argv[2];
  if (!outputDir) {
    console.error('Usage: node tools/normalize.js <outputDir>');
    process.exit(1);
  }
  normalizeCSS(outputDir);
}

module.exports = { normalizeCSS, replaceHardcodedColors, parseRootVars };
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test tools/__tests__/normalize.test.js`
Expected: 모든 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
git add tools/normalize.js tools/__tests__/normalize.test.js
git commit -m "feat: normalize.js — CSS 변수 정규화 + Figma 토큰 검증"
```

---

## Task 4: preview-server.js — 정적 서버 + 자동 리로드

**Files:**
- Create: `tools/preview-server.js`
- Test: `tools/__tests__/preview-server.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`tools/__tests__/preview-server.test.js`:

```js
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { startServer } = require('../preview-server.js');

const TMP_DIR = path.join(__dirname, '__tmp_preview_test__');
const PORT = 3150; // 테스트용 포트

function httpGet(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${PORT}${urlPath}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    }).on('error', reject);
  });
}

beforeEach(() => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(path.join(TMP_DIR, 'index.html'), '<html><body><h1>Test</h1></body></html>');
  fs.writeFileSync(path.join(TMP_DIR, 'styles.css'), 'h1 { color: red; }');
});

afterEach(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('preview-server', () => {
  it('HTML 파일을 서빙한다', async () => {
    const server = startServer(TMP_DIR, PORT);
    try {
      const res = await httpGet('/');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.includes('<h1>Test</h1>'));
      assert.ok(res.headers['content-type'].includes('text/html'));
    } finally {
      server.close();
    }
  });

  it('CSS 파일을 서빙한다', async () => {
    const server = startServer(TMP_DIR, PORT);
    try {
      const res = await httpGet('/styles.css');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.includes('color: red'));
    } finally {
      server.close();
    }
  });

  it('없는 파일은 404를 반환한다', async () => {
    const server = startServer(TMP_DIR, PORT);
    try {
      const res = await httpGet('/nonexistent.html');
      assert.strictEqual(res.status, 404);
    } finally {
      server.close();
    }
  });

  it('자동 리로드 스크립트를 HTML에 주입한다', async () => {
    const server = startServer(TMP_DIR, PORT);
    try {
      const res = await httpGet('/');
      assert.ok(res.body.includes('new EventSource'));
    } finally {
      server.close();
    }
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test tools/__tests__/preview-server.test.js`
Expected: FAIL — `Cannot find module '../preview-server.js'`

- [ ] **Step 3: 구현**

`tools/preview-server.js`:

```js
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

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

const RELOAD_SCRIPT = `
<script>
(function() {
  var es = new EventSource('/__reload');
  es.onmessage = function() { location.reload(); };
})();
</script>`;

function injectReloadScript(html) {
  return html.replace('</body>', `${RELOAD_SCRIPT}\n</body>`);
}

function startServer(outputDir, port = 3100) {
  const sseClients = new Set();

  const server = http.createServer((req, res) => {
    // SSE endpoint for auto-reload
    if (req.url === '/__reload') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    const filePath = path.join(outputDir, req.url === '/' ? 'index.html' : req.url);
    const ext = path.extname(filePath);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    if (ext === '.html') {
      const html = fs.readFileSync(filePath, 'utf-8');
      const injected = injectReloadScript(html);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(injected);
    } else {
      const stream = fs.createReadStream(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      stream.pipe(res);
    }
  });

  // File watcher for auto-reload
  let watcher;
  try {
    const chokidar = require('chokidar');
    let debounceTimer = null;
    watcher = chokidar.watch(outputDir, {
      ignored: /(^|[/\\])\./,
      ignoreInitial: true,
    });
    watcher.on('change', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        for (const client of sseClients) {
          client.write('data: reload\n\n');
        }
      }, 200);
    });
  } catch {
    // chokidar not available, skip file watching
  }

  server.listen(port, () => {
    console.log(`[preview-server] http://localhost:${port}`);
  });

  // Attach close helper
  const originalClose = server.close.bind(server);
  server.close = (cb) => {
    if (watcher) watcher.close();
    for (const client of sseClients) client.end();
    originalClose(cb);
  };

  return server;
}

if (require.main === module) {
  const outputDir = process.argv[2] || 'output';
  const port = parseInt(process.argv[3] || '3100', 10);

  if (!fs.existsSync(outputDir)) {
    console.error(`[preview-server] Directory not found: ${outputDir}`);
    process.exit(1);
  }

  startServer(path.resolve(outputDir), port);
}

module.exports = { startServer, injectReloadScript };
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test tools/__tests__/preview-server.test.js`
Expected: 모든 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
git add tools/preview-server.js tools/__tests__/preview-server.test.js
git commit -m "feat: preview-server.js — 정적 서빙 + SSE 자동 리로드"
```

---

## Task 5: capture.js — Playwright 스크린샷

**Files:**
- Create: `tools/capture.js`
- Test: `tools/__tests__/capture.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`tools/__tests__/capture.test.js`:

```js
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { capture } = require('../capture.js');
const { startServer } = require('../preview-server.js');

const TMP_DIR = path.join(__dirname, '__tmp_capture_test__');
const PORT = 3160;

beforeEach(() => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(TMP_DIR, 'index.html'),
    '<html><body style="margin:0;width:400px;height:300px;background:red;"><h1>Test</h1></body></html>'
  );
});

afterEach(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('capture', () => {
  it('스크린샷을 PNG로 저장한다', async () => {
    const server = startServer(TMP_DIR, PORT);
    try {
      const screenshotPath = await capture({
        url: `http://localhost:${PORT}`,
        outputPath: path.join(TMP_DIR, '.preview-screenshot.png'),
        width: 400,
      });
      assert.ok(fs.existsSync(screenshotPath));
      const stat = fs.statSync(screenshotPath);
      assert.ok(stat.size > 0);
    } finally {
      server.close();
    }
  });

  it('지정한 viewport width로 캡처한다', async () => {
    const server = startServer(TMP_DIR, PORT);
    try {
      const screenshotPath = await capture({
        url: `http://localhost:${PORT}`,
        outputPath: path.join(TMP_DIR, 'test-capture.png'),
        width: 1440,
      });
      assert.ok(fs.existsSync(screenshotPath));
    } finally {
      server.close();
    }
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test tools/__tests__/capture.test.js`
Expected: FAIL — `Cannot find module '../capture.js'`

- [ ] **Step 3: 구현**

`tools/capture.js`:

```js
const path = require('node:path');

async function capture({ url, outputPath, width = 1440, deviceScaleFactor = 2 }) {
  const { chromium } = require('playwright');

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width, height: 800 },
    deviceScaleFactor,
  });

  await page.goto(url, { waitUntil: 'networkidle' });

  await page.screenshot({
    path: outputPath,
    fullPage: true,
  });

  await browser.close();

  console.log(`[capture] Screenshot saved: ${outputPath} (${width}px @ ${deviceScaleFactor}x)`);
  return outputPath;
}

if (require.main === module) {
  const url = process.argv[2] || 'http://localhost:3100';
  const outputPath = process.argv[3] || 'output/.preview-screenshot.png';
  const width = parseInt(process.argv[4] || '1440', 10);

  capture({ url, outputPath: path.resolve(outputPath), width }).catch(err => {
    console.error('[capture] Error:', err.message);
    process.exit(1);
  });
}

module.exports = { capture };
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test tools/__tests__/capture.test.js`
Expected: 모든 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
git add tools/capture.js tools/__tests__/capture.test.js
git commit -m "feat: capture.js — Playwright 스크린샷 캡처"
```

---

## Task 6: postprocess.js — 원커맨드 오케스트레이터

**Files:**
- Create: `tools/postprocess.js`
- Test: `tools/__tests__/postprocess.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`tools/__tests__/postprocess.test.js`:

```js
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { postprocess } = require('../postprocess.js');

const TMP_DIR = path.join(__dirname, '__tmp_postprocess_test__');

beforeEach(() => {
  fs.mkdirSync(path.join(TMP_DIR, 'sections'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('postprocess', () => {
  it('assemble → token-extractor → normalize → inject-ids 순서로 실행한다', async () => {
    // 섹션 파일 생성
    fs.writeFileSync(
      path.join(TMP_DIR, 'sections', '01-hero.html'),
      '<section class="hero"><h1>Hello</h1></section>'
    );
    fs.writeFileSync(
      path.join(TMP_DIR, 'sections', '01-hero.css'),
      ':root { --color-primary: #E0004D; }\n.hero { color: #E0004D; }'
    );

    // assets-manifest (빈 배열 — 다운로드 스킵)
    fs.writeFileSync(
      path.join(TMP_DIR, 'assets-manifest.json'),
      '[]'
    );

    const result = await postprocess(TMP_DIR);

    // assemble이 실행되었는지 확인
    assert.ok(fs.existsSync(path.join(TMP_DIR, 'index.html')));
    assert.ok(fs.existsSync(path.join(TMP_DIR, 'styles.css')));

    // inject-ids가 실행되었는지 확인
    const html = fs.readFileSync(path.join(TMP_DIR, 'index.html'), 'utf-8');
    assert.ok(html.includes('data-element-id'));

    // normalize가 실행되었는지 확인 (하드코딩 색상 → 변수)
    const css = fs.readFileSync(path.join(TMP_DIR, 'styles.css'), 'utf-8');
    assert.ok(css.includes('var(--color-primary)'));

    assert.ok(Array.isArray(result.warnings));
  });

  it('sections 디렉토리가 없어도 에러 없이 완료한다', async () => {
    fs.rmSync(path.join(TMP_DIR, 'sections'), { recursive: true, force: true });
    fs.writeFileSync(path.join(TMP_DIR, 'assets-manifest.json'), '[]');

    const result = await postprocess(TMP_DIR);
    assert.ok(fs.existsSync(path.join(TMP_DIR, 'index.html')));
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test tools/__tests__/postprocess.test.js`
Expected: FAIL — `Cannot find module '../postprocess.js'`

- [ ] **Step 3: 구현**

`tools/postprocess.js`:

```js
const path = require('node:path');
const fs = require('node:fs');

async function postprocess(outputDir) {
  const absDir = path.resolve(outputDir);

  console.log(`\n=== figma-to-code postprocess ===`);
  console.log(`Output: ${absDir}\n`);

  // 1. Assemble sections
  console.log('--- Step 1: Assemble ---');
  const { assemble } = require('./assemble.js');
  assemble(absDir);

  // 2. Token Extractor
  console.log('\n--- Step 2: Token Extractor ---');
  const { run: runTokens } = require('./token-extractor.js');
  runTokens(absDir);

  // 3. Normalize CSS
  console.log('\n--- Step 3: Normalize CSS ---');
  const { normalizeCSS } = require('./normalize.js');
  const warnings = normalizeCSS(absDir);

  // 4. Download Assets
  console.log('\n--- Step 4: Download Assets ---');
  const { run: runDownload } = require('./download-assets.js');
  await runDownload(absDir);

  // 5. Inject IDs
  console.log('\n--- Step 5: Inject Element IDs ---');
  const { run: runInject } = require('./inject-ids.js');
  runInject(absDir);

  console.log('\n=== Postprocess complete ===\n');
  return { warnings };
}

if (require.main === module) {
  const outputDir = process.argv[2];
  if (!outputDir) {
    console.error('Usage: node tools/postprocess.js <outputDir>');
    console.error('Example: node tools/postprocess.js output/');
    process.exit(1);
  }

  if (!fs.existsSync(outputDir)) {
    console.error(`[postprocess] Directory not found: ${outputDir}`);
    process.exit(1);
  }

  postprocess(outputDir).catch(err => {
    console.error('[postprocess] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { postprocess };
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test tools/__tests__/postprocess.test.js`
Expected: 모든 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
git add tools/postprocess.js tools/__tests__/postprocess.test.js
git commit -m "feat: postprocess.js — 후처리 오케스트레이터"
```

---

## Task 7: SKILL.md — v2 프로세스 정의

**Files:**
- Modify: `skills/figma-to-code/SKILL.md`

- [ ] **Step 1: SKILL.md 전면 재작성**

`skills/figma-to-code/SKILL.md`:

````md
---
name: figma-to-code
description: Figma URL을 넣으면 배포 가능한 HTML/CSS/JS를 생성합니다. "figma", "피그마", "디자인을 코드로", "HTML로 만들어줘", "figma.com" URL이 포함된 요청에 사용됩니다.
---

# Figma-to-Code v2

Figma 디자인 URL을 받아 배포 가능한 Vanilla HTML/CSS/JS 단일 페이지를 생성한다.
MCP 코드를 베이스로 섹션별 변환하고, 시각적 보정 루프로 Figma 원본에 가까운 결과를 보장한다.

## 트리거

다음과 같은 요청에 이 스킬이 활성화된다:
- "이 Figma 디자인을 HTML로 만들어줘"
- "figma.com/design/... 이걸 코드로 변환해줘"
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

1. **`get_design_context`**(fileKey, nodeId) 호출 → React+Tailwind 코드 + 스크린샷 반환
2. 반환된 코드를 `output/.mcp-source.jsx`에 Write 도구로 저장
3. MCP 응답 원본 데이터를 `output/.figma-data.json`에 저장
4. 반환된 스크린샷은 대화 컨텍스트에 유지 (보정 루프 레퍼런스)

### Step 3: 섹션 식별

MCP 코드를 읽고 최상위 컴포넌트/섹션을 구분한다:
- 최상위 JSX의 직접 자식 요소들을 섹션으로 식별
- 각 섹션에 이름 부여 (hero, features, cta, footer 등)
- 섹션 목록을 사용자에게 보여주고 확인
  > "4개 섹션으로 나눕니다: Hero, Features, CTA, Footer — 맞나요?"

### Step 4: 섹션별 변환

각 섹션마다 MCP의 React+Tailwind 코드를 바닐라 HTML + CSS로 변환한다.

**변환 규칙:**

HTML:
- 시맨틱 HTML5 태그: `<header>`, `<nav>`, `<main>`, `<section>`, `<footer>`
- BEM 스타일 클래스명: `.hero`, `.hero__title`, `.hero__cta`
- 이미지는 `assets/` 상대경로: `<img src="assets/hero.png">`

CSS:
- `:root`에 디자인 토큰을 CSS 변수로 정의 (색상, 폰트, 간격)
- 색상/폰트 하드코딩 금지 — 반드시 CSS 변수 참조
- Flexbox 또는 CSS Grid로 레이아웃

JS:
- 인터랙션이 필요할 때만 생성. Vanilla JS만 사용.

이미지:
- Figma에서 이미지 URL 수집 → `output/assets-manifest.json`에 목록 작성:
  ```json
  [{ "url": "https://figma-image-url/...", "filename": "hero.png" }]
  ```

**저장:**
- `output/sections/01-hero.html` + `output/sections/01-hero.css`
- `output/sections/02-features.html` + `output/sections/02-features.css`
- 번호 순서 = 페이지 내 배치 순서
- Write 도구로 각 파일을 즉시 저장

### Step 5: 후처리 파이프라인

```bash
node tools/postprocess.js output/
```

자동 수행:
1. 섹션 HTML/CSS를 index.html + styles.css로 합침
2. Figma 데이터에서 디자인 토큰 추출 + 검증
3. CSS 정규화 (하드코딩 색상→변수 교체, 네이밍 통일)
4. 이미지 다운로드 (assets-manifest.json → output/assets/)
5. HTML 요소에 data-element-id 삽입

### Step 6: 시각적 보정 루프

1. 프리뷰 서버 기동:
```bash
node tools/preview-server.js output/
```

2. 스크린샷 캡처 (Figma 프레임과 동일한 width 사용):
```bash
node tools/capture.js http://localhost:3100 output/.preview-screenshot.png <width>
```

3. Read 도구로 `output/.preview-screenshot.png` 읽기
4. Figma MCP 스크린샷 (Step 2에서 대화 컨텍스트에 유지 중)과 비교
5. 차이점을 구체적으로 식별:
   - 색상 일치 여부
   - 타이포그래피 (크기, 굵기, 행간)
   - 간격 (padding, margin, gap)
   - 레이아웃 구조 (요소 배치, 정렬)
   - 이미지 위치/크기
6. 차이가 있으면 해당 섹션 파일 수정 → `node tools/postprocess.js output/` 재실행 → 재캡처 → 재비교
7. **최대 2회 반복**. 2회 후에도 차이가 있으면 남은 차이점을 사용자에게 리포트

### Step 7: 결과 안내

```
변환 완료!

output/index.html — 메인 HTML
output/styles.css — 스타일시트
output/assets/    — 이미지 에셋

프리뷰: http://localhost:3100

수정하려면 이 대화에서 바로 요청하세요:
  "히어로 섹션 배경색을 파란색으로 바꿔줘"
  "버튼 텍스트를 '무료 시작'으로 변경해줘"
```

## 수정 워크플로우

사용자가 수정을 요청하면:
1. `output/` 폴더의 해당 파일을 Read로 읽는다
2. 정확한 위치를 찾아 Edit으로 수정한다
3. CSS 변수 체계를 유지한다 (색상 변경 시 `:root` 변수를 수정)
4. preview-server가 자동으로 브라우저에 반영한다

## 주의사항

- Figma Pro/Org Dev seat 이상 권장 (Starter/View/Collab은 월 6회 API 제한)
- 프로모션/이벤트 단일 페이지에 최적화. 복잡한 SPA/멀티페이지에는 부적합
- 반응형은 미지원 (Phase 1). 단일 프레임만 변환
- 커스텀 폰트는 Google Fonts 매핑 또는 시스템 폰트 대체
- 시각적 보정 루프는 최대 2회. 완벽하지 않을 수 있음
````

- [ ] **Step 2: 커밋**

```bash
git add skills/figma-to-code/SKILL.md
git commit -m "docs: SKILL.md — v2 프로세스 (섹션별 변환 + 시각적 보정 루프)"
```

---

## Task 8: 통합 테스트 — 전체 파이프라인

**Files:**
- Create: `tools/__tests__/integration.test.js`

- [ ] **Step 1: 통합 테스트 작성**

`tools/__tests__/integration.test.js`:

```js
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { postprocess } = require('../postprocess.js');

const TMP_DIR = path.join(__dirname, '__tmp_integration_test__');

beforeEach(() => {
  fs.mkdirSync(path.join(TMP_DIR, 'sections'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('full pipeline integration', () => {
  it('섹션 파일 → 최종 index.html + styles.css 생성', async () => {
    // 섹션 파일 생성 (Claude가 실제로 생성할 것과 유사한 형태)
    fs.writeFileSync(
      path.join(TMP_DIR, 'sections', '01-hero.html'),
      `<section class="hero">
  <h1 class="hero__title">Welcome</h1>
  <p class="hero__desc">Description here</p>
  <a class="hero__cta" href="#">Get Started</a>
</section>`
    );
    fs.writeFileSync(
      path.join(TMP_DIR, 'sections', '01-hero.css'),
      `:root {
  --color-primary: #E0004D;
  --color-text: #1A1A1A;
  --font-heading: 'Poppins', sans-serif;
}

.hero {
  padding: 80px 20px;
  text-align: center;
}
.hero__title {
  font-family: var(--font-heading);
  font-size: 48px;
  color: #1A1A1A;
}
.hero__cta {
  background-color: #E0004D;
  color: white;
  padding: 16px 32px;
  border-radius: 8px;
}`
    );

    fs.writeFileSync(
      path.join(TMP_DIR, 'sections', '02-footer.html'),
      `<footer class="footer">
  <p class="footer__text">© 2026 Company</p>
</footer>`
    );
    fs.writeFileSync(
      path.join(TMP_DIR, 'sections', '02-footer.css'),
      `.footer {
  padding: 40px 20px;
  background: #1A1A1A;
  color: white;
  text-align: center;
}`
    );

    fs.writeFileSync(path.join(TMP_DIR, 'assets-manifest.json'), '[]');

    await postprocess(TMP_DIR);

    // 최종 파일 존재 확인
    assert.ok(fs.existsSync(path.join(TMP_DIR, 'index.html')));
    assert.ok(fs.existsSync(path.join(TMP_DIR, 'styles.css')));

    const html = fs.readFileSync(path.join(TMP_DIR, 'index.html'), 'utf-8');
    const css = fs.readFileSync(path.join(TMP_DIR, 'styles.css'), 'utf-8');

    // HTML 구조 확인
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('<link rel="stylesheet" href="styles.css">'));
    assert.ok(html.includes('data-element-id'));
    assert.ok(html.indexOf('Welcome') < html.indexOf('© 2026'));

    // CSS 정규화 확인
    // 하드코딩 #E0004D → var(--color-primary), #1A1A1A → var(--color-text)
    assert.ok(css.includes(':root'));
    assert.ok(css.includes('--color-primary: #E0004D'));
    assert.ok(!css.match(/color:\s*#1A1A1A/) || css.includes('var(--color-text)'));
  });

  it('빈 프로젝트에서도 에러 없이 완료', async () => {
    fs.writeFileSync(path.join(TMP_DIR, 'assets-manifest.json'), '[]');
    const result = await postprocess(TMP_DIR);
    assert.ok(fs.existsSync(path.join(TMP_DIR, 'index.html')));
  });
});
```

- [ ] **Step 2: 통합 테스트 실행**

Run: `node --test tools/__tests__/integration.test.js`
Expected: 모든 테스트 PASS

- [ ] **Step 3: 전체 테스트 스위트 실행**

Run: `node --test tools/__tests__/*.test.js`
Expected: 모든 테스트 PASS

- [ ] **Step 4: 커밋**

```bash
git add tools/__tests__/integration.test.js
git commit -m "test: 통합 테스트 — 전체 후처리 파이프라인"
```

---

## Task 9: 이전 v1 설계 문서 정리

**Files:**
- Delete: `docs/superpowers/specs/2026-03-31-figma-to-code-phase1-design.md`
- Delete: `docs/superpowers/plans/2026-03-31-figma-to-code-phase1.md`

- [ ] **Step 1: v1 문서 삭제**

```bash
rm docs/superpowers/specs/2026-03-31-figma-to-code-phase1-design.md
rm docs/superpowers/plans/2026-03-31-figma-to-code-phase1.md
```

- [ ] **Step 2: 커밋**

```bash
git add -A
git commit -m "chore: v1 설계 문서 정리"
```
