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

    assert.ok(fs.existsSync(path.join(TMP_DIR, 'index.html')));
    assert.ok(fs.existsSync(path.join(TMP_DIR, 'styles.css')));

    const html = fs.readFileSync(path.join(TMP_DIR, 'index.html'), 'utf-8');
    const css = fs.readFileSync(path.join(TMP_DIR, 'styles.css'), 'utf-8');

    // HTML structure
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('<link rel="stylesheet" href="styles.css">'));
    assert.ok(html.includes('data-element-id'));
    assert.ok(html.indexOf('Welcome') < html.indexOf('© 2026'));

    // CSS normalization
    assert.ok(css.includes(':root'));
    assert.ok(css.includes('--color-primary: #E0004D'));
  });

  it('빈 프로젝트에서도 에러 없이 완료', async () => {
    fs.writeFileSync(path.join(TMP_DIR, 'assets-manifest.json'), '[]');
    const result = await postprocess(TMP_DIR);
    assert.ok(fs.existsSync(path.join(TMP_DIR, 'index.html')));
  });
});
