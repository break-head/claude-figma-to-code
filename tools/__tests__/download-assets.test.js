const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseManifest, sanitizeFilename } = require('../download-assets.js');

const TMP_DIR = path.join(__dirname, '__tmp_assets_test__');

beforeEach(() => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('parseManifest', () => {
  it('유효한 매니페스트를 파싱한다', () => {
    const manifest = [
      { url: 'https://example.com/img.png', filename: 'hero.png' },
      { url: 'https://example.com/logo.svg', filename: 'logo.svg' }
    ];
    const manifestPath = path.join(TMP_DIR, 'assets-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const result = parseManifest(manifestPath);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].filename, 'hero.png');
  });

  it('빈 매니페스트를 처리한다', () => {
    const manifestPath = path.join(TMP_DIR, 'assets-manifest.json');
    fs.writeFileSync(manifestPath, '[]');
    const result = parseManifest(manifestPath);
    assert.strictEqual(result.length, 0);
  });

  it('파일이 없으면 빈 배열을 반환한다', () => {
    const result = parseManifest(path.join(TMP_DIR, 'nonexistent.json'));
    assert.deepStrictEqual(result, []);
  });
});

describe('sanitizeFilename', () => {
  it('특수문자를 제거한다', () => {
    assert.strictEqual(sanitizeFilename('hero image (1).png'), 'hero-image-1.png');
  });

  it('한글 파일명을 유지한다', () => {
    const result = sanitizeFilename('배경이미지.png');
    assert.ok(result.endsWith('.png'));
  });

  it('빈 이름에 fallback을 제공한다', () => {
    const result = sanitizeFilename('');
    assert.ok(result.length > 0);
  });
});
