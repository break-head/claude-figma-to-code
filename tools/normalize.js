const fs = require('node:fs');
const path = require('node:path');

function parseRootVars(css) {
  const vars = {};
  const rootMatch = css.match(/:root\s*\{([^}]+)\}/);
  if (!rootMatch) return vars;

  const declarations = rootMatch[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g);
  for (const m of declarations) {
    vars[`--${m[1]}`] = m[2].trim();
  }
  return vars;
}

function replaceHardcodedColors(css) {
  const vars = parseRootVars(css);
  if (Object.keys(vars).length === 0) return css;

  const colorToVar = {};
  for (const [varName, value] of Object.entries(vars)) {
    const hexMatch = value.match(/^#[0-9a-fA-F]{3,8}$/);
    if (hexMatch) {
      colorToVar[value.toLowerCase()] = varName;
    }
  }

  if (Object.keys(colorToVar).length === 0) return css;

  const rootRegex = /(:root\s*\{[^}]+\})/;
  const parts = css.split(rootRegex);

  return parts.map(part => {
    if (part.match(/^:root\s*\{/)) return part;

    let result = part;
    for (const [hex, varName] of Object.entries(colorToVar)) {
      const hexRegex = new RegExp(
        `(?<!--[\\w-]+:\\s*)${hex.replace('#', '#')}(?![0-9a-fA-F])`,
        'gi'
      );
      result = result.replace(hexRegex, `var(${varName})`);
    }
    return result;
  }).join('');
}

function normalizeCSS(outputDir) {
  const cssPath = path.join(outputDir, 'styles.css');
  const tokensPath = path.join(outputDir, '.design-tokens.json');
  const warnings = [];

  if (!fs.existsSync(cssPath)) {
    warnings.push('[normalize] styles.css not found, skipping.');
    return warnings;
  }

  let css = fs.readFileSync(cssPath, 'utf-8');

  css = replaceHardcodedColors(css);

  if (fs.existsSync(tokensPath)) {
    const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf-8'));
    const cssLower = css.toLowerCase();

    if (tokens.colors) {
      for (const [key, hex] of Object.entries(tokens.colors)) {
        if (!cssLower.includes(hex.toLowerCase())) {
          const msg = `[normalize] Figma 토큰 색상 ${hex} (${key})이 CSS에 없습니다`;
          warnings.push(msg);
          console.warn(msg);
        }
      }
    }

    if (tokens.fonts) {
      for (const [key, font] of Object.entries(tokens.fonts)) {
        if (font.family && !css.includes(font.family)) {
          const msg = `[normalize] Figma 토큰 폰트 "${font.family}" (${key})이 CSS에 없습니다`;
          warnings.push(msg);
          console.warn(msg);
        }
      }
    }
  }

  fs.writeFileSync(cssPath, css);
  console.log(`[normalize] CSS 정규화 완료. ${warnings.length}개 경고.`);
  return warnings;
}

if (require.main === module) {
  const outputDir = process.argv[2];
  if (!outputDir) {
    console.error('Usage: node tools/normalize.js <outputDir>');
    process.exit(1);
  }
  normalizeCSS(outputDir);
}

module.exports = { normalizeCSS, replaceHardcodedColors, parseRootVars };
