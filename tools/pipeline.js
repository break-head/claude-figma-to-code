const path = require('node:path');
const fs = require('node:fs');
const { execSync } = require('node:child_process');

async function run(outputDir) {
  const absDir = path.resolve(outputDir);
  const toolsDir = __dirname;

  console.log(`\n=== figma-to-code pipeline ===`);
  console.log(`Output: ${absDir}\n`);

  // 0. Check dependencies
  const nodeModulesPath = path.join(path.dirname(toolsDir), 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    console.log('[pipeline] Installing dependencies...');
    execSync('npm install', { cwd: path.dirname(toolsDir), stdio: 'inherit' });
  }

  // 1. Token Extractor
  console.log('\n--- Step 1: Token Extractor ---');
  const { run: runTokens } = require('./token-extractor.js');
  runTokens(absDir);

  // 2. Download Assets
  console.log('\n--- Step 2: Download Assets ---');
  const { run: runDownload } = require('./download-assets.js');
  await runDownload(absDir);

  // 3. Inject IDs
  console.log('\n--- Step 3: Inject Element IDs ---');
  const { run: runInject } = require('./inject-ids.js');
  runInject(absDir);

  // 4. Live Server
  console.log('\n--- Step 4: Live Server ---');
  const { startServer } = require('./live-server/server.js');
  startServer(absDir);

  console.log('\n=== Pipeline complete ===');
  console.log(`Preview: http://localhost:3100`);
  console.log(`Press Ctrl+C to stop.\n`);
}

if (require.main === module) {
  const outputDir = process.argv[2];
  if (!outputDir) {
    console.error('Usage: node tools/pipeline.js <outputDir>');
    console.error('Example: node tools/pipeline.js output/');
    process.exit(1);
  }

  if (!fs.existsSync(outputDir)) {
    console.error(`[pipeline] Directory not found: ${outputDir}`);
    process.exit(1);
  }

  run(outputDir).catch((err) => {
    console.error('[pipeline] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { run };
