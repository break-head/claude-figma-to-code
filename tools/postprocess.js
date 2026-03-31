const path = require('node:path');
const fs = require('node:fs');

async function postprocess(outputDir) {
  const absDir = path.resolve(outputDir);

  console.log(`\n=== figma-to-code postprocess ===`);
  console.log(`Output: ${absDir}\n`);

  // 1. Assemble sections
  console.log('--- Step 1: Assemble ---');
  const { assemble } = require('./assemble.js');
  assemble(absDir);

  // 2. Token Extractor
  console.log('\n--- Step 2: Token Extractor ---');
  const { run: runTokens } = require('./token-extractor.js');
  runTokens(absDir);

  // 3. Normalize CSS
  console.log('\n--- Step 3: Normalize CSS ---');
  const { normalizeCSS } = require('./normalize.js');
  const warnings = normalizeCSS(absDir);

  // 4. Download Assets
  console.log('\n--- Step 4: Download Assets ---');
  const { run: runDownload } = require('./download-assets.js');
  await runDownload(absDir);

  // 5. Inject IDs
  console.log('\n--- Step 5: Inject Element IDs ---');
  const { run: runInject } = require('./inject-ids.js');
  runInject(absDir);

  console.log('\n=== Postprocess complete ===\n');
  return { warnings };
}

if (require.main === module) {
  const outputDir = process.argv[2];
  if (!outputDir) {
    console.error('Usage: node tools/postprocess.js <outputDir>');
    console.error('Example: node tools/postprocess.js output/');
    process.exit(1);
  }

  if (!fs.existsSync(outputDir)) {
    console.error(`[postprocess] Directory not found: ${outputDir}`);
    process.exit(1);
  }

  postprocess(outputDir).catch(err => {
    console.error('[postprocess] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { postprocess };
