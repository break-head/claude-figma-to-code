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
