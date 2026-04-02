/**
 * convert-to-html.js
 * Converts parse-jsx AST output to vanilla HTML + CSS.
 */
'use strict';

const path = require('path');
const { success, fail, warn, printResult } = require('./json-output.js');

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const SELF_CLOSING_TAGS = new Set(['img', 'br', 'hr', 'input', 'meta', 'link']);

/**
 * Derive a filename from an image URL.
 * e.g. https://example.com/foo/bar.png → bar.png
 * Deduplicates by appending index if needed.
 */
function urlToFilename(url, seen) {
  let base;
  try {
    const u = new URL(url);
    base = path.basename(u.pathname) || 'image';
  } catch {
    base = path.basename(url) || 'image';
  }
  // Ensure extension
  if (!path.extname(base)) base += '.png';

  if (!seen.has(base)) {
    seen.set(base, 0);
    return base;
  }
  const count = seen.get(base) + 1;
  seen.set(base, count);
  const ext = path.extname(base);
  const stem = base.slice(0, -ext.length);
  return `${stem}-${count}${ext}`;
}

/**
 * Convert a single Tailwind class to CSS properties object.
 * (Minimal inline version - delegates via parseTailwindClass from parse-jsx)
 */
let _parseTailwindClass;
function getTailwindParser() {
  if (!_parseTailwindClass) {
    _parseTailwindClass = require('./parse-jsx.js').parseTailwindClass;
  }
  return _parseTailwindClass;
}

/**
 * Build CSS property map from a className string.
 * Replaces hex colors with CSS variable references.
 */
function classNameToCSS(className, colorMap) {
  const parseTailwindClass = getTailwindParser();
  const classes = (className || '').split(/\s+/).filter(Boolean);
  const css = {};
  for (const cls of classes) {
    const props = parseTailwindClass(cls);
    Object.assign(css, props);
  }

  // Replace color values with CSS variables
  for (const prop of ['color', 'background-color']) {
    if (css[prop] && colorMap[css[prop]]) {
      css[prop] = `var(${colorMap[css[prop]]})`;
    }
  }

  return css;
}

/**
 * Serialize CSS property object to CSS declaration string.
 */
function cssObjToString(cssObj, indent = '  ') {
  return Object.entries(cssObj)
    .map(([k, v]) => `${indent}${k}: ${v};`)
    .join('\n');
}

// ─────────────────────────────────────────────
// BEM class assignment
// ─────────────────────────────────────────────

/**
 * Walk AST and assign a unique BEM class name to each element node.
 * Returns a Map<node, bemClass>.
 */
function assignBemClasses(ast) {
  const map = new Map();
  let counter = 0;

  function walk(node) {
    if (!node || node.type === 'text') return;
    counter++;
    map.set(node, `page__el-${counter}`);
    if (Array.isArray(node.children)) {
      for (const child of node.children) walk(child);
    }
  }

  walk(ast);
  return map;
}

// ─────────────────────────────────────────────
// HTML generation
// ─────────────────────────────────────────────

/**
 * Render AST node to HTML string.
 */
function renderNode(node, bemMap, imageMap, overridesById, indent = '') {
  if (!node) return '';
  if (node.type === 'text') return `${indent}${escapeHtml(node.text)}\n`;

  let tag = node.tag || 'div';

  // Apply tag override by data-node-id
  const nodeId = node.props && node.props['data-node-id'];
  if (nodeId && overridesById[nodeId] && overridesById[nodeId].tag) {
    tag = overridesById[nodeId].tag;
  }

  const bemClass = bemMap.get(node) || '';
  const dataNodeId = nodeId ? ` data-node-id="${escapeAttr(nodeId)}"` : '';

  // Build src for img
  let extraAttrs = '';
  if (tag === 'img' && node.props && node.props.src) {
    const mapped = imageMap[node.props.src] || node.props.src;
    extraAttrs += ` src="${escapeAttr(mapped)}"`;
    if (node.props.alt !== undefined) {
      extraAttrs += ` alt="${escapeAttr(node.props.alt)}"`;
    } else {
      extraAttrs += ` alt=""`;
    }
  }

  // Other props (excluding className, src, alt, data-node-id)
  const skipProps = new Set(['className', 'src', 'alt', 'data-node-id']);
  for (const [k, v] of Object.entries(node.props || {})) {
    if (skipProps.has(k)) continue;
    extraAttrs += ` ${escapeAttr(k)}="${escapeAttr(v)}"`;
  }

  const classAttr = bemClass ? ` class="${bemClass}"` : '';

  if (SELF_CLOSING_TAGS.has(tag)) {
    return `${indent}<${tag}${classAttr}${dataNodeId}${extraAttrs} />\n`;
  }

  const childIndent = indent + '  ';
  let children = '';

  // If node has direct text and no element children
  if (node.text !== undefined && node.text !== null) {
    const hasElementChildren = (node.children || []).some(c => c.type !== 'text');
    if (!hasElementChildren) {
      children = escapeHtml(node.text);
      return `${indent}<${tag}${classAttr}${dataNodeId}${extraAttrs}>${children}</${tag}>\n`;
    }
  }

  for (const child of node.children || []) {
    children += renderNode(child, bemMap, imageMap, overridesById, childIndent);
  }

  if (children) {
    return `${indent}<${tag}${classAttr}${dataNodeId}${extraAttrs}>\n${children}${indent}</${tag}>\n`;
  }
  return `${indent}<${tag}${classAttr}${dataNodeId}${extraAttrs}></${tag}>\n`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────
// CSS generation
// ─────────────────────────────────────────────

/**
 * Generate CSS rules for all nodes in AST.
 */
function generateCSS(ast, bemMap, colorMap, imageMap) {
  const rules = [];

  function walk(node) {
    if (!node || node.type === 'text') return;
    const bemClass = bemMap.get(node);
    if (!bemClass) return;

    const cssObj = classNameToCSS(node.className, colorMap);

    // Handle crop images: use object-fit / object-position or wrapper overflow
    // The crop CSS stays as-is on img elements; we output the computed properties
    if (Object.keys(cssObj).length > 0) {
      rules.push(`.${bemClass} {\n${cssObjToString(cssObj)}\n}`);
    }

    for (const child of node.children || []) walk(child);
  }

  walk(ast);
  return rules.join('\n\n');
}

// ─────────────────────────────────────────────
// convertToHtml
// ─────────────────────────────────────────────

/**
 * Convert parsed JSX data (from parseJsx) to vanilla HTML + CSS.
 *
 * @param {Object} parsedData - result.data from parseJsx()
 * @param {Object} overrides  - { 'node-id': { tag: 'nav' } }
 * @returns {{ ok, data: { html, css, assetsManifest } }}
 */
function convertToHtml(parsedData, overrides = {}) {
  if (!parsedData || !parsedData.ast) {
    return fail('parsedData.ast is required', 'INVALID_INPUT');
  }

  const { ast, images = [], tokens = {} } = parsedData;
  const colors = tokens.colors || [];

  // 1. Build color map: hex → CSS variable name
  const colorMap = {};
  colors.forEach((hex, i) => {
    colorMap[hex] = `--color-${i + 1}`;
  });

  // 2. Build image map: original URL → assets/filename
  const seenFilenames = new Map();
  const assetsManifest = [];
  const imageMap = {};

  for (const imgInfo of images) {
    const filename = urlToFilename(imgInfo.src, seenFilenames);
    const assetPath = `assets/${filename}`;
    imageMap[imgInfo.src] = assetPath;
    assetsManifest.push({ src: imgInfo.src, dest: assetPath });
  }

  // 3. Assign BEM class names
  const bemMap = assignBemClasses(ast);

  // 4. Build overrides by data-node-id
  const overridesById = overrides || {};

  // 5. Generate HTML
  const bodyContent = renderNode(ast, bemMap, imageMap, overridesById, '    ');

  // 6. Generate CSS
  const cssRules = generateCSS(ast, bemMap, colorMap, imageMap);

  // :root block
  const rootVars = colors
    .map((hex, i) => `  --color-${i + 1}: ${hex};`)
    .join('\n');
  const rootBlock = rootVars ? `:root {\n${rootVars}\n}\n\n` : '';

  const resetBlock = `*, *::before, *::after {\n  box-sizing: border-box;\n  margin: 0;\n  padding: 0;\n}\n\n`;

  const css = `${resetBlock}${rootBlock}${cssRules}`;

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Figma Export</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
${bodyContent}</body>
</html>`;

  return success({ html, css, assetsManifest });
}

// ─────────────────────────────────────────────
// CLI entrypoint
// ─────────────────────────────────────────────
if (require.main === module) {
  const fs = require('fs');
  const outputDir = process.argv[2];

  if (!outputDir) {
    process.stderr.write('Usage: node tools/convert-to-html.js <output-dir> [--overrides file]\n');
    process.exit(1);
  }

  // Load overrides if provided
  let overrides = {};
  const overridesIdx = process.argv.indexOf('--overrides');
  if (overridesIdx !== -1 && process.argv[overridesIdx + 1]) {
    try {
      const raw = fs.readFileSync(process.argv[overridesIdx + 1], 'utf8');
      overrides = JSON.parse(raw);
    } catch (e) {
      warn(`Failed to load overrides: ${e.message}`);
    }
  }

  // Find .parsed.json in outputDir
  const parsedPath = path.join(outputDir, '.parsed.json');
  let parsedData;
  try {
    parsedData = JSON.parse(fs.readFileSync(parsedPath, 'utf8'));
  } catch (e) {
    printResult(fail(`Cannot read ${parsedPath}: ${e.message}`, 'FILE_NOT_FOUND'));
    process.exit(1);
  }

  process.stderr.write(`[convert-to-html] Converting ${parsedPath}...\n`);
  const result = convertToHtml(parsedData, overrides);

  if (!result.ok) {
    printResult(result);
    process.exit(1);
  }

  const { html, css, assetsManifest } = result.data;

  fs.writeFileSync(path.join(outputDir, 'index.html'), html, 'utf8');
  fs.writeFileSync(path.join(outputDir, 'styles.css'), css, 'utf8');
  fs.writeFileSync(
    path.join(outputDir, 'assets-manifest.json'),
    JSON.stringify(assetsManifest, null, 2),
    'utf8'
  );

  process.stderr.write(`[convert-to-html] Written index.html, styles.css, assets-manifest.json\n`);
  printResult(result);
  process.exit(0);
}

module.exports = { convertToHtml };
