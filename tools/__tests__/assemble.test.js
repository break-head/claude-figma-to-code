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
