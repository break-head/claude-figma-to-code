const fs = require('node:fs');
const path = require('node:path');
const cheerio = require('cheerio');

const TARGET_TAGS = [
  'header', 'nav', 'main', 'section', 'article', 'aside', 'footer',
  'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'a', 'button', 'img', 'figure', 'figcaption',
  'ul', 'ol', 'li', 'span', 'blockquote', 'form', 'input', 'textarea', 'select',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'video', 'audio', 'picture', 'source'
];

const SKIP_TAGS = ['html', 'head', 'body', 'script', 'style', 'link', 'meta', 'title', 'br', 'hr'];

function injectIds(html) {
  if (!html || html.trim() === '') return html;

  const $ = cheerio.load(html, { decodeEntities: false });
  let counter = 0;

  const selector = TARGET_TAGS.join(', ');
  $(selector).each((_, el) => {
    const $el = $(el);
    if ($el.attr('data-element-id')) return;
    if (SKIP_TAGS.includes(el.tagName)) return;

    counter++;
    const id = `el-${String(counter).padStart(3, '0')}`;
    $el.attr('data-element-id', id);
  });

  return $.html();
}

function run(outputDir) {
  const htmlPath = path.join(outputDir, 'index.html');

  if (!fs.existsSync(htmlPath)) {
    console.warn('[inject-ids] index.html not found, skipping.');
    return;
  }

  const html = fs.readFileSync(htmlPath, 'utf-8');
  const result = injectIds(html);
  fs.writeFileSync(htmlPath, result);

  const count = (result.match(/data-element-id="/g) || []).length;
  console.log(`[inject-ids] Injected ${count} element IDs.`);
}

if (require.main === module) {
  const outputDir = process.argv[2];
  if (!outputDir) {
    console.error('Usage: node tools/inject-ids.js <outputDir>');
    process.exit(1);
  }
  run(outputDir);
}

module.exports = { injectIds, TARGET_TAGS, run };
