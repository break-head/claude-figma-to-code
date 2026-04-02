const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { convertToHtml } = require('../convert-to-html.js');

// ─────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────

const simpleParsed = {
  ast: {
    tag: 'div',
    className: 'relative w-[1052px] h-[800px] bg-[#ffffff]',
    props: {},
    children: [
      {
        tag: 'span',
        className: 'text-[20px] text-[#2b2b2b]',
        props: {},
        children: [],
        text: 'Hello',
      },
    ],
  },
  images: [],
  tokens: {
    colors: ['#ffffff', '#2b2b2b'],
    fonts: [],
    fontWeights: [],
  },
  meta: { width: '1052px', height: '800px', nodeCount: 2, imageCount: 0 },
};

const parsedWithImage = {
  ast: {
    tag: 'div',
    className: 'relative w-[500px] h-[300px] overflow-hidden',
    props: {},
    children: [
      {
        tag: 'img',
        className: 'absolute w-[200px] h-[150px]',
        props: { src: 'https://example.com/photo.png' },
        children: [],
      },
    ],
  },
  images: [
    { src: 'https://example.com/photo.png', className: 'absolute w-[200px] h-[150px]', isCrop: false },
  ],
  tokens: { colors: [], fonts: [], fontWeights: [] },
  meta: { width: '500px', height: '300px', nodeCount: 2, imageCount: 1 },
};

const parsedWithCrop = {
  ast: {
    tag: 'div',
    className: 'relative w-[500px] h-[300px] overflow-hidden',
    props: {},
    children: [
      {
        tag: 'img',
        className: 'absolute w-[652.38%] h-[123.45%] left-[-493.07%] top-[-10%]',
        props: { src: 'https://cdn.example.com/hero.jpg' },
        children: [],
      },
    ],
  },
  images: [
    {
      src: 'https://cdn.example.com/hero.jpg',
      className: 'absolute w-[652.38%] h-[123.45%] left-[-493.07%] top-[-10%]',
      isCrop: true,
    },
  ],
  tokens: { colors: [], fonts: [], fontWeights: [] },
  meta: { width: '500px', height: '300px', nodeCount: 2, imageCount: 1 },
};

const parsedWithNodeId = {
  ast: {
    tag: 'div',
    className: 'relative w-[1052px] h-[800px]',
    props: { 'data-node-id': '42:353' },
    children: [],
  },
  images: [],
  tokens: { colors: [], fonts: [], fontWeights: [] },
  meta: { width: '1052px', height: '800px', nodeCount: 1, imageCount: 0 },
};

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('convertToHtml', () => {
  it('ok:true를 반환한다', () => {
    const result = convertToHtml(simpleParsed);
    assert.equal(result.ok, true);
  });

  it('html, css, assetsManifest를 반환한다', () => {
    const result = convertToHtml(simpleParsed);
    assert.ok(typeof result.data.html === 'string');
    assert.ok(typeof result.data.css === 'string');
    assert.ok(Array.isArray(result.data.assetsManifest));
  });

  it('HTML에 DOCTYPE과 기본 구조가 있다', () => {
    const { html } = convertToHtml(simpleParsed).data;
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('<html'));
    assert.ok(html.includes('<head'));
    assert.ok(html.includes('<body'));
  });

  it('CSS가 styles.css를 참조한다', () => {
    const { html } = convertToHtml(simpleParsed).data;
    assert.ok(html.includes('styles.css'));
  });

  it('AST를 유효한 HTML로 변환한다 (루트 tag 포함)', () => {
    const { html } = convertToHtml(simpleParsed).data;
    assert.ok(html.includes('<div'));
    assert.ok(html.includes('<span'));
    assert.ok(html.includes('Hello'));
  });

  it(':root에 CSS 변수를 생성한다', () => {
    const { css } = convertToHtml(simpleParsed).data;
    assert.ok(css.includes(':root'));
    assert.ok(css.includes('--color-1'));
    assert.ok(css.includes('--color-2'));
    assert.ok(css.includes('#ffffff'));
    assert.ok(css.includes('#2b2b2b'));
  });

  it('CSS에서 색상 값을 var() 참조로 교체한다', () => {
    const { css } = convertToHtml(simpleParsed).data;
    // Should use var(--color-N) not raw hex in rules
    assert.ok(css.includes('var(--color-'));
  });

  it('BEM 클래스명을 생성한다 (page__el-N 형식)', () => {
    const { html } = convertToHtml(simpleParsed).data;
    assert.ok(html.includes('page__el-1'));
    assert.ok(html.includes('page__el-2'));
  });

  it('BEM 클래스명으로 CSS 규칙을 생성한다', () => {
    const { css } = convertToHtml(simpleParsed).data;
    assert.ok(css.includes('.page__el-1'));
    assert.ok(css.includes('.page__el-2'));
  });

  it('img src를 assets/ 경로로 변환한다', () => {
    const { html } = convertToHtml(parsedWithImage).data;
    assert.ok(html.includes('assets/photo.png'));
    assert.ok(!html.includes('https://example.com/photo.png'));
  });

  it('assetsManifest에 모든 이미지가 포함된다', () => {
    const { assetsManifest } = convertToHtml(parsedWithImage).data;
    assert.equal(assetsManifest.length, 1);
    assert.equal(assetsManifest[0].src, 'https://example.com/photo.png');
    assert.equal(assetsManifest[0].dest, 'assets/photo.png');
  });

  it('여러 이미지가 모두 assetsManifest에 있다', () => {
    const parsed = {
      ast: {
        tag: 'div',
        className: 'relative w-[500px] h-[300px]',
        props: {},
        children: [
          { tag: 'img', className: '', props: { src: 'https://a.com/img1.png' }, children: [] },
          { tag: 'img', className: '', props: { src: 'https://b.com/img2.jpg' }, children: [] },
          { tag: 'img', className: '', props: { src: 'https://c.com/img3.png' }, children: [] },
        ],
      },
      images: [
        { src: 'https://a.com/img1.png', isCrop: false },
        { src: 'https://b.com/img2.jpg', isCrop: false },
        { src: 'https://c.com/img3.png', isCrop: false },
      ],
      tokens: { colors: [], fonts: [], fontWeights: [] },
      meta: { width: '500px', height: '300px', nodeCount: 4, imageCount: 3 },
    };
    const { assetsManifest } = convertToHtml(parsed).data;
    assert.equal(assetsManifest.length, 3);
  });

  it('크롭 이미지 CSS를 보존한다 (percent-based values)', () => {
    const { css } = convertToHtml(parsedWithCrop).data;
    // Should contain percent-based positioning
    assert.ok(css.includes('652.38%') || css.includes('-493.07%'));
  });

  it('overrides로 tag를 변경한다 (data-node-id 기반)', () => {
    const result = convertToHtml(parsedWithNodeId, { '42:353': { tag: 'nav' } });
    assert.equal(result.ok, true);
    assert.ok(result.data.html.includes('<nav'));
    assert.ok(!result.data.html.includes('<div class="page__el-1"'));
  });

  it('parsedData가 없으면 ok:false를 반환한다', () => {
    const result = convertToHtml(null);
    assert.equal(result.ok, false);
  });

  it('ast가 없으면 ok:false를 반환한다', () => {
    const result = convertToHtml({ images: [], tokens: {} });
    assert.equal(result.ok, false);
  });

  it('img 태그가 self-closing으로 렌더링된다', () => {
    const { html } = convertToHtml(parsedWithImage).data;
    assert.ok(html.includes('<img') && html.includes('/>'));
    assert.ok(!html.includes('</img>'));
  });

  it('colors가 없으면 :root 블록이 없다', () => {
    const parsed = {
      ast: { tag: 'div', className: 'relative w-[100px] h-[100px]', props: {}, children: [] },
      images: [],
      tokens: { colors: [], fonts: [], fontWeights: [] },
      meta: {},
    };
    const { css } = convertToHtml(parsed).data;
    assert.ok(!css.includes(':root'));
  });
});
