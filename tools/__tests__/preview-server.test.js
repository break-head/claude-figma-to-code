const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { startServer } = require('../preview-server.js');

const TMP_DIR = path.join(__dirname, '__tmp_preview_test__');

function waitForListening(server) {
  return new Promise((resolve) => {
    if (server.listening) return resolve();
    server.on('listening', resolve);
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

function httpGet(port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${port}${urlPath}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    }).on('error', reject);
  });
}

describe('preview-server', () => {
  before(() => {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    fs.writeFileSync(path.join(TMP_DIR, 'index.html'), '<html><body><h1>Test</h1></body></html>');
    fs.writeFileSync(path.join(TMP_DIR, 'styles.css'), 'h1 { color: red; }');
  });

  after(() => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it('HTML 파일을 서빙한다', async () => {
    const server = startServer(TMP_DIR, 3151);
    await waitForListening(server);
    try {
      const res = await httpGet(3151, '/');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.includes('<h1>Test</h1>'));
      assert.ok(res.headers['content-type'].includes('text/html'));
    } finally {
      await closeServer(server);
    }
  });

  it('CSS 파일을 서빙한다', async () => {
    const server = startServer(TMP_DIR, 3152);
    await waitForListening(server);
    try {
      const res = await httpGet(3152, '/styles.css');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.includes('color: red'));
    } finally {
      await closeServer(server);
    }
  });

  it('없는 파일은 404를 반환한다', async () => {
    const server = startServer(TMP_DIR, 3153);
    await waitForListening(server);
    try {
      const res = await httpGet(3153, '/nonexistent.html');
      assert.strictEqual(res.status, 404);
    } finally {
      await closeServer(server);
    }
  });

  it('자동 리로드 스크립트를 HTML에 주입한다', async () => {
    const server = startServer(TMP_DIR, 3154);
    await waitForListening(server);
    try {
      const res = await httpGet(3154, '/');
      assert.ok(res.body.includes('new EventSource'));
    } finally {
      await closeServer(server);
    }
  });
});
