# Figma-to-Code AI 에이전트 파이프라인 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MCP JSX를 Babel AST로 파싱하여 자동 변환하고, 모든 도구를 JSON 표준화 CLI로 전환하여 AI 에이전트가 자율적으로 도구를 조합할 수 있는 구조를 만든다.

**Architecture:** Babel AST 파서(`parse-jsx.js`)가 JSX에서 구조/이미지/토큰을 추출하고, 변환기(`convert-to-html.js`)가 HTML/CSS를 생성한다. 기존 도구들은 JSON 표준화하여 AI가 구조화된 데이터로 결과를 받는다. `postprocess.js`는 편의용 숏컷으로 축소.

**Tech Stack:** Node.js, `@babel/parser`, `cheerio` (기존), `playwright` (기존), `node:test` (기존 테스트 프레임워크)

**Spec:** `docs/superpowers/specs/2026-04-02-pipeline-redesign.md`

---

## File Structure

### 새로 생성
- `tools/parse-jsx.js` — Babel AST 파서. JSX → 경량 AST + 이미지 목록 + 토큰 추출
- `tools/convert-to-html.js` — AST → vanilla HTML + CSS 변환기
- `tools/json-output.js` — JSON 표준화 출력 헬퍼 (stdout JSON, stderr 로그)
- `tools/__tests__/parse-jsx.test.js` — parse-jsx 테스트
- `tools/__tests__/convert-to-html.test.js` — convert-to-html 테스트
- `tools/__tests__/json-output.test.js` — json-output 헬퍼 테스트

### 수정
- `tools/download-assets.js` — JSON 표준화 출력 적용
- `tools/inject-ids.js` — JSON 표준화 출력 적용
- `tools/capture.js` — JSON 표준화 출력 적용
- `tools/validate.js` — JSON 표준화 출력 적용
- `tools/postprocess.js` — 새 파이프라인으로 교체 (parse-jsx → convert-to-html → download-assets → inject-ids)
- `tools/__tests__/download-assets.test.js` — JSON 출력 검증 추가
- `tools/__tests__/inject-ids.test.js` — JSON 출력 검증 추가
- `tools/__tests__/capture.test.js` — JSON 출력 검증 추가
- `tools/__tests__/postprocess.test.js` — 새 파이프라인에 맞게 재작성
- `package.json` — `@babel/parser` 의존성 추가
- `skills/figma-to-code/SKILL.md` — 에이전트 루프로 재작성

### 삭제
- `tools/assemble.js`
- `tools/token-extractor.js`
- `tools/normalize.js`
- `tools/parse-mcp.js`
- `tools/__tests__/assemble.test.js`
- `tools/__tests__/token-extractor.test.js`
- `tools/__tests__/normalize.test.js`
- `tools/__tests__/integration.test.js`

---

### Task 1: JSON 표준화 출력 헬퍼

**Files:**
- Create: `tools/json-output.js`
- Create: `tools/__tests__/json-output.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tools/__tests__/json-output.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { success, fail, warn } = require('../json-output.js');

describe('json-output', () => {
  it('success는 ok:true와 data를 반환한다', () => {
    const result = success({ count: 3 });
    assert.deepStrictEqual(result, { ok: true, data: { count: 3 }, warnings: [] });
  });

  it('success에 warnings를 추가할 수 있다', () => {
    const result = success({ count: 3 }, ['색상 누락']);
    assert.deepStrictEqual(result, { ok: true, data: { count: 3 }, warnings: ['색상 누락'] });
  });

  it('fail은 ok:false와 error/code를 반환한다', () => {
    const result = fail('파일 없음', 'FILE_NOT_FOUND');
    assert.deepStrictEqual(result, { ok: false, error: '파일 없음', code: 'FILE_NOT_FOUND' });
  });

  it('warn은 stderr에 메시지를 출력한다', () => {
    // warn은 console.error로 출력 (stderr)
    let captured = '';
    const orig = console.error;
    console.error = (msg) => { captured = msg; };
    warn('테스트 경고');
    console.error = orig;
    assert.ok(captured.includes('테스트 경고'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/__tests__/json-output.test.js`
Expected: FAIL with "Cannot find module '../json-output.js'"

- [ ] **Step 3: Write minimal implementation**

```js
// tools/json-output.js
function success(data, warnings = []) {
  return { ok: true, data, warnings };
}

function fail(error, code) {
  return { ok: false, error, code };
}

function warn(message) {
  console.error(`[warn] ${message}`);
}

/**
 * CLI 엔트리포인트용: 결과를 stdout에 JSON으로 출력
 * 로그는 stderr로 출력되므로 stdout은 순수 JSON만 포함
 */
function printResult(result) {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

module.exports = { success, fail, warn, printResult };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/__tests__/json-output.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add tools/json-output.js tools/__tests__/json-output.test.js
git commit -m "feat: add json-output helper for standardized CLI output"
```

---

### Task 2: `@babel/parser` 의존성 추가

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install @babel/parser**

Run: `npm install @babel/parser`

- [ ] **Step 2: Verify installation**

Run: `node -e "const { parse } = require('@babel/parser'); console.log(typeof parse)"`
Expected: `function`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @babel/parser dependency"
```

---

### Task 3: `parse-jsx.js` — Tailwind 파서 함수 이전

기존 `parse-mcp.js`의 Tailwind 파서 함수들을 `parse-jsx.js`로 이전하고 확장한다.

**Files:**
- Create: `tools/parse-jsx.js`
- Create: `tools/__tests__/parse-jsx.test.js`
- Reference: `tools/parse-mcp.js` (파서 함수 원본)

- [ ] **Step 1: Write failing tests for Tailwind parsers**

```js
// tools/__tests__/parse-jsx.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseTailwindClass } = require('../parse-jsx.js');

describe('parseTailwindClass', () => {
  it('w-[1052px]을 파싱한다', () => {
    const result = parseTailwindClass('w-[1052px]');
    assert.deepStrictEqual(result, { width: '1052px' });
  });

  it('h-[365px]을 파싱한다', () => {
    const result = parseTailwindClass('h-[365px]');
    assert.deepStrictEqual(result, { height: '365px' });
  });

  it('text-[20px]을 파싱한다', () => {
    const result = parseTailwindClass('text-[20px]');
    assert.deepStrictEqual(result, { 'font-size': '20px' });
  });

  it('text-[#2b2b2b]을 파싱한다', () => {
    const result = parseTailwindClass('text-[#2b2b2b]');
    assert.deepStrictEqual(result, { color: '#2b2b2b' });
  });

  it('bg-[#f9bb34]을 파싱한다', () => {
    const result = parseTailwindClass('bg-[#f9bb34]');
    assert.deepStrictEqual(result, { 'background-color': '#f9bb34' });
  });

  it('rounded-[10px]을 파싱한다', () => {
    const result = parseTailwindClass('rounded-[10px]');
    assert.deepStrictEqual(result, { 'border-radius': '10px' });
  });

  it('leading-[30px]을 파싱한다', () => {
    const result = parseTailwindClass('leading-[30px]');
    assert.deepStrictEqual(result, { 'line-height': '30px' });
  });

  it('left-[432px]을 파싱한다', () => {
    const result = parseTailwindClass('left-[432px]');
    assert.deepStrictEqual(result, { left: '432px' });
  });

  it('top-[80px]을 파싱한다', () => {
    const result = parseTailwindClass('top-[80px]');
    assert.deepStrictEqual(result, { top: '80px' });
  });

  it('absolute을 파싱한다', () => {
    const result = parseTailwindClass('absolute');
    assert.deepStrictEqual(result, { position: 'absolute' });
  });

  it('relative를 파싱한다', () => {
    const result = parseTailwindClass('relative');
    assert.deepStrictEqual(result, { position: 'relative' });
  });

  it('flex를 파싱한다', () => {
    const result = parseTailwindClass('flex');
    assert.deepStrictEqual(result, { display: 'flex' });
  });

  it('gap-[20px]을 파싱한다', () => {
    const result = parseTailwindClass('gap-[20px]');
    assert.deepStrictEqual(result, { gap: '20px' });
  });

  it('text-center를 파싱한다', () => {
    const result = parseTailwindClass('text-center');
    assert.deepStrictEqual(result, { 'text-align': 'center' });
  });

  it('overflow-hidden을 파싱한다', () => {
    const result = parseTailwindClass('overflow-hidden');
    assert.deepStrictEqual(result, { overflow: 'hidden' });
  });

  it('font-[Bold]에서 font-weight를 추출한다', () => {
    const result = parseTailwindClass("font-['YouandiNewKr:Bold']");
    assert.deepStrictEqual(result, { 'font-family': "'YouandiNewKr:Bold'", 'font-weight': '700' });
  });

  it('font-[Regular]에서 font-weight를 추출한다', () => {
    const result = parseTailwindClass("font-['Pretendard:Regular']");
    assert.deepStrictEqual(result, { 'font-family': "'Pretendard:Regular'", 'font-weight': '400' });
  });

  it('퍼센트 크롭 값을 파싱한다', () => {
    const result = parseTailwindClass('w-[652.38%]');
    assert.deepStrictEqual(result, { width: '652.38%' });
  });

  it('음수 퍼센트 값을 파싱한다', () => {
    const result = parseTailwindClass('left-[-493.07%]');
    assert.deepStrictEqual(result, { left: '-493.07%' });
  });

  it('알 수 없는 클래스는 빈 객체를 반환한다', () => {
    const result = parseTailwindClass('unknown-class');
    assert.deepStrictEqual(result, {});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/__tests__/parse-jsx.test.js`
Expected: FAIL with "Cannot find module '../parse-jsx.js'"

- [ ] **Step 3: Write parseTailwindClass implementation**

```js
// tools/parse-jsx.js (초기 — Tailwind 파서만)

const TAILWIND_PATTERNS = [
  // dimensions
  [/^w-\[(-?\d+(?:\.\d+)?)(px|%)\]$/, (m) => ({ width: `${m[1]}${m[2]}` })],
  [/^h-\[(-?\d+(?:\.\d+)?)(px|%)\]$/, (m) => ({ height: `${m[1]}${m[2]}` })],
  [/^min-w-\[(\d+(?:\.\d+)?)(px|%)\]$/, (m) => ({ 'min-width': `${m[1]}${m[2]}` })],
  [/^min-h-\[(\d+(?:\.\d+)?)(px|%)\]$/, (m) => ({ 'min-height': `${m[1]}${m[2]}` })],
  [/^max-w-\[(\d+(?:\.\d+)?)(px|%)\]$/, (m) => ({ 'max-width': `${m[1]}${m[2]}` })],

  // position
  [/^(absolute|relative|fixed|sticky)$/, (m) => ({ position: m[1] })],
  [/^left-\[(-?\d+(?:\.\d+)?)(px|%)\]$/, (m) => ({ left: `${m[1]}${m[2]}` })],
  [/^top-\[(-?\d+(?:\.\d+)?)(px|%)\]$/, (m) => ({ top: `${m[1]}${m[2]}` })],
  [/^right-\[(-?\d+(?:\.\d+)?)(px|%)\]$/, (m) => ({ right: `${m[1]}${m[2]}` })],
  [/^bottom-\[(-?\d+(?:\.\d+)?)(px|%)\]$/, (m) => ({ bottom: `${m[1]}${m[2]}` })],

  // typography
  [/^text-\[(\d+(?:\.\d+)?)px\]$/, (m) => ({ 'font-size': `${m[1]}px` })],
  [/^text-\[(#[0-9a-fA-F]{3,8})\]$/, (m) => ({ color: m[1] })],
  [/^text-center$/, () => ({ 'text-align': 'center' })],
  [/^text-left$/, () => ({ 'text-align': 'left' })],
  [/^text-right$/, () => ({ 'text-align': 'right' })],
  [/^leading-\[(\d+(?:\.\d+)?)px\]$/, (m) => ({ 'line-height': `${m[1]}px` })],
  [/^font-\['([^']+)'\]$/, (m) => {
    const result = { 'font-family': `'${m[1]}'` };
    if (/bold/i.test(m[1])) result['font-weight'] = '700';
    else if (/regular/i.test(m[1])) result['font-weight'] = '400';
    return result;
  }],

  // background
  [/^bg-\[(#[0-9a-fA-F]{3,8})\]$/, (m) => ({ 'background-color': m[1] })],

  // border
  [/^rounded-\[(\d+(?:\.\d+)?)px\]$/, (m) => ({ 'border-radius': `${m[1]}px` })],
  [/^rounded-full$/, () => ({ 'border-radius': '9999px' })],

  // layout
  [/^flex$/, () => ({ display: 'flex' })],
  [/^inline-flex$/, () => ({ display: 'inline-flex' })],
  [/^grid$/, () => ({ display: 'grid' })],
  [/^flex-col$/, () => ({ 'flex-direction': 'column' })],
  [/^flex-row$/, () => ({ 'flex-direction': 'row' })],
  [/^items-center$/, () => ({ 'align-items': 'center' })],
  [/^items-start$/, () => ({ 'align-items': 'flex-start' })],
  [/^items-end$/, () => ({ 'align-items': 'flex-end' })],
  [/^justify-center$/, () => ({ 'justify-content': 'center' })],
  [/^justify-between$/, () => ({ 'justify-content': 'space-between' })],
  [/^gap-\[(\d+(?:\.\d+)?)px\]$/, (m) => ({ gap: `${m[1]}px` })],

  // overflow
  [/^overflow-hidden$/, () => ({ overflow: 'hidden' })],
  [/^overflow-auto$/, () => ({ overflow: 'auto' })],

  // spacing
  [/^p-\[(\d+(?:\.\d+)?)px\]$/, (m) => ({ padding: `${m[1]}px` })],
  [/^px-\[(\d+(?:\.\d+)?)px\]$/, (m) => ({ 'padding-left': `${m[1]}px`, 'padding-right': `${m[1]}px` })],
  [/^py-\[(\d+(?:\.\d+)?)px\]$/, (m) => ({ 'padding-top': `${m[1]}px`, 'padding-bottom': `${m[1]}px` })],
  [/^pt-\[(\d+(?:\.\d+)?)px\]$/, (m) => ({ 'padding-top': `${m[1]}px` })],
  [/^pb-\[(\d+(?:\.\d+)?)px\]$/, (m) => ({ 'padding-bottom': `${m[1]}px` })],
  [/^pl-\[(\d+(?:\.\d+)?)px\]$/, (m) => ({ 'padding-left': `${m[1]}px` })],
  [/^pr-\[(\d+(?:\.\d+)?)px\]$/, (m) => ({ 'padding-right': `${m[1]}px` })],
  [/^m-\[(\d+(?:\.\d+)?)px\]$/, (m) => ({ margin: `${m[1]}px` })],
  [/^mx-auto$/, () => ({ 'margin-left': 'auto', 'margin-right': 'auto' })],

  // opacity
  [/^opacity-\[([0-9.]+)\]$/, (m) => ({ opacity: m[1] })],
];

/**
 * 단일 Tailwind 클래스를 CSS 속성 객체로 변환
 * @param {string} cls - Tailwind 클래스 (예: "w-[100px]")
 * @returns {Object} CSS 속성 객체 (예: { width: "100px" })
 */
function parseTailwindClass(cls) {
  for (const [pattern, handler] of TAILWIND_PATTERNS) {
    const match = cls.match(pattern);
    if (match) return handler(match);
  }
  return {};
}

module.exports = { parseTailwindClass };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/__tests__/parse-jsx.test.js`
Expected: PASS (21 tests)

- [ ] **Step 5: Commit**

```bash
git add tools/parse-jsx.js tools/__tests__/parse-jsx.test.js
git commit -m "feat: add Tailwind class parser for parse-jsx"
```

---

### Task 4: `parse-jsx.js` — Babel AST 파싱 + 이미지/토큰 추출

**Files:**
- Modify: `tools/parse-jsx.js`
- Modify: `tools/__tests__/parse-jsx.test.js`

- [ ] **Step 1: Write failing tests for JSX parsing**

아래 테스트를 `tools/__tests__/parse-jsx.test.js`의 기존 describe 블록 아래에 추가:

```js
const { parseJsx } = require('../parse-jsx.js');

describe('parseJsx', () => {
  it('단순 JSX를 경량 AST로 변환한다', () => {
    const jsx = `
      export default function Page() {
        return (
          <div className="relative w-[1440px] h-[900px]">
            <h1 className="text-[32px] text-[#2b2b2b]">Hello</h1>
          </div>
        );
      }
    `;
    const result = parseJsx(jsx);
    assert.strictEqual(result.data.ast.tag, 'div');
    assert.strictEqual(result.data.ast.children.length, 1);
    assert.strictEqual(result.data.ast.children[0].tag, 'h1');
    assert.strictEqual(result.data.ast.children[0].text, 'Hello');
  });

  it('img 태그에서 이미지 URL을 자동 수집한다', () => {
    const jsx = `
      export default function Page() {
        return (
          <div className="relative">
            <img src="https://example.com/hero.png" className="w-[500px] h-[300px]" />
            <img src="https://example.com/logo.svg" className="w-[100px]" />
          </div>
        );
      }
    `;
    const result = parseJsx(jsx);
    assert.strictEqual(result.data.images.length, 2);
    assert.strictEqual(result.data.images[0].url, 'https://example.com/hero.png');
    assert.strictEqual(result.data.images[0].filename, 'hero.png');
    assert.strictEqual(result.data.images[1].url, 'https://example.com/logo.svg');
    assert.strictEqual(result.data.images[1].filename, 'logo.svg');
  });

  it('이미지 크롭 좌표를 감지한다', () => {
    const jsx = `
      export default function Page() {
        return (
          <div className="overflow-hidden w-[243px] h-[365px]">
            <img src="https://example.com/person.png" className="absolute w-[652.38%] h-[276.42%] left-[-493.07%] top-[-39.22%]" />
          </div>
        );
      }
    `;
    const result = parseJsx(jsx);
    assert.strictEqual(result.data.images.length, 1);
    assert.deepStrictEqual(result.data.images[0].crop, {
      width: '652.38%',
      height: '276.42%',
      left: '-493.07%',
      top: '-39.22%',
    });
  });

  it('색상 토큰을 추출한다', () => {
    const jsx = `
      export default function Page() {
        return (
          <div className="bg-[#f9bb34]">
            <p className="text-[#2b2b2b]">text</p>
            <span className="text-[#2b2b2b]">duplicate</span>
          </div>
        );
      }
    `;
    const result = parseJsx(jsx);
    const colorValues = Object.values(result.data.tokens.colors);
    assert.ok(colorValues.includes('#f9bb34'));
    assert.ok(colorValues.includes('#2b2b2b'));
    // 중복 제거 확인
    assert.strictEqual(colorValues.length, 2);
  });

  it('폰트 토큰을 추출한다', () => {
    const jsx = `
      export default function Page() {
        return (
          <div>
            <h1 className="font-['YouandiNewKr:Bold'] text-[32px]">Title</h1>
            <p className="font-['Pretendard:Regular'] text-[16px]">Body</p>
          </div>
        );
      }
    `;
    const result = parseJsx(jsx);
    const fontValues = Object.values(result.data.tokens.fonts);
    assert.ok(fontValues.includes("'YouandiNewKr:Bold'"));
    assert.ok(fontValues.includes("'Pretendard:Regular'"));
  });

  it('meta 정보를 반환한다', () => {
    const jsx = `
      export default function Page() {
        return (
          <div className="w-[1440px] h-[3200px]">
            <img src="https://example.com/a.png" />
            <img src="https://example.com/b.png" />
            <p>text</p>
          </div>
        );
      }
    `;
    const result = parseJsx(jsx);
    assert.strictEqual(result.data.meta.width, 1440);
    assert.strictEqual(result.data.meta.height, 3200);
    assert.strictEqual(result.data.meta.imageCount, 2);
    assert.ok(result.data.meta.nodeCount >= 4); // div, img, img, p
  });

  it('ok:true 형식으로 반환한다', () => {
    const jsx = `
      export default function Page() {
        return <div className="w-[100px]"><p>hi</p></div>;
      }
    `;
    const result = parseJsx(jsx);
    assert.strictEqual(result.ok, true);
    assert.ok(result.data);
    assert.ok(Array.isArray(result.warnings));
  });

  it('잘못된 JSX는 ok:false를 반환한다', () => {
    const result = parseJsx('this is not jsx <<<>>>');
    assert.strictEqual(result.ok, false);
    assert.ok(result.error);
    assert.strictEqual(result.code, 'PARSE_ERROR');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/__tests__/parse-jsx.test.js`
Expected: FAIL — `parseJsx is not a function`

- [ ] **Step 3: Implement parseJsx**

`tools/parse-jsx.js`에 아래 코드를 추가 (기존 `parseTailwindClass` 아래에):

```js
const { parse } = require('@babel/parser');
const { success, fail } = require('./json-output.js');

/**
 * Babel AST의 JSXElement를 경량 트리 노드로 변환
 */
function jsxElementToNode(element) {
  const node = {};

  // tag name
  if (element.openingElement) {
    const nameNode = element.openingElement.name;
    node.tag = nameNode.name || 'div';
  }

  // attributes
  const props = {};
  let className = '';
  if (element.openingElement && element.openingElement.attributes) {
    for (const attr of element.openingElement.attributes) {
      if (attr.type !== 'JSXAttribute' || !attr.name) continue;
      const name = attr.name.name;
      let value = '';
      if (attr.value) {
        if (attr.value.type === 'StringLiteral') {
          value = attr.value.value;
        } else if (attr.value.type === 'JSXExpressionContainer' && attr.value.expression.type === 'StringLiteral') {
          value = attr.value.expression.value;
        }
      }
      if (name === 'className') {
        className = value;
      } else {
        props[name] = value;
      }
    }
  }

  if (className) node.className = className;
  if (Object.keys(props).length > 0) node.props = props;

  // children
  const children = [];
  let textContent = '';
  if (element.children) {
    for (const child of element.children) {
      if (child.type === 'JSXElement') {
        children.push(jsxElementToNode(child));
      } else if (child.type === 'JSXText') {
        const trimmed = child.value.trim();
        if (trimmed) textContent += trimmed;
      } else if (child.type === 'JSXExpressionContainer') {
        if (child.expression.type === 'StringLiteral') {
          textContent += child.expression.value;
        }
      }
    }
  }

  if (children.length > 0) node.children = children;
  if (textContent) node.text = textContent;

  return node;
}

/**
 * 경량 AST를 순회하며 이미지와 토큰을 수집
 */
function collectData(node) {
  const images = [];
  const colorSet = new Set();
  const fontSet = new Set();
  let nodeCount = 0;

  function walk(n) {
    nodeCount++;

    // 이미지 수집
    if (n.tag === 'img' && n.props && n.props.src) {
      const url = n.props.src;
      const urlPath = url.split('/').pop().split('?')[0];
      const filename = urlPath || `image-${images.length + 1}.png`;

      // 크롭 감지
      let crop = null;
      if (n.className) {
        const classes = n.className.split(/\s+/);
        const cropData = {};
        for (const cls of classes) {
          const wMatch = cls.match(/^w-\[(-?\d+(?:\.\d+)?)%\]$/);
          const hMatch = cls.match(/^h-\[(-?\d+(?:\.\d+)?)%\]$/);
          const lMatch = cls.match(/^left-\[(-?\d+(?:\.\d+)?)%\]$/);
          const tMatch = cls.match(/^top-\[(-?\d+(?:\.\d+)?)%\]$/);
          if (wMatch) cropData.width = `${wMatch[1]}%`;
          if (hMatch) cropData.height = `${hMatch[1]}%`;
          if (lMatch) cropData.left = `${lMatch[1]}%`;
          if (tMatch) cropData.top = `${tMatch[1]}%`;
        }
        if (Object.keys(cropData).length > 0) crop = cropData;
      }

      images.push({ url, filename, crop });
    }

    // 색상/폰트 수집
    if (n.className) {
      const classes = n.className.split(/\s+/);
      for (const cls of classes) {
        const colorMatch = cls.match(/^(?:text|bg)-\[(#[0-9a-fA-F]{3,8})\]$/);
        if (colorMatch) colorSet.add(colorMatch[1]);

        const fontMatch = cls.match(/^font-\['([^']+)'\]$/);
        if (fontMatch) fontSet.add(`'${fontMatch[1]}'`);
      }
    }

    // 재귀
    if (n.children) {
      for (const child of n.children) walk(child);
    }
  }

  walk(node);

  // 토큰 생성
  const colors = {};
  let colorIdx = 1;
  for (const hex of colorSet) {
    colors[`--color-${colorIdx}`] = hex;
    colorIdx++;
  }

  const fonts = {};
  let fontIdx = 1;
  for (const font of fontSet) {
    fonts[`--font-${fontIdx}`] = font;
    fontIdx++;
  }

  const fontWeights = {};
  for (const font of fontSet) {
    if (/bold/i.test(font)) fontWeights[`--fw-bold`] = 700;
    else if (/regular/i.test(font)) fontWeights[`--fw-regular`] = 400;
  }

  // meta: 루트 노드에서 width/height 추출
  let width = null;
  let height = null;
  if (node.className) {
    const wMatch = node.className.match(/w-\[(\d+)px\]/);
    const hMatch = node.className.match(/h-\[(\d+)px\]/);
    if (wMatch) width = parseInt(wMatch[1], 10);
    if (hMatch) height = parseInt(hMatch[1], 10);
  }

  return {
    images,
    tokens: { colors, fonts, fontWeights },
    meta: {
      width,
      height,
      nodeCount,
      imageCount: images.length,
    },
  };
}

/**
 * JSX 문자열에서 최상위 return문의 JSXElement를 찾는다
 */
function findRootJsx(ast) {
  let rootElement = null;

  function walk(node) {
    if (rootElement) return;
    if (node.type === 'ReturnStatement' && node.argument && node.argument.type === 'JSXElement') {
      rootElement = node.argument;
      return;
    }
    for (const key of Object.keys(node)) {
      const val = node[key];
      if (val && typeof val === 'object') {
        if (Array.isArray(val)) {
          for (const item of val) {
            if (item && typeof item.type === 'string') walk(item);
          }
        } else if (typeof val.type === 'string') {
          walk(val);
        }
      }
    }
  }

  walk(ast.program);
  return rootElement;
}

/**
 * JSX 문자열을 파싱하여 경량 AST + 이미지 + 토큰을 반환
 * @param {string} jsxString
 * @returns {{ ok: boolean, data?: object, warnings?: string[], error?: string, code?: string }}
 */
function parseJsx(jsxString) {
  let babelAst;
  try {
    babelAst = parse(jsxString, {
      sourceType: 'module',
      plugins: ['jsx'],
    });
  } catch (err) {
    return fail(`JSX 파싱 실패: ${err.message}`, 'PARSE_ERROR');
  }

  const rootJsx = findRootJsx(babelAst);
  if (!rootJsx) {
    return fail('JSX return문을 찾을 수 없습니다', 'NO_JSX_ROOT');
  }

  const ast = jsxElementToNode(rootJsx);
  const { images, tokens, meta } = collectData(ast);

  return success({ ast, images, tokens, meta });
}

module.exports = { parseTailwindClass, parseJsx };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/__tests__/parse-jsx.test.js`
Expected: PASS (all tests)

- [ ] **Step 5: Add CLI entrypoint**

`tools/parse-jsx.js` 하단에 추가:

```js
const fs = require('node:fs');
const path = require('node:path');
const { printResult } = require('./json-output.js');

if (require.main === module) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    printResult(fail('Usage: node tools/parse-jsx.js <jsx-file>', 'USAGE'));
    process.exit(1);
  }

  const absPath = path.resolve(inputPath);
  if (!fs.existsSync(absPath)) {
    printResult(fail(`파일 없음: ${absPath}`, 'FILE_NOT_FOUND'));
    process.exit(1);
  }

  const jsx = fs.readFileSync(absPath, 'utf-8');
  const result = parseJsx(jsx);
  printResult(result);
  if (!result.ok) process.exit(1);
}
```

- [ ] **Step 6: Commit**

```bash
git add tools/parse-jsx.js tools/__tests__/parse-jsx.test.js
git commit -m "feat: add Babel AST parser with image/token extraction"
```

---

### Task 5: `convert-to-html.js` — AST → HTML/CSS 변환기

**Files:**
- Create: `tools/convert-to-html.js`
- Create: `tools/__tests__/convert-to-html.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tools/__tests__/convert-to-html.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { convertToHtml } = require('../convert-to-html.js');

describe('convertToHtml', () => {
  it('경량 AST를 HTML로 변환한다', () => {
    const input = {
      ast: {
        tag: 'div',
        className: 'relative w-[1440px]',
        children: [
          { tag: 'h1', className: 'text-[32px] text-[#2b2b2b]', text: 'Hello' },
        ],
      },
      images: [],
      tokens: { colors: { '--color-1': '#2b2b2b' }, fonts: {}, fontWeights: {} },
      meta: { width: 1440, height: null, nodeCount: 2, imageCount: 0 },
    };

    const result = convertToHtml(input);
    assert.strictEqual(result.ok, true);
    assert.ok(result.data.html.includes('<!DOCTYPE html>'));
    assert.ok(result.data.html.includes('Hello'));
    assert.ok(result.data.css.includes('--color-1'));
  });

  it('CSS 변수를 생성하고 참조한다', () => {
    const input = {
      ast: {
        tag: 'div',
        className: 'bg-[#f9bb34]',
        children: [
          { tag: 'p', className: 'text-[#2b2b2b]', text: 'test' },
        ],
      },
      images: [],
      tokens: { colors: { '--color-1': '#f9bb34', '--color-2': '#2b2b2b' }, fonts: {}, fontWeights: {} },
      meta: { width: null, height: null, nodeCount: 2, imageCount: 0 },
    };

    const result = convertToHtml(input);
    assert.ok(result.data.css.includes(':root'));
    assert.ok(result.data.css.includes('--color-1: #f9bb34'));
    assert.ok(result.data.css.includes('var(--color-1)'));
    // 하드코딩 색상이 :root 외에 없어야 함
    const cssWithoutRoot = result.data.css.replace(/:root\s*\{[^}]+\}/, '');
    assert.ok(!cssWithoutRoot.includes('#f9bb34'));
  });

  it('img 태그의 src를 assets/ 경로로 변환한다', () => {
    const input = {
      ast: {
        tag: 'div',
        children: [
          { tag: 'img', props: { src: 'https://example.com/hero.png' }, className: 'w-[500px]' },
        ],
      },
      images: [{ url: 'https://example.com/hero.png', filename: 'hero.png', crop: null }],
      tokens: { colors: {}, fonts: {}, fontWeights: {} },
      meta: { width: null, height: null, nodeCount: 2, imageCount: 1 },
    };

    const result = convertToHtml(input);
    assert.ok(result.data.html.includes('src="assets/hero.png"'));
    assert.deepStrictEqual(result.data.assetsManifest, [
      { url: 'https://example.com/hero.png', filename: 'hero.png' },
    ]);
  });

  it('이미지 크롭 CSS를 보존한다', () => {
    const input = {
      ast: {
        tag: 'div',
        className: 'overflow-hidden w-[243px] h-[365px]',
        children: [
          {
            tag: 'img',
            props: { src: 'https://example.com/person.png' },
            className: 'absolute w-[652.38%] h-[276.42%] left-[-493.07%] top-[-39.22%]',
          },
        ],
      },
      images: [{ url: 'https://example.com/person.png', filename: 'person.png', crop: { width: '652.38%', height: '276.42%', left: '-493.07%', top: '-39.22%' } }],
      tokens: { colors: {}, fonts: {}, fontWeights: {} },
      meta: { width: null, height: null, nodeCount: 2, imageCount: 1 },
    };

    const result = convertToHtml(input);
    assert.ok(result.data.css.includes('652.38%'));
    assert.ok(result.data.css.includes('-493.07%'));
    assert.ok(result.data.css.includes('overflow: hidden'));
  });

  it('BEM 클래스명을 자동 생성한다', () => {
    const input = {
      ast: {
        tag: 'div',
        children: [
          { tag: 'h1', text: 'Title' },
          { tag: 'p', text: 'Body' },
        ],
      },
      images: [],
      tokens: { colors: {}, fonts: {}, fontWeights: {} },
      meta: { width: null, height: null, nodeCount: 3, imageCount: 0 },
    };

    const result = convertToHtml(input);
    // 클래스명이 부여되어 있어야 함
    assert.ok(result.data.html.includes('class="'));
  });

  it('assetsManifest에 모든 이미지가 포함된다', () => {
    const input = {
      ast: {
        tag: 'div',
        children: [
          { tag: 'img', props: { src: 'https://example.com/a.png' } },
          { tag: 'img', props: { src: 'https://example.com/b.png' } },
          { tag: 'img', props: { src: 'https://example.com/c.png' } },
        ],
      },
      images: [
        { url: 'https://example.com/a.png', filename: 'a.png', crop: null },
        { url: 'https://example.com/b.png', filename: 'b.png', crop: null },
        { url: 'https://example.com/c.png', filename: 'c.png', crop: null },
      ],
      tokens: { colors: {}, fonts: {}, fontWeights: {} },
      meta: { width: null, height: null, nodeCount: 4, imageCount: 3 },
    };

    const result = convertToHtml(input);
    assert.strictEqual(result.data.assetsManifest.length, 3);
  });

  it('overrides로 태그를 변경할 수 있다', () => {
    const input = {
      ast: {
        tag: 'div',
        children: [
          { tag: 'div', props: { 'data-node-id': '42:353' }, text: 'Nav content' },
        ],
      },
      images: [],
      tokens: { colors: {}, fonts: {}, fontWeights: {} },
      meta: { width: null, height: null, nodeCount: 2, imageCount: 0 },
    };
    const overrides = {
      '42:353': { tag: 'nav' },
    };

    const result = convertToHtml(input, overrides);
    assert.ok(result.data.html.includes('<nav'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/__tests__/convert-to-html.test.js`
Expected: FAIL — "Cannot find module '../convert-to-html.js'"

- [ ] **Step 3: Implement convertToHtml**

```js
// tools/convert-to-html.js
const fs = require('node:fs');
const path = require('node:path');
const { parseTailwindClass } = require('./parse-jsx.js');
const { success, fail, printResult } = require('./json-output.js');

/**
 * 색상값이 tokens에 있으면 var()로 치환
 */
function resolveColor(value, colorMap) {
  if (!value) return value;
  const lower = value.toLowerCase();
  return colorMap[lower] || value;
}

/**
 * className의 Tailwind 클래스들을 CSS 속성 문자열로 변환
 * 색상은 CSS 변수로 치환
 */
function tailwindToCSS(className, colorMap) {
  if (!className) return '';
  const classes = className.split(/\s+/).filter(Boolean);
  const props = {};

  for (const cls of classes) {
    const parsed = parseTailwindClass(cls);
    Object.assign(props, parsed);
  }

  // 색상 치환
  for (const [key, val] of Object.entries(props)) {
    if (key === 'color' || key === 'background-color') {
      props[key] = resolveColor(val, colorMap);
    }
  }

  return Object.entries(props)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
}

/**
 * 경량 AST 노드에 BEM 클래스명을 부여
 */
function assignClassNames(node, prefix = 'page', counter = { value: 0 }) {
  const name = `${prefix}__el-${++counter.value}`;
  node._cssClass = name;

  if (node.children) {
    for (const child of node.children) {
      assignClassNames(child, prefix, counter);
    }
  }
}

/**
 * 이미지 URL → assets/ 로컬 경로 매핑 생성
 */
function buildImageMap(images) {
  const map = {};
  for (const img of images) {
    map[img.url] = `assets/${img.filename}`;
  }
  return map;
}

/**
 * 경량 AST를 HTML 문자열로 변환
 */
function nodeToHtml(node, imageMap, overrides = {}, indent = '  ') {
  let tag = node.tag || 'div';
  const nodeId = node.props && node.props['data-node-id'];

  // overrides 적용
  if (nodeId && overrides[nodeId]) {
    if (overrides[nodeId].tag) tag = overrides[nodeId].tag;
  }

  const attrs = [];
  if (node._cssClass) attrs.push(`class="${node._cssClass}"`);

  // props (src 등)
  if (node.props) {
    for (const [key, val] of Object.entries(node.props)) {
      if (key === 'className') continue;
      let attrVal = val;
      if (key === 'src' && imageMap[val]) {
        attrVal = imageMap[val];
      }
      attrs.push(`${key}="${attrVal}"`);
    }
  }

  const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';

  // self-closing tags
  if (tag === 'img' || tag === 'br' || tag === 'hr' || tag === 'input') {
    return `${indent}<${tag}${attrStr} />`;
  }

  const lines = [];
  lines.push(`${indent}<${tag}${attrStr}>`);

  if (node.text) {
    lines.push(`${indent}  ${node.text}`);
  }

  if (node.children) {
    for (const child of node.children) {
      lines.push(nodeToHtml(child, imageMap, overrides, indent + '  '));
    }
  }

  lines.push(`${indent}</${tag}>`);
  return lines.join('\n');
}

/**
 * 경량 AST를 CSS 문자열로 변환
 */
function nodeToCSS(node, colorMap, rules = []) {
  if (node._cssClass && node.className) {
    const cssBody = tailwindToCSS(node.className, colorMap);
    if (cssBody) {
      rules.push(`.${node._cssClass} {\n${cssBody}\n}`);
    }
  }

  if (node.children) {
    for (const child of node.children) {
      nodeToCSS(child, colorMap, rules);
    }
  }

  return rules;
}

/**
 * tokens에서 :root CSS 변수 블록 생성
 */
function generateRootVars(tokens) {
  const lines = [];
  for (const [varName, value] of Object.entries(tokens.colors)) {
    lines.push(`  ${varName}: ${value};`);
  }
  for (const [varName, value] of Object.entries(tokens.fonts)) {
    lines.push(`  ${varName}: ${value};`);
  }
  for (const [varName, value] of Object.entries(tokens.fontWeights)) {
    lines.push(`  ${varName}: ${value};`);
  }
  if (lines.length === 0) return '';
  return `:root {\n${lines.join('\n')}\n}`;
}

/**
 * 색상값 → var() 매핑 생성
 */
function buildColorMap(tokens) {
  const map = {};
  for (const [varName, hex] of Object.entries(tokens.colors)) {
    map[hex.toLowerCase()] = `var(${varName})`;
  }
  return map;
}

/**
 * 메인 변환 함수
 * @param {object} parsedData - parseJsx의 data 출력
 * @param {object} overrides - AI가 제공하는 오버라이드 (선택)
 * @returns {{ ok: boolean, data?: object }}
 */
function convertToHtml(parsedData, overrides = {}) {
  try {
    const { ast, images, tokens, meta } = parsedData;

    // 1. BEM 클래스명 부여
    assignClassNames(ast);

    // 2. 색상 맵 생성
    const colorMap = buildColorMap(tokens);

    // 3. 이미지 맵 생성
    const imageMap = buildImageMap(images);

    // 4. HTML 생성
    const bodyContent = nodeToHtml(ast, imageMap, overrides);
    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="styles.css">
    <title>Page</title>
</head>
<body>
${bodyContent}
</body>
</html>`;

    // 5. CSS 생성
    const rootVars = generateRootVars(tokens);
    const rules = nodeToCSS(ast, colorMap);
    const css = [rootVars, ...rules].filter(Boolean).join('\n\n');

    // 6. assets manifest
    const assetsManifest = images.map(img => ({
      url: img.url,
      filename: img.filename,
    }));

    return success({ html, css, assetsManifest });
  } catch (err) {
    return fail(`변환 실패: ${err.message}`, 'CONVERT_ERROR');
  }
}

// CLI
if (require.main === module) {
  const outputDir = process.argv[2];
  if (!outputDir) {
    printResult(fail('Usage: node tools/convert-to-html.js <output-dir> [--overrides <file>]', 'USAGE'));
    process.exit(1);
  }

  const parsedPath = path.join(outputDir, '.parsed.json');
  if (!fs.existsSync(parsedPath)) {
    printResult(fail(`파싱 결과 없음: ${parsedPath}. 먼저 parse-jsx를 실행하세요.`, 'FILE_NOT_FOUND'));
    process.exit(1);
  }

  const parsedData = JSON.parse(fs.readFileSync(parsedPath, 'utf-8'));

  // overrides 옵션
  let overrides = {};
  const overridesIdx = process.argv.indexOf('--overrides');
  if (overridesIdx !== -1 && process.argv[overridesIdx + 1]) {
    overrides = JSON.parse(fs.readFileSync(process.argv[overridesIdx + 1], 'utf-8'));
  }

  const result = convertToHtml(parsedData, overrides);

  if (result.ok) {
    fs.writeFileSync(path.join(outputDir, 'index.html'), result.data.html);
    fs.writeFileSync(path.join(outputDir, 'styles.css'), result.data.css);
    fs.writeFileSync(
      path.join(outputDir, 'assets-manifest.json'),
      JSON.stringify(result.data.assetsManifest, null, 2)
    );
    console.error(`[convert-to-html] Generated index.html + styles.css`);
  }

  printResult(result);
  if (!result.ok) process.exit(1);
}

module.exports = { convertToHtml };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/__tests__/convert-to-html.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add tools/convert-to-html.js tools/__tests__/convert-to-html.test.js
git commit -m "feat: add AST to HTML/CSS converter with CSS variables and overrides"
```

---

### Task 6: 기존 도구 JSON 표준화 — `download-assets.js`

**Files:**
- Modify: `tools/download-assets.js`
- Modify: `tools/__tests__/download-assets.test.js`

- [ ] **Step 1: Write failing test for JSON output**

`tools/__tests__/download-assets.test.js` 하단에 추가:

```js
it('JSON 표준화 형식으로 결과를 반환한다', async () => {
  // 빈 manifest로 실행
  fs.writeFileSync(path.join(TMP_DIR, 'assets-manifest.json'), '[]');
  const { run } = require('../download-assets.js');
  const result = await run(TMP_DIR);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.data.downloaded, 0);
  assert.strictEqual(result.data.failed, 0);
  assert.ok(Array.isArray(result.data.files));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/__tests__/download-assets.test.js`
Expected: FAIL — `result.ok` is undefined (현재는 `{ downloaded, failed }` 반환)

- [ ] **Step 3: Modify download-assets.js to return JSON format**

`tools/download-assets.js`의 `run` 함수 반환값을 변경:

```js
// 기존: return { downloaded, failed };
// 변경:
const { success } = require('./json-output.js');
return success({ downloaded, failed, files: items.map(i => i.filename) });
```

CLI 부분도 업데이트:

```js
if (require.main === module) {
  const { printResult } = require('./json-output.js');
  const outputDir = process.argv[2];
  if (!outputDir) {
    console.error('Usage: node tools/download-assets.js <outputDir>');
    process.exit(1);
  }
  run(outputDir).then(result => {
    printResult(result);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/__tests__/download-assets.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tools/download-assets.js tools/__tests__/download-assets.test.js
git commit -m "refactor: standardize download-assets output to JSON format"
```

---

### Task 7: 기존 도구 JSON 표준화 — `inject-ids.js`

**Files:**
- Modify: `tools/inject-ids.js`
- Modify: `tools/__tests__/inject-ids.test.js`

- [ ] **Step 1: Write failing test for JSON output**

`tools/__tests__/inject-ids.test.js` 하단에 추가:

```js
it('JSON 표준화 형식으로 결과를 반환한다', () => {
  const html = '<!DOCTYPE html><html><body><div><p>test</p></div></body></html>';
  fs.writeFileSync(path.join(TMP_DIR, 'index.html'), html);
  const { run } = require('../inject-ids.js');
  const result = run(TMP_DIR);
  assert.strictEqual(result.ok, true);
  assert.ok(typeof result.data.count === 'number');
  assert.ok(result.data.count > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/__tests__/inject-ids.test.js`
Expected: FAIL — `result.ok` is undefined (현재는 반환값 없음)

- [ ] **Step 3: Modify inject-ids.js to return JSON format**

`tools/inject-ids.js`의 `run` 함수에 반환값 추가:

```js
const { success } = require('./json-output.js');

function run(outputDir) {
  // ... 기존 로직 ...
  const count = (result.match(/data-element-id="/g) || []).length;
  console.error(`[inject-ids] Injected ${count} element IDs.`);
  return success({ count });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/__tests__/inject-ids.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tools/inject-ids.js tools/__tests__/inject-ids.test.js
git commit -m "refactor: standardize inject-ids output to JSON format"
```

---

### Task 8: 기존 도구 JSON 표준화 — `capture.js`

**Files:**
- Modify: `tools/capture.js`
- Modify: `tools/__tests__/capture.test.js`

- [ ] **Step 1: Write failing test for JSON output**

`tools/__tests__/capture.test.js` 하단에 추가:

```js
it('JSON 표준화 형식으로 결과를 반환한다', async () => {
  const { capture } = require('../capture.js');
  // 간단한 data URI 페이지로 테스트
  const result = await capture({
    url: 'data:text/html,<h1>test</h1>',
    outputPath: path.join(TMP_DIR, 'test.png'),
    width: 800,
  });
  assert.strictEqual(result.ok, true);
  assert.ok(result.data.path.includes('test.png'));
  assert.strictEqual(result.data.width, 800);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/__tests__/capture.test.js`
Expected: FAIL — `result.ok` is undefined (현재는 파일 경로 문자열 반환)

- [ ] **Step 3: Modify capture.js to return JSON format**

```js
const { success } = require('./json-output.js');

async function capture({ url, outputPath, width = 1440, deviceScaleFactor = 2 }) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width, height: 800 },
    deviceScaleFactor,
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.screenshot({ path: outputPath, fullPage: true });
  await browser.close();
  console.error(`[capture] Screenshot saved: ${outputPath} (${width}px @ ${deviceScaleFactor}x)`);
  return success({ path: outputPath, width });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/__tests__/capture.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tools/capture.js tools/__tests__/capture.test.js
git commit -m "refactor: standardize capture output to JSON format"
```

---

### Task 9: 기존 도구 JSON 표준화 — `validate.js`

**Files:**
- Modify: `tools/validate.js`

- [ ] **Step 1: Modify validate.js to return JSON format**

`tools/validate.js`의 `validate` 함수 반환값 변경:

```js
const { success, fail: jsonFail } = require('./json-output.js');

// 기존: return { pass, warn, fail, issues: allIssues };
// 변경:
return success({ pass, warn, fail, issues: allIssues });
```

빈 MCP 소스인 경우:

```js
// 기존: return { pass: 0, warn: 0, fail: 0, issues: [] };
// 변경:
return success({ pass: 0, warn: 0, fail: 0, issues: [] }, ['MCP 소스 없음, 검증 스킵']);
```

- [ ] **Step 2: Run existing tests**

Run: `node --test tools/__tests__/*.test.js`
Expected: 기존 테스트가 validate 반환값을 직접 테스트하지 않으므로 PASS

- [ ] **Step 3: Commit**

```bash
git add tools/validate.js
git commit -m "refactor: standardize validate output to JSON format"
```

---

### Task 10: `postprocess.js` 재작성

**Files:**
- Modify: `tools/postprocess.js`
- Modify: `tools/__tests__/postprocess.test.js`

- [ ] **Step 1: Write failing test for new pipeline**

```js
// tools/__tests__/postprocess.test.js (전체 교체)
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { postprocess } = require('../postprocess.js');

const TMP_DIR = path.join(__dirname, '__tmp_postprocess_test__');

beforeEach(() => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('postprocess (new pipeline)', () => {
  it('parse-jsx → convert-to-html → download-assets → inject-ids 순서로 실행한다', async () => {
    // .mcp-source.jsx 준비
    fs.writeFileSync(
      path.join(TMP_DIR, '.mcp-source.jsx'),
      `export default function Page() {
        return (
          <div className="relative w-[1440px] h-[900px] bg-[#ffffff]">
            <h1 className="text-[32px] text-[#2b2b2b]">Hello World</h1>
          </div>
        );
      }`
    );

    const result = await postprocess(TMP_DIR);

    assert.strictEqual(result.ok, true);
    assert.ok(fs.existsSync(path.join(TMP_DIR, 'index.html')));
    assert.ok(fs.existsSync(path.join(TMP_DIR, 'styles.css')));

    const html = fs.readFileSync(path.join(TMP_DIR, 'index.html'), 'utf-8');
    assert.ok(html.includes('Hello World'));
    assert.ok(html.includes('data-element-id'));

    const css = fs.readFileSync(path.join(TMP_DIR, 'styles.css'), 'utf-8');
    assert.ok(css.includes(':root'));
  });

  it('.mcp-source.jsx가 없으면 ok:false를 반환한다', async () => {
    const result = await postprocess(TMP_DIR);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'FILE_NOT_FOUND');
  });

  it('각 단계의 결과를 steps에 포함한다', async () => {
    fs.writeFileSync(
      path.join(TMP_DIR, '.mcp-source.jsx'),
      `export default function Page() {
        return <div className="w-[100px]"><p>test</p></div>;
      }`
    );

    const result = await postprocess(TMP_DIR);
    assert.ok(result.data.steps.parse);
    assert.ok(result.data.steps.convert);
    assert.ok(result.data.steps.download);
    assert.ok(result.data.steps.inject);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/__tests__/postprocess.test.js`
Expected: FAIL — 새 파이프라인이 아직 구현되지 않음

- [ ] **Step 3: Rewrite postprocess.js**

```js
// tools/postprocess.js
const path = require('node:path');
const fs = require('node:fs');
const { success, fail, printResult } = require('./json-output.js');

async function postprocess(outputDir) {
  const absDir = path.resolve(outputDir);

  // 1. .mcp-source.jsx 확인
  const jsxPath = path.join(absDir, '.mcp-source.jsx');
  if (!fs.existsSync(jsxPath)) {
    return fail(`MCP 소스 없음: ${jsxPath}`, 'FILE_NOT_FOUND');
  }

  console.error('\n=== figma-to-code postprocess ===');
  console.error(`Output: ${absDir}\n`);

  // 2. Parse JSX
  console.error('--- Step 1: Parse JSX ---');
  const { parseJsx } = require('./parse-jsx.js');
  const jsx = fs.readFileSync(jsxPath, 'utf-8');
  const parseResult = parseJsx(jsx);
  if (!parseResult.ok) return parseResult;

  // 파싱 결과 저장 (convert-to-html이 읽을 수 있도록)
  fs.writeFileSync(path.join(absDir, '.parsed.json'), JSON.stringify(parseResult.data, null, 2));
  console.error(`[parse-jsx] ${parseResult.data.meta.nodeCount} nodes, ${parseResult.data.meta.imageCount} images`);

  // 3. Convert to HTML
  console.error('\n--- Step 2: Convert to HTML ---');
  const { convertToHtml } = require('./convert-to-html.js');
  const convertResult = convertToHtml(parseResult.data);
  if (!convertResult.ok) return convertResult;

  fs.writeFileSync(path.join(absDir, 'index.html'), convertResult.data.html);
  fs.writeFileSync(path.join(absDir, 'styles.css'), convertResult.data.css);
  fs.writeFileSync(
    path.join(absDir, 'assets-manifest.json'),
    JSON.stringify(convertResult.data.assetsManifest, null, 2)
  );
  console.error('[convert-to-html] Generated index.html + styles.css');

  // 4. Download Assets
  console.error('\n--- Step 3: Download Assets ---');
  const { run: runDownload } = require('./download-assets.js');
  const downloadResult = await runDownload(absDir);

  // 5. Inject IDs
  console.error('\n--- Step 4: Inject Element IDs ---');
  const { run: runInject } = require('./inject-ids.js');
  const injectResult = runInject(absDir);

  console.error('\n=== Postprocess complete ===\n');

  return success({
    steps: {
      parse: { nodeCount: parseResult.data.meta.nodeCount, imageCount: parseResult.data.meta.imageCount },
      convert: { htmlPath: path.join(absDir, 'index.html'), cssPath: path.join(absDir, 'styles.css') },
      download: downloadResult.ok ? downloadResult.data : { downloaded: 0, failed: 0, files: [] },
      inject: injectResult.ok ? injectResult.data : { count: 0 },
    },
    files: fs.readdirSync(absDir).filter(f => !f.startsWith('.')),
    warnings: [
      ...parseResult.warnings,
      ...convertResult.warnings,
      ...(downloadResult.warnings || []),
      ...(injectResult.warnings || []),
    ],
  });
}

if (require.main === module) {
  const outputDir = process.argv[2];
  if (!outputDir) {
    printResult(fail('Usage: node tools/postprocess.js <outputDir>', 'USAGE'));
    process.exit(1);
  }

  if (!fs.existsSync(outputDir)) {
    printResult(fail(`디렉토리 없음: ${outputDir}`, 'DIR_NOT_FOUND'));
    process.exit(1);
  }

  postprocess(outputDir).then(result => {
    printResult(result);
    if (!result.ok) process.exit(1);
  }).catch(err => {
    printResult(fail(`Fatal error: ${err.message}`, 'FATAL'));
    process.exit(1);
  });
}

module.exports = { postprocess };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/__tests__/postprocess.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add tools/postprocess.js tools/__tests__/postprocess.test.js
git commit -m "refactor: rewrite postprocess as parse-jsx -> convert -> download -> inject pipeline"
```

---

### Task 11: 삭제 대상 파일 제거

**Files:**
- Delete: `tools/assemble.js`, `tools/token-extractor.js`, `tools/normalize.js`, `tools/parse-mcp.js`
- Delete: `tools/__tests__/assemble.test.js`, `tools/__tests__/token-extractor.test.js`, `tools/__tests__/normalize.test.js`, `tools/__tests__/integration.test.js`

- [ ] **Step 1: Run all tests to confirm current state**

Run: `node --test tools/__tests__/json-output.test.js tools/__tests__/parse-jsx.test.js tools/__tests__/convert-to-html.test.js tools/__tests__/postprocess.test.js tools/__tests__/inject-ids.test.js tools/__tests__/download-assets.test.js`
Expected: ALL PASS

- [ ] **Step 2: Delete obsolete files**

```bash
git rm tools/assemble.js tools/token-extractor.js tools/normalize.js tools/parse-mcp.js
git rm tools/__tests__/assemble.test.js tools/__tests__/token-extractor.test.js tools/__tests__/normalize.test.js tools/__tests__/integration.test.js
```

- [ ] **Step 3: Run remaining tests to confirm nothing broke**

Run: `node --test tools/__tests__/*.test.js`
Expected: ALL PASS (삭제한 파일의 테스트는 없으므로 남은 테스트만 실행)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove obsolete pipeline tools (assemble, token-extractor, normalize, parse-mcp)"
```

---

### Task 12: SKILL.md 에이전트 루프로 재작성

**Files:**
- Modify: `skills/figma-to-code/SKILL.md`

- [ ] **Step 1: Read current SKILL.md**

파일 경로: `skills/figma-to-code/SKILL.md`

- [ ] **Step 2: Rewrite SKILL.md**

Step 3 (섹션 식별)과 Step 4 (섹션별 변환)를 삭제하고, AI 에이전트 루프로 교체한다. 핵심 변경:

- Step 3 → `parse-jsx` 실행하여 구조/이미지/토큰 확인
- Step 4 → `convert-to-html` 실행하여 초안 생성 (또는 `postprocess` 일괄 실행)
- Step 5 → 시각적 보정 루프를 AI 자율 판단 반복으로 변경 (횟수 제한 제거)
- 각 도구를 독립적으로 호출할 수 있음을 명시
- AI가 validate 결과를 보고 자동 수정하는 흐름 추가
- convert-to-html의 overrides 기능 설명 추가

주요 내용:

```markdown
### Step 3: 자동 변환

1. **parse-jsx** 실행:
\`\`\`bash
node tools/parse-jsx.js output/.mcp-source.jsx > output/.parsed.json
\`\`\`
결과 JSON에서 `images`, `tokens`, `meta`를 확인한다.

2. **convert-to-html** 실행:
\`\`\`bash
node tools/convert-to-html.js output/
\`\`\`
`output/index.html` + `output/styles.css` + `output/assets-manifest.json` 생성.

3. **download-assets** 실행:
\`\`\`bash
node tools/download-assets.js output/
\`\`\`

또는 한번에:
\`\`\`bash
node tools/postprocess.js output/
\`\`\`

### Step 4: 시각적 보정 루프 (AI 자율)

1. preview-server 기동 + capture로 스크린샷 촬영
2. Figma 원본 스크린샷과 비교 (AI 비전)
3. 차이점에 따라 판단:
   - 구조 문제 → overrides로 convert-to-html 재실행
   - 스타일 문제 → CSS 직접 수정
   - 이미지 문제 → 크롭 좌표 수정 또는 재다운로드
4. 완벽해질 때까지 반복 (횟수 제한 없음)
```

- [ ] **Step 3: Run all tests**

Run: `node --test tools/__tests__/*.test.js`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add skills/figma-to-code/SKILL.md
git commit -m "docs: rewrite SKILL.md for AI agent loop architecture"
```

---

### Task 13: 전체 통합 테스트

**Files:**
- All modified files

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: ALL PASS

- [ ] **Step 2: End-to-end manual test**

샘플 JSX 파일을 만들어서 전체 파이프라인 테스트:

```bash
mkdir -p /tmp/figma-test
cat > /tmp/figma-test/.mcp-source.jsx << 'EOF'
export default function Page() {
  return (
    <div className="relative w-[1440px] h-[900px] bg-[#f5f5f5]">
      <div className="absolute left-[186px] top-[80px] w-[1052px]">
        <h1 className="text-[48px] text-[#2b2b2b] font-['Inter:Bold']">Welcome</h1>
        <p className="text-[18px] text-[#666666] leading-[28px]">This is a test page</p>
        <img src="https://via.placeholder.com/500x300" className="w-[500px] h-[300px]" />
      </div>
    </div>
  );
}
EOF
node tools/postprocess.js /tmp/figma-test
```

Expected: `index.html`, `styles.css`, `assets-manifest.json` 생성. JSON 결과 출력.

- [ ] **Step 3: Verify JSON output**

```bash
node tools/postprocess.js /tmp/figma-test 2>/dev/null | node -e "
  const r = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  console.log('ok:', r.ok);
  console.log('steps:', Object.keys(r.data.steps));
  console.log('images:', r.data.steps.parse.imageCount);
"
```

Expected:
```
ok: true
steps: [ 'parse', 'convert', 'download', 'inject' ]
images: 1
```

- [ ] **Step 4: Cleanup and final commit**

```bash
rm -rf /tmp/figma-test
```
