const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const GRAB_SCRIPT = `<script src="//unpkg.com/react-grab/dist/index.global.js" crossorigin="anonymous"></script>`;

const RELOAD_SCRIPT = `
<script>
(function() {
  var es = new EventSource('/__reload');
  es.onmessage = function() { location.reload(); };
})();
</script>`;

function injectReloadScript(html) {
  return html.replace('</body>', `${GRAB_SCRIPT}\n${RELOAD_SCRIPT}\n</body>`);
}

function startServer(outputDir, port = 3100) {
  const sseClients = new Set();

  const server = http.createServer((req, res) => {
    if (req.url === '/__reload') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    const filePath = path.join(outputDir, req.url === '/' ? 'index.html' : req.url);
    const ext = path.extname(filePath);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    if (ext === '.html') {
      const html = fs.readFileSync(filePath, 'utf-8');
      const injected = injectReloadScript(html);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(injected);
    } else {
      const stream = fs.createReadStream(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      stream.pipe(res);
    }
  });

  let watcher;
  try {
    const chokidar = require('chokidar');
    let debounceTimer = null;
    watcher = chokidar.watch(outputDir, {
      ignored: /(^|[/\\])\./,
      ignoreInitial: true,
    });
    watcher.on('change', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        for (const client of sseClients) {
          client.write('data: reload\n\n');
        }
      }, 200);
    });
  } catch {
    // chokidar not available, skip file watching
  }

  server.listen(port, () => {
    console.log(`[preview-server] http://localhost:${port}`);
  });

  const originalClose = server.close.bind(server);
  server.close = (cb) => {
    if (watcher) watcher.close();
    for (const client of sseClients) client.end();
    originalClose(cb);
  };

  return server;
}

if (require.main === module) {
  const outputDir = process.argv[2] || 'output';
  const port = parseInt(process.argv[3] || '3100', 10);

  if (!fs.existsSync(outputDir)) {
    console.error(`[preview-server] Directory not found: ${outputDir}`);
    process.exit(1);
  }

  startServer(path.resolve(outputDir), port);
}

module.exports = { startServer, injectReloadScript };
