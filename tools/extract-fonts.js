const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

// ── Weight Mapping ──

const WEIGHT_MAP = {
  'Thin':       100,
  'Hairline':   100,
  'ExtraLight': 200,
  'UltraLight': 200,
  'Light':      300,
  'Regular':    400,
  'Normal':     400,
  'Medium':     500,
  'SemiBold':   600,
  'DemiBold':   600,
  'Bold':       700,
  'ExtraBold':  800,
  'UltraBold':  800,
  'Black':      900,
  'Heavy':      900,
};

const FONT_EXTENSIONS = ['.otf', '.ttf', '.OTF', '.TTF'];

const FONT_DIRS_MAC = [
  '/Library/Fonts',
  path.join(os.homedir(), 'Library/Fonts'),
  '/System/Library/Fonts',
  '/System/Library/Fonts/Supplemental',
];

const FONT_DIRS_LINUX = [
  '/usr/share/fonts',
  '/usr/local/share/fonts',
  path.join(os.homedir(), '.local/share/fonts'),
];

const FORMAT_MAP = {
  'woff2': 'woff2',
  'woff':  'woff',
  'otf':   'opentype',
  'ttf':   'truetype',
};

// ── 1. Parse Font Names ──

function parseFontNames(code) {
  const fonts = new Map(); // key: "family|weight"

  // Pattern 1: Tailwind font class — font-['Family_Name:Weight',sans-serif]
  const twRegex = /font-\['([^']+?)(?::([^']+?))?'(?:\s*,\s*[^\]]*?)?\]/g;
  let m;
  while ((m = twRegex.exec(code)) !== null) {
    const rawFamily = m[1].replace(/_/g, ' ');
    const rawWeight = m[2] || 'Regular';
    addFont(fonts, rawFamily, rawWeight);
  }

  // Pattern 2: CSS font-family — font-family: 'Family Name', ...
  const cssRegex = /font-family:\s*'([^']+?)'/g;
  while ((m = cssRegex.exec(code)) !== null) {
    const family = m[1];
    addFont(fonts, family, null);
  }

  // Pattern 3: CSS variable — --font-xxx: 'Family Name', 'Family2', ...
  const cssVarRegex = /--font[^:]*:\s*'([^']+?)'/g;
  while ((m = cssVarRegex.exec(code)) !== null) {
    const family = m[1];
    addFont(fonts, family, null);
  }

  // Pattern 4: CSS variable with multiple fonts — capture all quoted font names in a var line
  const cssVarLineRegex = /--font[^:]*:\s*(.+);/g;
  while ((m = cssVarLineRegex.exec(code)) !== null) {
    const value = m[1];
    const quotedFonts = value.match(/'([^']+)'/g);
    if (quotedFonts) {
      for (const qf of quotedFonts) {
        addFont(fonts, qf.replace(/'/g, ''), null);
      }
    }
  }

  // For fonts that only have a 'Regular' entry, also probe for Bold/Medium
  // since CSS might use font-weight: 700 with the same family
  const familiesWithOnlyRegular = new Set();
  const familiesWithVariants = new Set();
  for (const f of fonts.values()) {
    if (f.weight !== 'Regular') familiesWithVariants.add(f.family);
    else familiesWithOnlyRegular.add(f.family);
  }
  for (const family of familiesWithOnlyRegular) {
    if (!familiesWithVariants.has(family)) {
      // Check if font-weight: 700/500 appears in CSS alongside this family
      if (code.includes('font-weight: 700') || code.includes('font-weight:700')) {
        addFont(fonts, family, 'Bold');
      }
      if (code.includes('font-weight: 500') || code.includes('font-weight:500')) {
        addFont(fonts, family, 'Medium');
      }
    }
  }

  return Array.from(fonts.values());
}

function addFont(fonts, family, weightStr) {
  // Skip generic families
  const generics = ['sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'system-ui'];
  if (generics.includes(family.toLowerCase())) return;

  const weight = weightStr || 'Regular';
  const cssWeight = WEIGHT_MAP[weight] || 400;
  const key = `${family}|${weight}`;

  if (!fonts.has(key)) {
    fonts.set(key, { family, weight, cssWeight });
  }
}

// ── 2. Find System Fonts ──

function getFontDirs() {
  if (process.platform === 'darwin') return FONT_DIRS_MAC;
  if (process.platform === 'linux') return FONT_DIRS_LINUX;
  // Windows not supported yet
  return [];
}

function normalizeForMatch(str) {
  return str.replace(/[\s\-_]/g, '').toLowerCase();
}

function scanFontDir(dirPath) {
  const results = [];
  if (!fs.existsSync(dirPath)) return results;

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        results.push(...scanFontDir(fullPath));
      } else if (FONT_EXTENSIONS.includes(path.extname(entry.name))) {
        results.push(fullPath);
      }
    }
  } catch {
    // Permission denied etc.
  }
  return results;
}

function findSystemFont(family, weight) {
  const dirs = getFontDirs();

  // Build search terms
  const familyNorm = normalizeForMatch(family);
  const weightNorm = normalizeForMatch(weight);

  // Collect all font files
  let allFonts = [];
  for (const dir of dirs) {
    allFonts.push(...scanFontDir(dir));
  }

  // Strategy 1: Exact filename match — "FamilyName-Weight.otf"
  const exactPattern = `${familyNorm}${weightNorm}`;
  for (const fp of allFonts) {
    const baseName = normalizeForMatch(path.basename(fp, path.extname(fp)));
    if (baseName === exactPattern) return fp;
  }

  // Strategy 2: Family+Weight contained in filename
  for (const fp of allFonts) {
    const baseName = normalizeForMatch(path.basename(fp, path.extname(fp)));
    if (baseName.includes(familyNorm) && baseName.includes(weightNorm)) return fp;
  }

  // Strategy 3: Family match only (for Regular weight, file might not have "Regular" suffix)
  if (weight === 'Regular' || weight === 'Normal') {
    for (const fp of allFonts) {
      const baseName = normalizeForMatch(path.basename(fp, path.extname(fp)));
      // Match family name and ensure it's not a different weight
      if (baseName.includes(familyNorm)) {
        const hasOtherWeight = Object.keys(WEIGHT_MAP)
          .filter(w => w !== 'Regular' && w !== 'Normal')
          .some(w => baseName.includes(normalizeForMatch(w)));
        if (!hasOtherWeight) return fp;
      }
    }
  }

  return null;
}

// ── 3. Detect Converter ──

function detectConverter() {
  // fonttools (Python) — best: supports woff2 + woff
  try {
    execSync('python3 -c "from fontTools.ttLib import TTFont; import brotli"', {
      stdio: 'pipe',
      timeout: 5000,
    });
    return 'fonttools';
  } catch {}

  // fonttools without brotli — can do woff only
  try {
    execSync('python3 -c "from fontTools.ttLib import TTFont"', {
      stdio: 'pipe',
      timeout: 5000,
    });
    return 'fonttools-woff-only';
  } catch {}

  // woff2_compress CLI
  try {
    execSync('which woff2_compress', { stdio: 'pipe', timeout: 3000 });
    return 'woff2_compress';
  } catch {}

  return 'copy';
}

// ── 4. Convert Fonts ──

function convertWithFonttools(inputPath, outputDir, baseName, dualFormat) {
  const formats = [];

  if (dualFormat) {
    // woff2
    const woff2Path = path.join(outputDir, `${baseName}.woff2`);
    execSync(`python3 -c "
from fontTools.ttLib import TTFont
font = TTFont('${inputPath}')
font.flavor = 'woff2'
font.save('${woff2Path}')
"`, { stdio: 'pipe', timeout: 30000 });
    formats.push('woff2');
  }

  // woff
  const woffPath = path.join(outputDir, `${baseName}.woff`);
  execSync(`python3 -c "
from fontTools.ttLib import TTFont
font = TTFont('${inputPath}')
font.flavor = 'woff'
font.save('${woffPath}')
"`, { stdio: 'pipe', timeout: 30000 });
  formats.push('woff');

  if (!dualFormat) {
    // If no brotli, try woff2 anyway (might work without it in some setups)
    try {
      const woff2Path = path.join(outputDir, `${baseName}.woff2`);
      execSync(`python3 -c "
from fontTools.ttLib import TTFont
font = TTFont('${inputPath}')
font.flavor = 'woff2'
font.save('${woff2Path}')
"`, { stdio: 'pipe', timeout: 30000 });
      formats.unshift('woff2');
    } catch {
      // woff2 failed without brotli, woff only
    }
  }

  return formats;
}

function convertWithWoff2Compress(inputPath, outputDir, baseName) {
  const formats = [];
  const ext = path.extname(inputPath);

  // woff2_compress needs the file in the output dir
  const tempPath = path.join(outputDir, `${baseName}${ext}`);
  fs.copyFileSync(inputPath, tempPath);

  try {
    execSync(`woff2_compress "${tempPath}"`, { stdio: 'pipe', timeout: 30000 });
    formats.push('woff2');
  } catch {}

  // Clean up temp copy
  if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

  return formats;
}

function convertFont(inputPath, outputDir, baseName, converter) {
  switch (converter) {
    case 'fonttools':
      return convertWithFonttools(inputPath, outputDir, baseName, true);

    case 'fonttools-woff-only':
      return convertWithFonttools(inputPath, outputDir, baseName, false);

    case 'woff2_compress':
      return convertWithWoff2Compress(inputPath, outputDir, baseName);

    case 'copy':
    default: {
      // Copy original
      const ext = path.extname(inputPath).slice(1).toLowerCase();
      const destPath = path.join(outputDir, `${baseName}.${ext}`);
      fs.copyFileSync(inputPath, destPath);
      return [ext]; // 'otf' or 'ttf'
    }
  }
}

// ── 5. Generate @font-face CSS ──

function buildSrcList(baseName, formats) {
  return formats
    .map(fmt => `url('assets/fonts/${baseName}.${fmt}') format('${FORMAT_MAP[fmt]}')`)
    .join(',\n       ');
}

function generateFontFaceBlock(fontEntries) {
  const lines = ['/* === Auto-embedded Fonts === */\n'];

  for (const entry of fontEntries) {
    if (entry.source === 'google-fonts') continue; // handled via <link>

    const src = buildSrcList(entry.baseName, entry.formats);
    lines.push(`@font-face {
  font-family: '${entry.family}';
  src: ${src};
  font-weight: ${entry.cssWeight};
  font-style: normal;
  font-display: swap;
}
`);
  }

  return lines.join('\n');
}

// ── 6. Insert into styles.css ──

function insertFontFaceIntoCSS(cssPath, fontFaceBlock) {
  let css = '';
  if (fs.existsSync(cssPath)) {
    css = fs.readFileSync(cssPath, 'utf-8');
  }

  // Remove existing auto-embedded block if present
  css = css.replace(/\/\* === Auto-embedded Fonts === \*\/[\s\S]*?(?=\/\*|:root|\*,|$)/, '');

  // Prepend
  css = fontFaceBlock + '\n' + css.trimStart();
  fs.writeFileSync(cssPath, css);
}

// ── 7. Google Fonts check (basic) ──

const KNOWN_GOOGLE_FONTS = new Set([
  'Noto Sans KR', 'Noto Serif KR', 'Nanum Gothic', 'Nanum Myeongjo',
  'Nanum Gothic Coding', 'Black Han Sans', 'Do Hyeon', 'Gothic A1',
  'Jua', 'Sunflower', 'Gamja Flower', 'Song Myung', 'Stylish',
  'Cute Font', 'Gaegu', 'Hi Melody', 'Poor Story', 'Single Day',
  'Yeon Sung', 'East Sea Dokdo', 'Dokdo', 'Kirang Haerang',
  'Gugi', 'Black And White Picture',
  'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins',
  'Inter', 'Raleway', 'Nunito', 'Ubuntu', 'Playfair Display',
  'Pretendard',
]);

function checkGoogleFonts(family) {
  if (KNOWN_GOOGLE_FONTS.has(family)) {
    const encoded = family.replace(/\s/g, '+');
    return `https://fonts.googleapis.com/css2?family=${encoded}:wght@100;200;300;400;500;600;700;800;900&display=swap`;
  }
  return null;
}

// ── 8. Insert Google Fonts link into HTML ──

function insertGoogleFontsLink(htmlPath, links) {
  if (!links.length || !fs.existsSync(htmlPath)) return;

  let html = fs.readFileSync(htmlPath, 'utf-8');

  const linkTags = links.map(href =>
    `  <link rel="preconnect" href="https://fonts.googleapis.com">\n` +
    `  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n` +
    `  <link rel="stylesheet" href="${href}">`
  ).join('\n');

  // Insert before </head> or before existing <link rel="stylesheet">
  if (html.includes('</head>')) {
    // Deduplicate preconnect
    const preconnect = `  <link rel="preconnect" href="https://fonts.googleapis.com">\n  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`;
    const stylesheetLinks = links.map(href => `  <link rel="stylesheet" href="${href}">`).join('\n');
    const insert = `${preconnect}\n${stylesheetLinks}\n`;

    // Remove existing google fonts links
    html = html.replace(/<link[^>]*fonts\.googleapis\.com[^>]*>/g, '');
    html = html.replace(/<link[^>]*fonts\.gstatic\.com[^>]*>/g, '');

    html = html.replace('</head>', `${insert}</head>`);
    fs.writeFileSync(htmlPath, html);
  }
}

// ── Main ──

function makeBaseName(family, weight) {
  return family.replace(/\s/g, '') + '-' + weight;
}

function formatSize(bytes) {
  return Math.round(bytes / 1024) + 'KB';
}

async function run(outputDir) {
  const absDir = path.resolve(outputDir);

  console.error('\n=== extract-fonts ===\n');

  // Find source files
  const jsxPath = path.join(absDir, '.mcp-source.jsx');
  const cssPath = path.join(absDir, 'styles.css');
  const htmlPath = path.join(absDir, 'index.html');

  let sourceCode = '';
  if (fs.existsSync(jsxPath)) {
    sourceCode += fs.readFileSync(jsxPath, 'utf-8');
  }
  if (fs.existsSync(cssPath)) {
    sourceCode += '\n' + fs.readFileSync(cssPath, 'utf-8');
  }

  if (!sourceCode.trim()) {
    console.error('[extract-fonts] No source files found (.mcp-source.jsx or styles.css)');
    return { ok: false, error: 'NO_SOURCE' };
  }

  // Step 1: Parse font names
  const fontList = parseFontNames(sourceCode);
  if (fontList.length === 0) {
    console.error('[extract-fonts] No fonts found in source files');
    return { ok: true, data: { fonts: 0 } };
  }

  // Group by family for display
  const familyGroups = {};
  for (const f of fontList) {
    if (!familyGroups[f.family]) familyGroups[f.family] = [];
    familyGroups[f.family].push(f.weight);
  }

  console.error(`[extract-fonts] ${fontList.length}개 폰트 발견:`);
  for (const [family, weights] of Object.entries(familyGroups)) {
    console.error(`  ${family} (${weights.join(', ')})`);
  }

  // Step 2: Detect converter
  const converter = detectConverter();
  console.error(`\n[extract-fonts] 변환 도구: ${converter}`);

  if (converter === 'copy') {
    console.error('  ⚠ woff2/woff 변환 도구 없음. 원본 폰트를 그대로 복사합니다.');
    console.error('  💡 최적 변환을 위해 설치하세요: pip install fonttools brotli');
  }

  // Step 3: Search system fonts + convert
  const fontsDir = path.join(absDir, 'assets', 'fonts');
  fs.mkdirSync(fontsDir, { recursive: true });

  const fontEntries = [];
  const googleFontsLinks = [];
  const missing = [];

  console.error('\n[extract-fonts] 시스템 폰트 검색...');

  for (const font of fontList) {
    const systemPath = findSystemFont(font.family, font.weight);
    const baseName = makeBaseName(font.family, font.weight);

    if (systemPath) {
      console.error(`  ✅ ${font.family} ${font.weight} → ${systemPath}`);

      // Convert
      try {
        const formats = convertFont(systemPath, fontsDir, baseName, converter);

        const entry = {
          family: font.family,
          weight: font.weight,
          cssWeight: font.cssWeight,
          source: 'system',
          originalPath: systemPath,
          baseName,
          formats,
        };
        fontEntries.push(entry);

        // Log sizes
        const sizeStr = formats.map(fmt => {
          const fp = path.join(fontsDir, `${baseName}.${fmt}`);
          return `.${fmt} (${formatSize(fs.statSync(fp).size)})`;
        }).join(' + ');
        console.error(`     → ${baseName} ${sizeStr}`);
      } catch (err) {
        console.error(`  ⚠ ${font.family} ${font.weight} 변환 실패: ${err.message}`);
        missing.push({ family: font.family, weight: font.weight, reason: 'conversion_failed' });
      }
    } else {
      // Check Google Fonts
      const gfLink = checkGoogleFonts(font.family);
      if (gfLink) {
        console.error(`  🌐 ${font.family} ${font.weight} → Google Fonts`);
        fontEntries.push({
          family: font.family,
          weight: font.weight,
          cssWeight: font.cssWeight,
          source: 'google-fonts',
          link: gfLink,
          baseName,
          formats: [],
        });
        // Deduplicate links
        if (!googleFontsLinks.includes(gfLink)) {
          googleFontsLinks.push(gfLink);
        }
      } else {
        console.error(`  ❌ ${font.family} ${font.weight} → 시스템/Google Fonts에 없음`);
        missing.push({ family: font.family, weight: font.weight, reason: 'not_found' });
      }
    }
  }

  // Step 4: Generate @font-face and insert into CSS
  const systemFonts = fontEntries.filter(e => e.source === 'system');
  if (systemFonts.length > 0) {
    const fontFaceBlock = generateFontFaceBlock(systemFonts);
    insertFontFaceIntoCSS(cssPath, fontFaceBlock);

    const totalFiles = systemFonts.reduce((sum, e) => sum + e.formats.length, 0);
    console.error(`\n[extract-fonts] ${totalFiles} 파일 생성 (${systemFonts.length}개 폰트)`);
    console.error(`[extract-fonts] styles.css에 @font-face ${systemFonts.length}개 삽입 완료`);
  }

  // Step 5: Insert Google Fonts links into HTML
  if (googleFontsLinks.length > 0) {
    insertGoogleFontsLink(htmlPath, googleFontsLinks);
    console.error(`[extract-fonts] index.html에 Google Fonts <link> ${googleFontsLinks.length}개 삽입`);
  }

  // Step 6: Write fonts-manifest.json
  const manifest = {
    converter,
    fonts: fontEntries.map(e => ({
      family: e.family,
      weight: e.cssWeight,
      source: e.source,
      ...(e.originalPath ? { originalPath: e.originalPath } : {}),
      ...(e.link ? { link: e.link } : {}),
      formats: e.source === 'system'
        ? Object.fromEntries(e.formats.map(fmt => [fmt, `assets/fonts/${e.baseName}.${fmt}`]))
        : {},
    })),
    missing,
    timestamp: new Date().toISOString(),
  };

  const manifestPath = path.join(absDir, 'fonts-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.error(`[extract-fonts] fonts-manifest.json 생성 완료`);

  if (missing.length > 0) {
    console.error(`\n⚠ ${missing.length}개 폰트를 찾지 못했습니다:`);
    for (const m of missing) {
      console.error(`  - ${m.family} ${m.weight} (${m.reason})`);
    }
  }

  console.error('\n=== extract-fonts 완료 ===\n');

  return {
    ok: true,
    data: {
      converter,
      embedded: systemFonts.length,
      googleFonts: googleFontsLinks.length,
      missing: missing.length,
      totalFiles: systemFonts.reduce((sum, e) => sum + e.formats.length, 0),
    },
  };
}

// ── CLI ──

if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node tools/extract-fonts.js <outputDir>');
    process.exit(1);
  }
  if (!fs.existsSync(dir)) {
    console.error(`[extract-fonts] 디렉토리 없음: ${dir}`);
    process.exit(1);
  }
  run(dir).then(result => {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
  }).catch(err => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { run, parseFontNames, findSystemFont, detectConverter };
