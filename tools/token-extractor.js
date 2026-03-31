const fs = require('node:fs');
const path = require('node:path');

function rgbaToHex(color) {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
}

function flattenNodes(data) {
  const nodes = [];
  if (data.nodes) {
    for (const node of Object.values(data.nodes)) {
      nodes.push(node);
    }
  }
  if (data.children) {
    for (const child of data.children) {
      nodes.push(child, ...flattenNodes(child));
    }
  }
  return nodes;
}

function extractTokens(figmaData) {
  const colors = {};
  const fonts = {};
  const spacingSet = new Set();
  const nodes = flattenNodes(figmaData);

  for (const node of nodes) {
    if (node.fills && Array.isArray(node.fills)) {
      for (const fill of node.fills) {
        if (fill.type === 'SOLID' && fill.color) {
          const hex = rgbaToHex(fill.color);
          if (!Object.values(colors).includes(hex)) {
            const key = `color-${Object.keys(colors).length + 1}`;
            colors[key] = hex;
          }
        }
      }
    }

    if (node.type === 'TEXT' && node.style) {
      const { fontFamily, fontSize, fontWeight } = node.style;
      if (fontFamily && !Object.values(fonts).some(f => f.family === fontFamily)) {
        const key = Object.keys(fonts).length === 0 ? 'heading' : `font-${Object.keys(fonts).length + 1}`;
        fonts[key] = { family: fontFamily, size: fontSize, weight: fontWeight };
      }
    }

    if (node.type === 'FRAME' || node.paddingTop !== undefined) {
      for (const prop of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'itemSpacing']) {
        if (node[prop] !== undefined && node[prop] > 0) {
          spacingSet.add(node[prop]);
        }
      }
    }
  }

  const sortedSpacing = [...spacingSet].sort((a, b) => a - b);
  const spacingLabels = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'];
  const spacing = {};
  sortedSpacing.forEach((val, i) => {
    const label = i < spacingLabels.length ? spacingLabels[i] : `space-${val}`;
    spacing[label] = val;
  });

  return { colors, fonts, spacing };
}

function run(outputDir) {
  const figmaDataPath = path.join(outputDir, '.figma-data.json');
  const tokensPath = path.join(outputDir, '.design-tokens.json');

  if (!fs.existsSync(figmaDataPath)) {
    console.warn('[token-extractor] .figma-data.json not found, skipping.');
    return null;
  }

  const figmaData = JSON.parse(fs.readFileSync(figmaDataPath, 'utf-8'));
  const tokens = extractTokens(figmaData);
  fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 2));
  console.log(`[token-extractor] Extracted ${Object.keys(tokens.colors).length} colors, ${Object.keys(tokens.fonts).length} fonts, ${Object.keys(tokens.spacing).length} spacing values.`);
  return tokens;
}

if (require.main === module) {
  const outputDir = process.argv[2];
  if (!outputDir) {
    console.error('Usage: node tools/token-extractor.js <outputDir>');
    process.exit(1);
  }
  run(outputDir);
}

module.exports = { extractTokens, rgbaToHex, run };
