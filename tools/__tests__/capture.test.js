const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { capture } = require('../capture.js');
const { startServer } = require('../preview-server.js');

const TMP_DIR = path.join(__dirname, '__tmp_capture_test__');
const PORT = 3160;

function waitForListening(server) {
  return new Promise(resolve => {
    if (server.listening) return resolve();
    server.on('listening', resolve);
  });
}

beforeEach(() => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(TMP_DIR, 'index.html'),
    '<html><body style="margin:0;width:400px;height:300px;background:red;"><h1>Test</h1></body></html>'
  );
});

afterEach(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('capture', () => {
  it('스크린샷을 PNG로 저장한다', async () => {
    const server = startServer(TMP_DIR, PORT);
    await waitForListening(server);
    try {
      const result = await capture({
        url: `http://localhost:${PORT}`,
        outputPath: path.join(TMP_DIR, '.preview-screenshot.png'),
        width: 400,
      });
      assert.ok(result.ok);
      assert.ok(fs.existsSync(result.data.path));
      const stat = fs.statSync(result.data.path);
      assert.ok(stat.size > 0);
    } finally {
      server.close();
    }
  });

  it('지정한 viewport width로 캡처한다', async () => {
    const server = startServer(TMP_DIR, PORT + 1);
    await waitForListening(server);
    try {
      const result = await capture({
        url: `http://localhost:${PORT + 1}`,
        outputPath: path.join(TMP_DIR, 'test-capture.png'),
        width: 1440,
      });
      assert.ok(result.ok);
      assert.ok(fs.existsSync(result.data.path));
    } finally {
      server.close();
    }
  });
});
