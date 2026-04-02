/**
 * parse-jsx.js
 * Tailwind class parser + Babel AST JSX extractor
 */
'use strict';

const parser = require('@babel/parser');
const { success, fail, printResult } = require('./json-output.js');

// ─────────────────────────────────────────────
// parseTailwindClass
// ─────────────────────────────────────────────

const FONT_WEIGHT_MAP = {
  Thin: '100',
  ExtraLight: '200',
  Light: '300',
  Regular: '400',
  Medium: '500',
  SemiBold: '600',
  Bold: '700',
  ExtraBold: '800',
  Black: '900',
};

/**
 * Convert a single Tailwind class string to a CSS property object.
 * Returns {} for unrecognized classes.
 * @param {string} cls
 * @returns {Object}
 */
function parseTailwindClass(cls) {
  // ── Static keyword mappings ──────────────────
  const statics = {
    absolute: { position: 'absolute' },
    relative: { position: 'relative' },
    fixed: { position: 'fixed' },
    sticky: { position: 'sticky' },
    flex: { display: 'flex' },
    'inline-flex': { display: 'inline-flex' },
    grid: { display: 'grid' },
    'text-center': { 'text-align': 'center' },
    'text-left': { 'text-align': 'left' },
    'text-right': { 'text-align': 'right' },
    'overflow-hidden': { overflow: 'hidden' },
    'overflow-auto': { overflow: 'auto' },
    'rounded-full': { 'border-radius': '9999px' },
    'flex-col': { 'flex-direction': 'column' },
    'flex-row': { 'flex-direction': 'row' },
    'items-center': { 'align-items': 'center' },
    'items-start': { 'align-items': 'flex-start' },
    'items-end': { 'align-items': 'flex-end' },
    'justify-center': { 'justify-content': 'center' },
    'justify-between': { 'justify-content': 'space-between' },
    'mx-auto': { 'margin-left': 'auto', 'margin-right': 'auto' },
  };

  if (Object.prototype.hasOwnProperty.call(statics, cls)) {
    return statics[cls];
  }

  // ── Dynamic pattern mappings ─────────────────
  // Each entry: [regex, handler(match) → Object]
  const patterns = [
    // dimensions
    [/^w-\[(.+)\]$/, (m) => ({ width: m[1] })],
    [/^h-\[(.+)\]$/, (m) => ({ height: m[1] })],
    [/^min-w-\[(.+)\]$/, (m) => ({ 'min-width': m[1] })],
    [/^min-h-\[(.+)\]$/, (m) => ({ 'min-height': m[1] })],
    [/^max-w-\[(.+)\]$/, (m) => ({ 'max-width': m[1] })],
    // position offsets
    [/^left-\[(.+)\]$/, (m) => ({ left: m[1] })],
    [/^top-\[(.+)\]$/, (m) => ({ top: m[1] })],
    [/^right-\[(.+)\]$/, (m) => ({ right: m[1] })],
    [/^bottom-\[(.+)\]$/, (m) => ({ bottom: m[1] })],
    // typography — font-size (must come before color check)
    [/^text-\[(\d[\d.]*px)\]$/, (m) => ({ 'font-size': m[1] })],
    // typography — color (hex)
    [/^text-\[(#[0-9a-fA-F]{3,8})\]$/, (m) => ({ color: m[1] })],
    // background
    [/^bg-\[(#[0-9a-fA-F]{3,8})\]$/, (m) => ({ 'background-color': m[1] })],
    // border-radius
    [/^rounded-\[(.+)\]$/, (m) => ({ 'border-radius': m[1] })],
    // line-height
    [/^leading-\[(.+)\]$/, (m) => ({ 'line-height': m[1] })],
    // gap
    [/^gap-\[(.+)\]$/, (m) => ({ gap: m[1] })],
    // opacity
    [/^opacity-\[(.+)\]$/, (m) => ({ opacity: m[1] })],
    // spacing — shorthand
    [/^p-\[(.+)\]$/, (m) => ({ padding: m[1] })],
    [/^m-\[(.+)\]$/, (m) => ({ margin: m[1] })],
    // spacing — axis
    [/^px-\[(.+)\]$/, (m) => ({ 'padding-left': m[1], 'padding-right': m[1] })],
    [/^py-\[(.+)\]$/, (m) => ({ 'padding-top': m[1], 'padding-bottom': m[1] })],
    // spacing — sides
    [/^pt-\[(.+)\]$/, (m) => ({ 'padding-top': m[1] })],
    [/^pb-\[(.+)\]$/, (m) => ({ 'padding-bottom': m[1] })],
    [/^pl-\[(.+)\]$/, (m) => ({ 'padding-left': m[1] })],
    [/^pr-\[(.+)\]$/, (m) => ({ 'padding-right': m[1] })],
    // font family — font-['Name:Variant']
    [/^font-\['(.+)'\]$/, (m) => {
      const name = m[1];
      const variant = name.split(':')[1] || '';
      const weight = FONT_WEIGHT_MAP[variant] || '400';
      return { 'font-family': `'${name}'`, 'font-weight': weight };
    }],
  ];

  for (const [regex, handler] of patterns) {
    const match = cls.match(regex);
    if (match) return handler(match);
  }

  return {};
}

// ─────────────────────────────────────────────
// parseJsx
// ─────────────────────────────────────────────

/**
 * Check whether an img's className contains percent-based crop values.
 * Crop = any of w/h/left/top uses % values.
 */
function hasCropPattern(className) {
  if (!className) return false;
  return /(?:w|h|left|top|right|bottom)-\[-?[\d.]+%\]/.test(className);
}

/**
 * Extract string value of a JSX attribute.
 */
function getAttrStringValue(attr) {
  if (!attr || !attr.value) return null;
  const val = attr.value;
  if (val.type === 'StringLiteral') return val.value;
  if (val.type === 'JSXExpressionContainer' && val.expression.type === 'StringLiteral') {
    return val.expression.value;
  }
  return null;
}

/**
 * Get JSX opening element attributes as a plain object { name: stringValue }.
 */
function getAttrs(openingEl) {
  const result = {};
  for (const attr of openingEl.attributes) {
    if (attr.type !== 'JSXAttribute') continue;
    const name = attr.name.name;
    const value = getAttrStringValue(attr);
    if (value !== null) result[name] = value;
  }
  return result;
}

let _nodeCount = 0;
let _images = [];
let _colors = new Set();
let _fonts = new Set();
let _fontWeights = new Set();

/**
 * Recursively convert a Babel JSXElement node to a lightweight tree node.
 */
function convertNode(node) {
  if (node.type === 'JSXText') {
    const text = node.value.trim();
    return text ? { type: 'text', text } : null;
  }

  if (node.type === 'JSXExpressionContainer') {
    // Skip expressions
    return null;
  }

  if (node.type !== 'JSXElement') return null;

  const opening = node.openingElement;
  const tag = opening.name.name || opening.name.property?.name || 'unknown';
  const attrs = getAttrs(opening);
  const className = attrs.className || '';

  _nodeCount++;

  // Extract tokens from className
  const classes = className.split(/\s+/).filter(Boolean);
  for (const cls of classes) {
    const m = cls.match(/^text-\[(#[0-9a-fA-F]{3,8})\]$/);
    if (m) _colors.add(m[1]);
    const b = cls.match(/^bg-\[(#[0-9a-fA-F]{3,8})\]$/);
    if (b) _colors.add(b[1]);
    const f = cls.match(/^font-\['(.+)'\]$/);
    if (f) {
      _fonts.add(f[1]);
      const variant = f[1].split(':')[1] || '';
      const weight = FONT_WEIGHT_MAP[variant] || '400';
      _fontWeights.add(weight);
    }
  }

  // Collect img src
  if (tag === 'img') {
    const src = attrs.src || null;
    if (src) {
      _images.push({
        src,
        className,
        isCrop: hasCropPattern(className),
      });
    }
  }

  // Build props (exclude className, handled separately)
  const props = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (k !== 'className') props[k] = v;
  }

  // Recurse children
  const children = [];
  for (const child of node.children) {
    const converted = convertNode(child);
    if (converted) children.push(converted);
  }

  // If only child is a text node, hoist it to element's .text property
  let text = null;
  if (children.length === 1 && children[0].type === 'text') {
    text = children[0].text;
  }

  const result = { tag, className, props, children, ...(text !== null ? { text } : {}) };
  return result;
}

/**
 * Walk Babel AST to find the first ReturnStatement containing a JSXElement.
 */
function findRootJSX(babelAst) {
  let found = null;

  function walk(node) {
    if (!node || typeof node !== 'object' || found) return;
    if (node.type === 'ReturnStatement' && node.argument && node.argument.type === 'JSXElement') {
      found = node.argument;
      return;
    }
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(walk);
      } else if (child && typeof child === 'object') {
        walk(child);
      }
    }
  }

  walk(babelAst);
  return found;
}

/**
 * Extract root width/height from className string.
 */
function extractDimensions(className) {
  const wMatch = className.match(/\bw-\[([^\]]+)\]/);
  const hMatch = className.match(/\bh-\[([^\]]+)\]/);
  return {
    width: wMatch ? wMatch[1] : null,
    height: hMatch ? hMatch[1] : null,
  };
}

/**
 * Parse a JSX string and extract AST, images, tokens, and meta.
 * @param {string} jsxString
 * @returns {{ ok: boolean, data?: Object, error?: string, code?: string }}
 */
function parseJsx(jsxString) {
  // Reset globals
  _nodeCount = 0;
  _images = [];
  _colors = new Set();
  _fonts = new Set();
  _fontWeights = new Set();

  let babelAst;
  try {
    babelAst = parser.parse(jsxString, {
      sourceType: 'module',
      plugins: ['jsx'],
    });
  } catch (e) {
    return fail(`JSX parse failed: ${e.message}`, 'PARSE_ERROR');
  }

  const rootJsx = findRootJSX(babelAst);
  if (!rootJsx) {
    return fail('No JSX ReturnStatement found', 'PARSE_ERROR');
  }

  const ast = convertNode(rootJsx);
  const dims = extractDimensions(ast ? ast.className : '');

  return success({
    ast,
    images: _images,
    tokens: {
      colors: Array.from(_colors),
      fonts: Array.from(_fonts),
      fontWeights: Array.from(_fontWeights),
    },
    meta: {
      width: dims.width,
      height: dims.height,
      nodeCount: _nodeCount,
      imageCount: _images.length,
    },
  });
}

// ─────────────────────────────────────────────
// CLI entrypoint
// ─────────────────────────────────────────────
if (require.main === module) {
  const fs = require('fs');
  const filePath = process.argv[2];
  if (!filePath) {
    process.stderr.write('Usage: node tools/parse-jsx.js <jsx-file>\n');
    process.exit(1);
  }
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    printResult(fail(`Cannot read file: ${e.message}`, 'FILE_NOT_FOUND'));
    process.exit(1);
  }
  process.stderr.write(`[parse-jsx] Parsing ${filePath}...\n`);
  const result = parseJsx(content);
  printResult(result);
  process.exit(result.ok ? 0 : 1);
}

module.exports = { parseTailwindClass, parseJsx };
