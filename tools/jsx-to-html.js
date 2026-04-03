const fs = require('node:fs');
const path = require('node:path');

/**
 * Extract JSX body from React component wrapper.
 * Handles: function Component() { return (...) }
 *          const Component = () => (...)
 *          const Component = () => <div>...</div>
 */
function extractJsxBody(code) {
  // Find return statement with parenthesized JSX
  const returnIdx = code.indexOf('return');
  if (returnIdx === -1) return code;

  let i = returnIdx + 6;
  // skip whitespace
  while (i < code.length && /\s/.test(code[i])) i++;

  if (code[i] === '(') {
    // Match balanced parens
    let depth = 1;
    const start = i + 1;
    i++;
    while (i < code.length && depth > 0) {
      if (code[i] === '(') depth++;
      if (code[i] === ')') depth--;
      i++;
    }
    return code.slice(start, i - 1).trim();
  }

  if (code[i] === '<') {
    // return <div>...</div> without parens — take until function closing brace
    const rest = code.slice(i);
    // Remove trailing );} or ;}
    return rest.replace(/\)?\s*;?\s*\}\s*;?\s*$/, '').trim();
  }

  return code;
}

/**
 * Convert camelCase CSS property to kebab-case.
 */
function camelToKebab(str) {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase();
}

/**
 * Convert JSX inline style object to CSS style string.
 * style={{ color: 'red', fontSize: '16px' }} → style="color: red; font-size: 16px"
 */
function convertInlineStyles(html) {
  return html.replace(/style=\{\{([\s\S]*?)\}\}/g, (_match, content) => {
    const props = content
      .split(',')
      .map(prop => {
        const colonIdx = prop.indexOf(':');
        if (colonIdx === -1) return '';
        const key = prop.slice(0, colonIdx).trim();
        const value = prop.slice(colonIdx + 1).trim().replace(/['"]/g, '');
        return `${camelToKebab(key)}: ${value}`;
      })
      .filter(Boolean)
      .join('; ');
    return `style="${props}"`;
  });
}

/**
 * Mechanically convert React JSX string to vanilla HTML.
 */
function jsxToHtml(jsxCode) {
  let html = jsxCode;

  // Remove import/export statements
  html = html.replace(/^import\s+.*$/gm, '');
  html = html.replace(/^export\s+(default\s+)?.*function\s+\w+\s*\([^)]*\)\s*\{/gm, '');
  html = html.replace(/^export\s+default\s+\w+\s*;?\s*$/gm, '');

  // Extract JSX body from component wrapper
  html = extractJsxBody(html);

  // Remove JSX comments {/* ... */}
  html = html.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

  // React fragments → remove
  html = html.replace(/<\/?React\.Fragment>/g, '');
  html = html.replace(/<\/?Fragment>/g, '');
  html = html.replace(/<>|<\/>/g, '');

  // className → class
  html = html.replace(/\bclassName=/g, 'class=');

  // htmlFor → for
  html = html.replace(/\bhtmlFor=/g, 'for=');

  // Convert inline style objects
  html = convertInlineStyles(html);

  // Remove simple JSX expressions: {variableName} → empty
  // But keep string literals: {'text'} → text
  html = html.replace(/\{['"]([^'"]*)['"]\}/g, '$1');
  html = html.replace(/\{`([^`]*)`\}/g, '$1');

  // Remove remaining JSX expressions (variables, function calls)
  html = html.replace(/\{[^{}]*\}/g, '');

  return html.trim();
}

/**
 * Wrap converted HTML in a full HTML document.
 */
function wrapAsDocument(bodyHtml, { title = 'Page', cssPath = 'styles.css' } = {}) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="${cssPath}">
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

if (require.main === module) {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  const wrap = process.argv.includes('--wrap');

  if (!inputPath || !outputPath) {
    console.error('Usage: node tools/jsx-to-html.js <input.jsx> <output.html> [--wrap]');
    process.exit(1);
  }

  const jsx = fs.readFileSync(path.resolve(inputPath), 'utf-8');
  let html = jsxToHtml(jsx);
  if (wrap) html = wrapAsDocument(html);

  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(path.resolve(outputPath), html);

  const lines = html.split('\n').length;
  console.log(JSON.stringify({ ok: true, output: outputPath, lines }));
}

module.exports = { jsxToHtml, wrapAsDocument };
