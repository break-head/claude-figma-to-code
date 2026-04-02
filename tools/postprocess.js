const path = require('node:path');
const fs = require('node:fs');
const { success, fail, printResult } = require('./json-output.js');

async function postprocess(outputDir) {
  const absDir = path.resolve(outputDir);
  const jsxPath = path.join(absDir, '.mcp-source.jsx');

  if (!fs.existsSync(jsxPath)) {
    return fail(`MCP 소스 없음: ${jsxPath}`, 'FILE_NOT_FOUND');
  }

  console.error('\n=== figma-to-code postprocess ===');
  console.error(`Output: ${absDir}\n`);

  // 1. Parse JSX
  console.error('--- Step 1: Parse JSX ---');
  const { parseJsx } = require('./parse-jsx.js');
  const jsx = fs.readFileSync(jsxPath, 'utf-8');
  const parseResult = parseJsx(jsx);
  if (!parseResult.ok) return parseResult;

  fs.writeFileSync(path.join(absDir, '.parsed.json'), JSON.stringify(parseResult.data, null, 2));
  console.error(`[parse-jsx] ${parseResult.data.meta.nodeCount} nodes, ${parseResult.data.meta.imageCount} images`);

  // 2. Convert to HTML
  console.error('\n--- Step 2: Convert to HTML ---');
  const { convertToHtml } = require('./convert-to-html.js');
  const convertResult = convertToHtml(parseResult.data);
  if (!convertResult.ok) return convertResult;

  fs.writeFileSync(path.join(absDir, 'index.html'), convertResult.data.html);
  fs.writeFileSync(path.join(absDir, 'styles.css'), convertResult.data.css);
  fs.writeFileSync(path.join(absDir, 'assets-manifest.json'), JSON.stringify(convertResult.data.assetsManifest, null, 2));
  console.error('[convert-to-html] Generated index.html + styles.css');

  // 3. Download Assets
  console.error('\n--- Step 3: Download Assets ---');
  const { run: runDownload } = require('./download-assets.js');
  const downloadResult = await runDownload(absDir);

  // 4. Inject IDs
  console.error('\n--- Step 4: Inject Element IDs ---');
  const { run: runInject } = require('./inject-ids.js');
  const injectResult = runInject(absDir);

  console.error('\n=== Postprocess complete ===\n');

  return success({
    steps: {
      parse: { nodeCount: parseResult.data.meta.nodeCount, imageCount: parseResult.data.meta.imageCount },
      convert: { htmlPath: path.join(absDir, 'index.html'), cssPath: path.join(absDir, 'styles.css') },
      download: downloadResult.ok ? downloadResult.data : { downloaded: 0, failed: 0, files: [] },
      inject: injectResult.ok ? injectResult.data : { count: 0 },
    },
    files: fs.readdirSync(absDir).filter(f => !f.startsWith('.')),
    warnings: [
      ...(parseResult.warnings || []),
      ...(convertResult.warnings || []),
      ...(downloadResult.warnings || []),
      ...(injectResult.warnings || []),
    ],
  });
}

if (require.main === module) {
  const outputDir = process.argv[2];
  if (!outputDir) {
    printResult(fail('Usage: node tools/postprocess.js <outputDir>', 'USAGE'));
    process.exit(1);
  }
  if (!fs.existsSync(outputDir)) {
    printResult(fail(`디렉토리 없음: ${outputDir}`, 'DIR_NOT_FOUND'));
    process.exit(1);
  }
  postprocess(outputDir).then(result => {
    printResult(result);
    if (!result.ok) process.exit(1);
  }).catch(err => {
    printResult(fail(`Fatal error: ${err.message}`, 'FATAL'));
    process.exit(1);
  });
}

module.exports = { postprocess };
