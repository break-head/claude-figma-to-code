const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocketServer } = require('ws');
const cheerio = require('cheerio');

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

function injectOverlay(html, wsPort) {
  const overlayPath = path.join(__dirname, 'overlay.js');
  if (!fs.existsSync(overlayPath)) {
    return html; // overlay.js not yet created, skip injection
  }
  const overlayCode = fs.readFileSync(overlayPath, 'utf-8');
  const injection = `\n<script>\n  window.__FIGMA_TO_CODE_WS_PORT__ = ${wsPort};\n  ${overlayCode}\n</script>`;
  return html.replace('</body>', `${injection}\n</body>`);
}

function updateCssProperty(cssContent, elementId, property, value) {
  const selector = `[data-element-id="${elementId}"]`;
  const selectorRegex = new RegExp(
    `(\\[data-element-id="${elementId}"\\]\\s*\\{[^}]*)${property}\\s*:[^;]*;`,
    's'
  );

  if (selectorRegex.test(cssContent)) {
    return cssContent.replace(selectorRegex, `$1${property}: ${value};`);
  }

  const existingSelectorRegex = new RegExp(`\\[data-element-id="${elementId}"\\]\\s*\\{`, 's');
  if (existingSelectorRegex.test(cssContent)) {
    return cssContent.replace(
      existingSelectorRegex,
      `[data-element-id="${elementId}"] {\n  ${property}: ${value};`
    );
  }

  return cssContent + `\n\n${selector} {\n  ${property}: ${value};\n}\n`;
}

function updateHtmlText(htmlContent, elementId, newText) {
  const $ = cheerio.load(htmlContent, { decodeEntities: false });
  const $el = $(`[data-element-id="${elementId}"]`);
  if ($el.length === 0) return htmlContent;

  if ($el.children().length > 0) {
    $el.contents().filter(function() { return this.type === 'text'; }).first().replaceWith(newText);
  } else {
    $el.text(newText);
  }
  return $.html();
}

function startServer(outputDir, port = 3100, wsPort = 3101) {
  const httpServer = http.createServer((req, res) => {
    let filePath = path.join(outputDir, req.url === '/' ? 'index.html' : req.url);
    const ext = path.extname(filePath);

    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    if (ext === '.html') {
      const html = fs.readFileSync(filePath, 'utf-8');
      const injected = injectOverlay(html, wsPort);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(injected);
    } else {
      const stream = fs.createReadStream(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      stream.pipe(res);
    }
  });

  const wss = new WebSocketServer({ port: wsPort });
  const clients = new Set();

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      const htmlPath = path.join(outputDir, 'index.html');
      const cssPath = path.join(outputDir, 'styles.css');

      if (msg.type === 'style-update') {
        if (!fs.existsSync(cssPath)) return;
        const css = fs.readFileSync(cssPath, 'utf-8');
        const updated = updateCssProperty(css, msg.elementId, msg.property, msg.value);
        fs.writeFileSync(cssPath, updated);
      }

      if (msg.type === 'text-update') {
        if (!fs.existsSync(htmlPath)) return;
        const html = fs.readFileSync(htmlPath, 'utf-8');
        const updated = updateHtmlText(html, msg.elementId, msg.content);
        fs.writeFileSync(htmlPath, updated);
      }
    });
  });

  function broadcast(data) {
    const payload = JSON.stringify(data);
    for (const client of clients) {
      if (client.readyState === 1) client.send(payload);
    }
  }

  let debounceTimer = null;
  const chokidar = require('chokidar');
  const watcher = chokidar.watch(outputDir, {
    ignored: /(^|[/\\])\./,
    ignoreInitial: true,
  });

  watcher.on('change', (changedPath) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      broadcast({ type: 'reload' });
    }, 200);
  });

  httpServer.listen(port, () => {
    console.log(`[live-server] Serving at http://localhost:${port}`);
    console.log(`[live-server] WebSocket at ws://localhost:${wsPort}`);
    console.log(`[live-server] Watching ${outputDir} for changes...`);
  });

  return { httpServer, wss, watcher };
}

if (require.main === module) {
  const outputDir = process.argv[2];
  const port = parseInt(process.argv[3] || '3100', 10);
  const wsPort = parseInt(process.argv[4] || '3101', 10);

  if (!outputDir) {
    console.error('Usage: node tools/live-server/server.js <outputDir> [port] [wsPort]');
    process.exit(1);
  }

  startServer(path.resolve(outputDir), port, wsPort);
}

module.exports = { startServer, updateCssProperty, updateHtmlText, injectOverlay };
