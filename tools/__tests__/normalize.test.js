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
