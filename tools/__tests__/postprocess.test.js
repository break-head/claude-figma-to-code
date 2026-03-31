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
    fs.writeFileSync(
      path.join(TMP_DIR, 'sections', '01-hero.html'),
      '<section class="hero"><h1>Hello</h1></section>'
    );
    fs.writeFileSync(
      path.join(TMP_DIR, 'sections', '01-hero.css'),
      ':root { --color-primary: #E0004D; }\n.hero { color: #E0004D; }'
    );
    fs.writeFileSync(
      path.join(TMP_DIR, 'assets-manifest.json'),
      '[]'
    );

    const result = await postprocess(TMP_DIR);

    assert.ok(fs.existsSync(path.join(TMP_DIR, 'index.html')));
    assert.ok(fs.existsSync(path.join(TMP_DIR, 'styles.css')));

    const html = fs.readFileSync(path.join(TMP_DIR, 'index.html'), 'utf-8');
    assert.ok(html.includes('data-element-id'));

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
