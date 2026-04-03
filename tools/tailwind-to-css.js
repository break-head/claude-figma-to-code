const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Extract CSS from Tailwind classes found in an HTML file.
 * Uses Tailwind v4 CLI to scan and generate only the used utilities.
 */
async function extractCss(htmlPath, cssOutputPath) {
  const absHtml = path.resolve(htmlPath);
  const absCss = path.resolve(cssOutputPath);
  const dir = path.dirname(absHtml);
  const htmlFilename = path.basename(absHtml);
  const tempInput = path.join(dir, '.tw-input.css');

  // Tailwind v4: @source points to the HTML file relative to cwd
  fs.writeFileSync(tempInput, `@import "tailwindcss";\n@source "./${htmlFilename}";\n`);

  try {
    execSync(
      `npx @tailwindcss/cli -i "${tempInput}" -o "${absCss}" --cwd "${dir}"`,
      { stdio: 'pipe', timeout: 30000 }
    );

    const stat = fs.statSync(path.resolve(cssOutputPath));
    console.log(JSON.stringify({
      ok: true,
      output: cssOutputPath,
      sizeKB: Math.round(stat.size / 1024 * 10) / 10,
    }));
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : err.message;
    console.error(JSON.stringify({ ok: false, error: stderr.slice(0, 500) }));
    process.exit(1);
  } finally {
    if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
  }
}

if (require.main === module) {
  const htmlPath = process.argv[2];
  const cssOutput = process.argv[3];

  if (!htmlPath || !cssOutput) {
    console.error('Usage: node tools/tailwind-to-css.js <input.html> <output.css>');
    process.exit(1);
  }

  extractCss(htmlPath, cssOutput);
}

module.exports = { extractCss };
