const fs = require('node:fs');
const path = require('node:path');

function getSections(sectionsDir) {
  if (!fs.existsSync(sectionsDir)) return [];

  const files = fs.readdirSync(sectionsDir).sort();
  const htmlFiles = files.filter(f => f.endsWith('.html'));

  return htmlFiles.map(htmlFile => {
    const name = htmlFile.replace('.html', '');
    const cssFile = name + '.css';
    const htmlContent = fs.readFileSync(path.join(sectionsDir, htmlFile), 'utf-8');
    const cssPath = path.join(sectionsDir, cssFile);
    const cssContent = fs.existsSync(cssPath)
      ? fs.readFileSync(cssPath, 'utf-8')
      : '';
    return { name, htmlContent, cssContent };
  });
}

function mergeCSS(sections) {
  const rootVars = [];
  const rules = [];

  for (const section of sections) {
    if (!section.cssContent) continue;

    let css = section.cssContent;
    const rootRegex = /:root\s*\{([^}]+)\}/g;
    let match;

    while ((match = rootRegex.exec(css)) !== null) {
      rootVars.push(match[1].trim());
      css = css.slice(0, match.index) + css.slice(match.index + match[0].length);
    }

    const trimmed = css.trim();
    if (trimmed) rules.push(`/* ${section.name} */\n${trimmed}`);
  }

  let merged = '';
  if (rootVars.length > 0) {
    merged += `:root {\n  ${rootVars.join('\n  ')}\n}\n\n`;
  }
  merged += rules.join('\n\n');

  return merged;
}

function assemble(outputDir) {
  const sectionsDir = path.join(outputDir, 'sections');
  const sections = getSections(sectionsDir);

  const bodyContent = sections.map(s => s.htmlContent).join('\n\n');
  const cssContent = mergeCSS(sections);

  const hasScript = fs.existsSync(path.join(outputDir, 'script.js'));
  const scriptTag = hasScript ? '\n    <script src="script.js"></script>' : '';

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="styles.css">
    <title>Page</title>
</head>
<body>
${bodyContent}${scriptTag}
</body>
</html>`;

  fs.writeFileSync(path.join(outputDir, 'index.html'), html);
  fs.writeFileSync(path.join(outputDir, 'styles.css'), cssContent);

  console.log(`[assemble] ${sections.length} sections → index.html + styles.css`);
}

if (require.main === module) {
  const outputDir = process.argv[2];
  if (!outputDir) {
    console.error('Usage: node tools/assemble.js <outputDir>');
    process.exit(1);
  }
  assemble(outputDir);
}

module.exports = { assemble, getSections, mergeCSS };
