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
    let captured = '';
    const orig = console.error;
    console.error = (msg) => { captured = msg; };
    warn('테스트 경고');
    console.error = orig;
    assert.ok(captured.includes('테스트 경고'));
  });
});
