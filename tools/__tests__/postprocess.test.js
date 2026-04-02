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
