const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Tailwind → CSS conversion
// ---------------------------------------------------------------------------

function tailwindToCSS(cls) {
  // Returns array of CSS declarations (strings like "property: value")
  const results = [];
  const c = cls.trim();
  if (!c) return results;

  // ---- Layout ----
  const layoutMap = {
    'absolute': 'position: absolute',
    'relative': 'position: relative',
    'fixed': 'position: fixed',
    'sticky': 'position: sticky',
    'contents': 'display: contents',
    'flex': 'display: flex',
    'flex-col': 'flex-direction: column',
    'flex-row': 'flex-direction: row',
    'flex-wrap': 'flex-wrap: wrap',
    'flex-none': 'flex: none',
    'flex-1': 'flex: 1 1 0%',
    'inline-flex': 'display: inline-flex',
    'inline-grid': 'display: inline-grid',
    'grid': 'display: grid',
    'block': 'display: block',
    'inline-block': 'display: inline-block',
    'inline': 'display: inline',
    'hidden': 'display: none',
  };
  if (layoutMap[c]) { results.push(layoutMap[c]); return results; }

  // ---- Alignment ----
  const alignMap = {
    'items-center': 'align-items: center',
    'items-start': 'align-items: flex-start',
    'items-end': 'align-items: flex-end',
    'items-stretch': 'align-items: stretch',
    'items-baseline': 'align-items: baseline',
    'justify-center': 'justify-content: center',
    'justify-between': 'justify-content: space-between',
    'justify-start': 'justify-content: flex-start',
    'justify-end': 'justify-content: flex-end',
    'justify-around': 'justify-content: space-around',
    'justify-evenly': 'justify-content: space-evenly',
    'content-stretch': 'align-content: stretch',
    'content-center': 'align-content: center',
    'self-start': 'align-self: flex-start',
    'self-end': 'align-self: flex-end',
    'self-center': 'align-self: center',
    'self-stretch': 'align-self: stretch',
    'place-items-start': 'place-items: start',
    'place-items-center': 'place-items: center',
  };
  if (alignMap[c]) { results.push(alignMap[c]); return results; }

  // ---- Flex shrink/grow ----
  if (c === 'shrink-0') { results.push('flex-shrink: 0'); return results; }
  if (c === 'shrink') { results.push('flex-shrink: 1'); return results; }
  if (c === 'grow-0') { results.push('flex-grow: 0'); return results; }
  if (c === 'grow') { results.push('flex-grow: 1'); return results; }

  // flex-[arbitrary]
  const flexArb = c.match(/^flex-\[(.+)\]$/);
  if (flexArb) { results.push(`flex: ${flexArb[1].replace(/_/g, ' ')}`); return results; }

  // ---- Gap ----
  const gapMatch = c.match(/^gap-\[(.+)\]$/);
  if (gapMatch) { results.push(`gap: ${gapMatch[1]}`); return results; }
  const gapXMatch = c.match(/^gap-x-\[(.+)\]$/);
  if (gapXMatch) { results.push(`column-gap: ${gapXMatch[1]}`); return results; }
  const gapYMatch = c.match(/^gap-y-\[(.+)\]$/);
  if (gapYMatch) { results.push(`row-gap: ${gapYMatch[1]}`); return results; }

  // ---- Grid ----
  const gridColsArb = c.match(/^grid-cols-\[(.+)\]$/);
  if (gridColsArb) { results.push(`grid-template-columns: ${gridColsArb[1].replace(/_/g, ' ')}`); return results; }
  const gridRowsArb = c.match(/^grid-rows-\[(.+)\]$/);
  if (gridRowsArb) { results.push(`grid-template-rows: ${gridRowsArb[1].replace(/_/g, ' ')}`); return results; }
  const colMatch = c.match(/^col-(\d+)$/);
  if (colMatch) { results.push(`grid-column: ${colMatch[1]}`); return results; }
  const rowMatch = c.match(/^row-(\d+)$/);
  if (rowMatch) { results.push(`grid-row: ${rowMatch[1]}`); return results; }

  // ---- Sizing ----
  // w-full, h-full, size-full
  if (c === 'w-full') { results.push('width: 100%'); return results; }
  if (c === 'h-full') { results.push('height: 100%'); return results; }
  if (c === 'w-screen') { results.push('width: 100vw'); return results; }
  if (c === 'h-screen') { results.push('height: 100vh'); return results; }
  if (c === 'w-auto') { results.push('width: auto'); return results; }
  if (c === 'h-auto') { results.push('height: auto'); return results; }
  if (c === 'w-px') { results.push('width: 1px'); return results; }
  if (c === 'h-px') { results.push('height: 1px'); return results; }
  if (c === 'min-h-px') { results.push('min-height: 1px'); return results; }
  if (c === 'min-w-px') { results.push('min-width: 1px'); return results; }
  if (c === 'min-w-full') { results.push('min-width: 100%'); return results; }
  if (c === 'min-h-full') { results.push('min-height: 100%'); return results; }
  if (c === 'max-w-none') { results.push('max-width: none'); return results; }
  if (c === 'max-h-none') { results.push('max-height: none'); return results; }

  if (c === 'size-full') { results.push('width: 100%', 'height: 100%'); return results; }
  const sizeArb = c.match(/^size-\[(.+)\]$/);
  if (sizeArb) { results.push(`width: ${sizeArb[1]}`, `height: ${sizeArb[1]}`); return results; }

  // w-[X], h-[X], min-w-[X], min-h-[X], max-w-[X], max-h-[X]
  const sizePatterns = [
    [/^w-\[(.+)\]$/, 'width'],
    [/^h-\[(.+)\]$/, 'height'],
    [/^min-w-\[(.+)\]$/, 'min-width'],
    [/^min-h-\[(.+)\]$/, 'min-height'],
    [/^max-w-\[(.+)\]$/, 'max-width'],
    [/^max-h-\[(.+)\]$/, 'max-height'],
  ];
  for (const [re, prop] of sizePatterns) {
    const m = c.match(re);
    if (m) { results.push(`${prop}: ${m[1]}`); return results; }
  }

  // ---- Position offsets ----
  // inset-0
  if (c === 'inset-0') { results.push('top: 0', 'right: 0', 'bottom: 0', 'left: 0'); return results; }
  const insetArb = c.match(/^inset-\[(.+)\]$/);
  if (insetArb) {
    const parts = insetArb[1].replace(/_/g, ' ').split(/\s+/);
    if (parts.length === 4) {
      results.push(`top: ${parts[0]}`, `right: ${parts[1]}`, `bottom: ${parts[2]}`, `left: ${parts[3]}`);
    } else {
      results.push(`inset: ${parts.join(' ')}`);
    }
    return results;
  }

  // top-0, left-0, etc.  and  top-[Xpx], left-1/2
  const posProps = ['top', 'right', 'bottom', 'left'];
  for (const prop of posProps) {
    if (c === `${prop}-0`) { results.push(`${prop}: 0`); return results; }
    const arbPos = c.match(new RegExp(`^${prop}-\\[(.+)\\]$`));
    if (arbPos) { results.push(`${prop}: ${arbPos[1]}`); return results; }
    if (c === `${prop}-1/2`) { results.push(`${prop}: 50%`); return results; }
    const fracPos = c.match(new RegExp(`^${prop}-(\\d+)/(\\d+)$`));
    if (fracPos) {
      const pct = (parseInt(fracPos[1]) / parseInt(fracPos[2]) * 100);
      results.push(`${prop}: ${pct}%`);
      return results;
    }
  }

  // ---- Z-index ----
  const zMatch = c.match(/^z-(\d+)$/);
  if (zMatch) { results.push(`z-index: ${zMatch[1]}`); return results; }
  const zArb = c.match(/^z-\[(.+)\]$/);
  if (zArb) { results.push(`z-index: ${zArb[1]}`); return results; }

  // ---- Spacing (padding/margin) ----
  const spacingMap = {
    'p': { props: ['padding'] },
    'px': { props: ['padding-left', 'padding-right'] },
    'py': { props: ['padding-top', 'padding-bottom'] },
    'pt': { props: ['padding-top'] },
    'pr': { props: ['padding-right'] },
    'pb': { props: ['padding-bottom'] },
    'pl': { props: ['padding-left'] },
    'ps': { props: ['padding-inline-start'] },
    'pe': { props: ['padding-inline-end'] },
    'm': { props: ['margin'] },
    'mx': { props: ['margin-left', 'margin-right'] },
    'my': { props: ['margin-top', 'margin-bottom'] },
    'mt': { props: ['margin-top'] },
    'mr': { props: ['margin-right'] },
    'mb': { props: ['margin-bottom'] },
    'ml': { props: ['margin-left'] },
    'ms': { props: ['margin-inline-start'] },
    'me': { props: ['margin-inline-end'] },
  };

  for (const [prefix, { props }] of Object.entries(spacingMap)) {
    // p-0, m-0, etc.
    if (c === `${prefix}-0`) {
      for (const p of props) results.push(`${p}: 0`);
      return results;
    }
    // p-[Xpx], m-[Xpx]
    const arbSp = c.match(new RegExp(`^${prefix}-\\[(.+)\\]$`));
    if (arbSp) {
      for (const p of props) results.push(`${p}: ${arbSp[1]}`);
      return results;
    }
  }

  // ---- Typography ----
  // text-[14px] (size), text-[#xxx] (color), text-[color:var(...)] (color)
  const textArb = c.match(/^text-\[(.+)\]$/);
  if (textArb) {
    const val = textArb[1];
    if (val.startsWith('color:')) {
      results.push(`color: ${val.slice(6).replace(/_/g, ' ')}`);
    } else if (val.startsWith('#') || val.startsWith('rgb') || val.startsWith('var(')) {
      results.push(`color: ${val.replace(/_/g, ' ')}`);
    } else {
      results.push(`font-size: ${val}`);
    }
    return results;
  }
  // text-center, text-left, text-right, text-justify
  const textAlignMap = { 'text-center': 'center', 'text-left': 'left', 'text-right': 'right', 'text-justify': 'justify' };
  if (textAlignMap[c]) { results.push(`text-align: ${textAlignMap[c]}`); return results; }
  // text-white, text-black
  if (c === 'text-white') { results.push('color: white'); return results; }
  if (c === 'text-black') { results.push('color: black'); return results; }
  if (c === 'text-transparent') { results.push('color: transparent'); return results; }

  // font-[...] → font-family (handled specially — see fontFamilyToCSS)
  // We mark it here, actual processing happens in the caller
  const fontArb = c.match(/^font-\[(.+)\]$/);
  if (fontArb) {
    // Will be processed by the caller for font-family + weight extraction
    results.push(`__font_family__:${fontArb[1]}`);
    return results;
  }

  // font-bold, font-normal, etc.
  const fontWeightMap = {
    'font-thin': '100', 'font-extralight': '200', 'font-light': '300',
    'font-normal': '400', 'font-medium': '500', 'font-semibold': '600',
    'font-bold': '700', 'font-extrabold': '800', 'font-black': '900',
  };
  if (fontWeightMap[c]) { results.push(`font-weight: ${fontWeightMap[c]}`); return results; }

  // leading-[X]
  const leadingArb = c.match(/^leading-\[(.+)\]$/);
  if (leadingArb) { results.push(`line-height: ${leadingArb[1]}`); return results; }

  // tracking-[X]
  const trackingArb = c.match(/^tracking-\[(.+)\]$/);
  if (trackingArb) { results.push(`letter-spacing: ${trackingArb[1]}`); return results; }

  // whitespace
  const wsMap = {
    'whitespace-nowrap': 'white-space: nowrap',
    'whitespace-pre': 'white-space: pre',
    'whitespace-pre-wrap': 'white-space: pre-wrap',
    'whitespace-pre-line': 'white-space: pre-line',
    'whitespace-normal': 'white-space: normal',
    'whitespace-break-spaces': 'white-space: break-spaces',
  };
  if (wsMap[c]) { results.push(wsMap[c]); return results; }

  // not-italic, italic
  if (c === 'not-italic') { results.push('font-style: normal'); return results; }
  if (c === 'italic') { results.push('font-style: italic'); return results; }

  // underline, line-through, no-underline
  if (c === 'underline') { results.push('text-decoration: underline'); return results; }
  if (c === 'line-through') { results.push('text-decoration: line-through'); return results; }
  if (c === 'no-underline') { results.push('text-decoration: none'); return results; }

  // uppercase, lowercase, capitalize, normal-case
  const textTransformMap = { 'uppercase': 'uppercase', 'lowercase': 'lowercase', 'capitalize': 'capitalize', 'normal-case': 'none' };
  if (textTransformMap[c]) { results.push(`text-transform: ${textTransformMap[c]}`); return results; }

  // ---- Background ----
  if (c === 'bg-white') { results.push('background-color: white'); return results; }
  if (c === 'bg-black') { results.push('background-color: black'); return results; }
  if (c === 'bg-transparent') { results.push('background-color: transparent'); return results; }
  const bgArb = c.match(/^bg-\[(.+)\]$/);
  if (bgArb) {
    const val = bgArb[1].replace(/_/g, ' ');
    if (val.startsWith('url(') || val.startsWith('linear-gradient') || val.startsWith('radial-gradient')) {
      results.push(`background: ${val}`);
    } else {
      results.push(`background-color: ${val}`);
    }
    return results;
  }
  // bg-gradient-to-X → handled as transform-like aggregate, mark it
  if (c === 'bg-gradient-to-b') { results.push('__gradient_dir__:to bottom'); return results; }
  if (c === 'bg-gradient-to-t') { results.push('__gradient_dir__:to top'); return results; }
  if (c === 'bg-gradient-to-r') { results.push('__gradient_dir__:to right'); return results; }
  if (c === 'bg-gradient-to-l') { results.push('__gradient_dir__:to left'); return results; }

  // from-[X], to-[X], via-[X]
  const fromArb = c.match(/^from-\[(.+)\]$/);
  if (fromArb) { results.push(`__gradient_from__:${fromArb[1]}`); return results; }
  const toArb = c.match(/^to-\[(.+)\]$/);
  if (toArb) { results.push(`__gradient_to__:${toArb[1]}`); return results; }
  const viaArb = c.match(/^via-\[(.+)\]$/);
  if (viaArb) { results.push(`__gradient_via__:${viaArb[1]}`); return results; }

  // ---- Border ----
  if (c === 'border') { results.push('border-width: 1px'); return results; }
  if (c === 'border-0') { results.push('border-width: 0'); return results; }
  const borderNMatch = c.match(/^border-(\d+)$/);
  if (borderNMatch) { results.push(`border-width: ${borderNMatch[1]}px`); return results; }
  const borderArb = c.match(/^border-\[(.+)\]$/);
  if (borderArb) {
    const val = borderArb[1];
    if (val.match(/px$|rem$|em$/)) {
      results.push(`border-width: ${val}`);
    } else if (val.startsWith('#') || val.startsWith('rgb') || val.startsWith('var(')) {
      results.push(`border-color: ${val.replace(/_/g, ' ')}`);
    } else {
      results.push(`border-width: ${val}`);
    }
    return results;
  }
  if (c === 'border-solid') { results.push('border-style: solid'); return results; }
  if (c === 'border-dashed') { results.push('border-style: dashed'); return results; }
  if (c === 'border-dotted') { results.push('border-style: dotted'); return results; }
  if (c === 'border-none') { results.push('border-style: none'); return results; }
  if (c === 'border-white') { results.push('border-color: white'); return results; }
  if (c === 'border-black') { results.push('border-color: black'); return results; }
  if (c === 'border-transparent') { results.push('border-color: transparent'); return results; }

  // rounded
  if (c === 'rounded') { results.push('border-radius: 0.25rem'); return results; }
  if (c === 'rounded-full') { results.push('border-radius: 9999px'); return results; }
  if (c === 'rounded-none') { results.push('border-radius: 0'); return results; }
  const roundedArb = c.match(/^rounded-\[(.+)\]$/);
  if (roundedArb) { results.push(`border-radius: ${roundedArb[1]}`); return results; }
  // rounded-tl, rounded-tr, rounded-bl, rounded-br
  const roundedCornerMap = {
    'tl': 'border-top-left-radius', 'tr': 'border-top-right-radius',
    'bl': 'border-bottom-left-radius', 'br': 'border-bottom-right-radius',
    't': ['border-top-left-radius', 'border-top-right-radius'],
    'b': ['border-bottom-left-radius', 'border-bottom-right-radius'],
    'l': ['border-top-left-radius', 'border-bottom-left-radius'],
    'r': ['border-top-right-radius', 'border-bottom-right-radius'],
  };
  const roundedCorner = c.match(/^rounded-(tl|tr|bl|br|t|b|l|r)-\[(.+)\]$/);
  if (roundedCorner) {
    const mapped = roundedCornerMap[roundedCorner[1]];
    const val = roundedCorner[2];
    if (Array.isArray(mapped)) {
      for (const p of mapped) results.push(`${p}: ${val}`);
    } else {
      results.push(`${mapped}: ${val}`);
    }
    return results;
  }

  // ---- Effects ----
  if (c === 'overflow-clip' || c === 'overflow-hidden') { results.push('overflow: hidden'); return results; }
  if (c === 'overflow-auto') { results.push('overflow: auto'); return results; }
  if (c === 'overflow-scroll') { results.push('overflow: scroll'); return results; }
  if (c === 'overflow-visible') { results.push('overflow: visible'); return results; }
  if (c === 'overflow-x-hidden') { results.push('overflow-x: hidden'); return results; }
  if (c === 'overflow-y-hidden') { results.push('overflow-y: hidden'); return results; }
  if (c === 'overflow-x-auto') { results.push('overflow-x: auto'); return results; }
  if (c === 'overflow-y-auto') { results.push('overflow-y: auto'); return results; }
  if (c === 'pointer-events-none') { results.push('pointer-events: none'); return results; }
  if (c === 'pointer-events-auto') { results.push('pointer-events: auto'); return results; }
  if (c === 'object-cover') { results.push('object-fit: cover'); return results; }
  if (c === 'object-contain') { results.push('object-fit: contain'); return results; }
  if (c === 'object-fill') { results.push('object-fit: fill'); return results; }
  if (c === 'object-center') { results.push('object-position: center'); return results; }

  // opacity-[X] or opacity-50 etc.
  const opacityArb = c.match(/^opacity-\[(.+)\]$/);
  if (opacityArb) { results.push(`opacity: ${opacityArb[1]}`); return results; }
  const opacityNum = c.match(/^opacity-(\d+)$/);
  if (opacityNum) { results.push(`opacity: ${parseInt(opacityNum[1]) / 100}`); return results; }

  // shadow
  const shadowArb = c.match(/^shadow-\[(.+)\]$/);
  if (shadowArb) { results.push(`box-shadow: ${shadowArb[1].replace(/_/g, ' ')}`); return results; }

  // ---- Transform (markers for aggregation) ----
  if (c === '-translate-x-1/2') { results.push('__transform__:translateX(-50%)'); return results; }
  if (c === '-translate-y-1/2') { results.push('__transform__:translateY(-50%)'); return results; }
  if (c === 'translate-x-1/2') { results.push('__transform__:translateX(50%)'); return results; }
  if (c === 'translate-y-1/2') { results.push('__transform__:translateY(50%)'); return results; }
  const translateXArb = c.match(/^-?translate-x-\[(.+)\]$/);
  if (translateXArb) {
    const neg = c.startsWith('-') ? '-' : '';
    results.push(`__transform__:translateX(${neg}${translateXArb[1]})`);
    return results;
  }
  const translateYArb = c.match(/^-?translate-y-\[(.+)\]$/);
  if (translateYArb) {
    const neg = c.startsWith('-') ? '-' : '';
    results.push(`__transform__:translateY(${neg}${translateYArb[1]})`);
    return results;
  }
  const rotateArb = c.match(/^-?rotate-\[(.+)\]$/);
  if (rotateArb) {
    const neg = c.startsWith('-') ? '-' : '';
    results.push(`__transform__:rotate(${neg}${rotateArb[1]})`);
    return results;
  }
  const rotateNum = c.match(/^-?rotate-(\d+)$/);
  if (rotateNum) {
    const neg = c.startsWith('-') ? '-' : '';
    results.push(`__transform__:rotate(${neg}${rotateNum[1]}deg)`);
    return results;
  }
  const skewXArb = c.match(/^-?skew-x-\[(.+)\]$/);
  if (skewXArb) {
    const neg = c.startsWith('-') ? '-' : '';
    results.push(`__transform__:skewX(${neg}${skewXArb[1]})`);
    return results;
  }
  const skewYArb = c.match(/^-?skew-y-\[(.+)\]$/);
  if (skewYArb) {
    const neg = c.startsWith('-') ? '-' : '';
    results.push(`__transform__:skewY(${neg}${skewYArb[1]})`);
    return results;
  }

  // ---- Cursor ----
  if (c === 'cursor-pointer') { results.push('cursor: pointer'); return results; }
  if (c === 'cursor-default') { results.push('cursor: default'); return results; }

  // ---- Misc ----
  if (c === 'select-none') { results.push('user-select: none'); return results; }
  if (c === 'list-none') { results.push('list-style: none'); return results; }

  // Unknown class — skip silently
  return results;
}

// ---------------------------------------------------------------------------
// Post-process raw CSS declarations: aggregate transforms, gradients, fonts
// ---------------------------------------------------------------------------

function postProcessDeclarations(rawDecls) {
  const transforms = [];
  let gradientDir = null;
  let gradientFrom = null;
  let gradientTo = null;
  let gradientVia = null;
  let fontFamilyRaw = null;
  const finalDecls = [];

  for (const d of rawDecls) {
    if (d.startsWith('__transform__:')) {
      transforms.push(d.slice('__transform__:'.length));
    } else if (d.startsWith('__gradient_dir__:')) {
      gradientDir = d.slice('__gradient_dir__:'.length);
    } else if (d.startsWith('__gradient_from__:')) {
      gradientFrom = d.slice('__gradient_from__:'.length);
    } else if (d.startsWith('__gradient_to__:')) {
      gradientTo = d.slice('__gradient_to__:'.length);
    } else if (d.startsWith('__gradient_via__:')) {
      gradientVia = d.slice('__gradient_via__:'.length);
    } else if (d.startsWith('__font_family__:')) {
      fontFamilyRaw = d.slice('__font_family__:'.length);
    } else {
      finalDecls.push(d);
    }
  }

  // Combine transforms
  if (transforms.length > 0) {
    finalDecls.push(`transform: ${transforms.join(' ')}`);
  }

  // Combine gradient
  if (gradientDir && gradientFrom) {
    const stops = [gradientFrom];
    if (gradientVia) stops.push(gradientVia);
    if (gradientTo) stops.push(gradientTo);
    finalDecls.push(`background: linear-gradient(${gradientDir}, ${stops.join(', ')})`);
  }

  // Font family
  if (fontFamilyRaw) {
    // Extract weight hint from font name like 'FontName:Medium'
    const weightMatch = fontFamilyRaw.match(/:(\w+)/);
    const weightMap = {
      'Thin': '100', 'ExtraLight': '200', 'Light': '300', 'Regular': '400',
      'Medium': '500', 'SemiBold': '600', 'Bold': '700', 'ExtraBold': '800', 'Black': '900',
    };
    if (weightMatch && weightMap[weightMatch[1]]) {
      // Only add if not already present
      const hasWeight = finalDecls.some(d => d.startsWith('font-weight:'));
      if (!hasWeight) {
        finalDecls.push(`font-weight: ${weightMap[weightMatch[1]]}`);
      }
    }
    // Replace with system font stack
    finalDecls.push("font-family: -apple-system, 'Apple SD Gothic Neo', sans-serif");
  }

  return finalDecls;
}

// ---------------------------------------------------------------------------
// JSX inline style object → CSS declarations
// ---------------------------------------------------------------------------

function camelToKebab(str) {
  return str.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
}

function inlineStyleToCSS(styleProps) {
  // styleProps is an array of {key, value} from the AST ObjectExpression
  const decls = [];
  for (const { key, value } of styleProps) {
    const cssProp = camelToKebab(key);
    decls.push(`${cssProp}: ${value}`);
  }
  return decls;
}

// ---------------------------------------------------------------------------
// AST walking + HTML/CSS generation
// ---------------------------------------------------------------------------

function run(outputDir) {
  const absDir = path.resolve(outputDir);
  const jsxPath = path.join(absDir, '.react-source.jsx');
  const imageMapPath = path.join(absDir, '.image-map.json');

  if (!fs.existsSync(jsxPath)) {
    console.error(`[react-to-vanilla] ${jsxPath} not found.`);
    return;
  }

  // Load image map
  let imageMap = {};
  if (fs.existsSync(imageMapPath)) {
    try {
      imageMap = JSON.parse(fs.readFileSync(imageMapPath, 'utf-8'));
    } catch (e) {
      console.warn(`[react-to-vanilla] Warning: Could not parse .image-map.json: ${e.message}`);
    }
  }

  // Read source
  const source = fs.readFileSync(jsxPath, 'utf-8');

  // Extract top-level variable declarations (const img1 = "...";)
  const varMap = {};
  const varRegex = /(?:const|let|var)\s+(\w+)\s*=\s*["']([^"']+)["']/g;
  let varMatch;
  while ((varMatch = varRegex.exec(source)) !== null) {
    varMap[varMatch[1]] = varMatch[2];
  }

  // Extract inner JSX from the component wrapper
  const innerJSX = extractInnerJSX(source);
  if (!innerJSX) {
    console.error('[react-to-vanilla] Could not extract JSX from component.');
    return;
  }

  // Parse JSX
  let ast;
  try {
    const parser = require('@babel/parser');
    ast = parser.parse(`<>${innerJSX}</>`, {
      plugins: ['jsx'],
      sourceType: 'module',
    });
  } catch (e) {
    console.error(`[react-to-vanilla] Parse error: ${e.message}`);
    return;
  }

  // Walk AST
  const traverse = require('@babel/traverse').default || require('@babel/traverse');
  const t = require('@babel/types');

  let classCounter = 0;
  const cssRules = []; // { selector, declarations[] }
  const ruleCache = new Map(); // declarations-key → className (for dedup)
  let elementCount = 0;

  function getOrCreateClass(declarations) {
    if (declarations.length === 0) return null;
    const key = declarations.slice().sort().join(';');
    if (ruleCache.has(key)) return ruleCache.get(key);
    classCounter++;
    const className = `f2c-${classCounter}`;
    ruleCache.set(key, className);
    cssRules.push({ selector: `.${className}`, declarations });
    return className;
  }

  function processJSXElement(nodePath) {
    const node = nodePath.node;
    const opening = node.openingElement || node;
    const tagName = getTagName(opening, t);
    if (!tagName) return '';

    elementCount++;

    // Collect attributes
    let classes = [];
    const extraAttrs = {};
    let inlineStyleDecls = [];

    if (opening.attributes) {
      for (const attr of opening.attributes) {
        if (!t.isJSXAttribute(attr)) continue;
        const name = attr.name && attr.name.name;
        if (!name) continue;

        if (name === 'className' || name === 'class') {
          const val = extractStringValue(attr.value, t);
          if (val) classes = val.split(/\s+/).filter(Boolean);
        } else if (name === 'style') {
          inlineStyleDecls = extractInlineStyle(attr.value, t);
        } else if (name === 'src') {
          const val = extractSrcValue(attr.value, t, varMap, imageMap);
          if (val) extraAttrs.src = val;
        } else if (name === 'alt') {
          const val = extractStringValue(attr.value, t);
          if (val !== null) extraAttrs.alt = val;
        } else if (name === 'href') {
          const val = extractStringValue(attr.value, t);
          if (val) extraAttrs.href = val;
        } else if (name === 'start') {
          const val = extractStringValue(attr.value, t);
          if (val) extraAttrs.start = val;
        } else if (name === 'target') {
          const val = extractStringValue(attr.value, t);
          if (val) extraAttrs.target = val;
        } else if (name === 'aria-hidden') {
          // skip
        } else if (name === 'dangerouslySetInnerHTML') {
          // skip
        }
      }
    }

    // Convert tailwind classes → CSS declarations
    let rawDecls = [];
    for (const cls of classes) {
      rawDecls.push(...tailwindToCSS(cls));
    }
    // Add inline style declarations
    rawDecls.push(...inlineStyleDecls);

    // Post-process (transforms, gradients, fonts)
    const finalDecls = postProcessDeclarations(rawDecls);

    // Get or create CSS class
    const cssClass = getOrCreateClass(finalDecls);

    // Build HTML tag
    const htmlTag = mapTagName(tagName);
    const attrStr = buildAttrString(cssClass, extraAttrs);

    // Self-closing tags
    const selfClosing = ['img', 'br', 'hr', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr'];
    if (selfClosing.includes(htmlTag) || (node.openingElement && node.openingElement.selfClosing && !node.children?.length)) {
      return `<${htmlTag}${attrStr} />`;
    }

    // Process children
    const childrenHTML = processChildren(node.children || [], t, nodePath);
    return `<${htmlTag}${attrStr}>${childrenHTML}</${htmlTag}>`;
  }

  function processChildren(children, t, parentPath) {
    let html = '';
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (t.isJSXText(child)) {
        const text = child.value.replace(/\n\s*/g, ' ').trim();
        if (text) html += escapeHTML(text);
      } else if (t.isJSXElement(child)) {
        // We need to traverse into it
        html += processJSXNode(child, t);
      } else if (t.isJSXExpressionContainer(child)) {
        if (t.isTemplateLiteral(child.expression)) {
          // {`text`} → plain text
          const quasis = child.expression.quasis.map(q => q.value.cooked || q.value.raw).join('');
          html += escapeHTML(quasis);
        } else if (t.isStringLiteral(child.expression)) {
          html += escapeHTML(child.expression.value);
        }
        // Other expressions: skip
      } else if (t.isJSXFragment(child)) {
        html += processChildren(child.children || [], t, parentPath);
      }
    }
    return html;
  }

  // Non-traversal recursive processing of JSX nodes
  function processJSXNode(node, t) {
    if (t.isJSXElement(node)) {
      const opening = node.openingElement;
      const tagName = getTagName(opening, t);
      if (!tagName) return '';

      elementCount++;

      let classes = [];
      const extraAttrs = {};
      let inlineStyleDecls = [];

      if (opening.attributes) {
        for (const attr of opening.attributes) {
          if (!t.isJSXAttribute(attr)) continue;
          const name = attr.name && attr.name.name;
          if (!name) continue;

          if (name === 'className' || name === 'class') {
            const val = extractStringValue(attr.value, t);
            if (val) classes = val.split(/\s+/).filter(Boolean);
          } else if (name === 'style') {
            inlineStyleDecls = extractInlineStyle(attr.value, t);
          } else if (name === 'src') {
            const val = extractSrcValue(attr.value, t, varMap, imageMap);
            if (val) extraAttrs.src = val;
          } else if (name === 'alt') {
            const val = extractStringValue(attr.value, t);
            if (val !== null) extraAttrs.alt = val;
          } else if (name === 'href') {
            const val = extractStringValue(attr.value, t);
            if (val) extraAttrs.href = val;
          } else if (name === 'start') {
            const val = extractStringValue(attr.value, t);
            if (val) extraAttrs.start = val;
          } else if (name === 'target') {
            const val = extractStringValue(attr.value, t);
            if (val) extraAttrs.target = val;
          }
        }
      }

      let rawDecls = [];
      for (const cls of classes) {
        rawDecls.push(...tailwindToCSS(cls));
      }
      rawDecls.push(...inlineStyleDecls);
      const finalDecls = postProcessDeclarations(rawDecls);
      const cssClass = getOrCreateClass(finalDecls);

      const htmlTag = mapTagName(tagName);
      const attrStr = buildAttrString(cssClass, extraAttrs);

      const selfClosing = ['img', 'br', 'hr', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr'];
      if (selfClosing.includes(htmlTag) || (opening.selfClosing && !node.children?.length)) {
        return `<${htmlTag}${attrStr} />`;
      }

      const childrenHTML = processChildren(node.children || [], t, null);
      return `<${htmlTag}${attrStr}>${childrenHTML}</${htmlTag}>`;
    } else if (t.isJSXFragment(node)) {
      return processChildren(node.children || [], t, null);
    }
    return '';
  }

  // Find the root JSX element in the parsed AST
  let rootHTML = '';
  traverse(ast, {
    JSXFragment(p) {
      if (rootHTML) return;
      // Our wrapper fragment — process its children
      const parts = [];
      for (const child of p.node.children) {
        if (t.isJSXElement(child)) {
          parts.push(processJSXNode(child, t));
        } else if (t.isJSXText(child)) {
          const text = child.value.trim();
          if (text) parts.push(escapeHTML(text));
        }
      }
      rootHTML = parts.join('\n');
      p.stop();
    },
  });

  // Generate output files
  const htmlContent = buildHTML(rootHTML);
  const cssContent = buildCSS(cssRules);

  fs.writeFileSync(path.join(absDir, 'index.html'), htmlContent, 'utf-8');
  fs.writeFileSync(path.join(absDir, 'styles.css'), cssContent, 'utf-8');

  console.log(`[react-to-vanilla] Generated ${elementCount} elements, ${cssRules.length} CSS rules.`);
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function extractInnerJSX(source) {
  // Try to find return (\n ... \n); pattern
  const returnMatch = source.match(/return\s*\(\s*([\s\S]*)\s*\);\s*\}[\s\S]*$/);
  if (returnMatch) return returnMatch[1].trim();

  // Fallback: try to find return ( ... )
  const simpleReturn = source.match(/return\s*\(([\s\S]+)\)/);
  if (simpleReturn) return simpleReturn[1].trim();

  return null;
}

function getTagName(openingElement, t) {
  if (t.isJSXIdentifier(openingElement.name)) {
    return openingElement.name.name;
  }
  if (t.isJSXMemberExpression(openingElement.name)) {
    return null; // Skip complex components
  }
  return null;
}

function mapTagName(tag) {
  // React component names start with uppercase — map to div
  if (tag[0] === tag[0].toUpperCase()) return 'div';
  return tag;
}

function extractStringValue(attrValue, t) {
  if (!attrValue) return null;
  if (t.isStringLiteral(attrValue)) return attrValue.value;
  if (t.isJSXExpressionContainer(attrValue)) {
    if (t.isStringLiteral(attrValue.expression)) return attrValue.expression.value;
    if (t.isTemplateLiteral(attrValue.expression)) {
      return attrValue.expression.quasis.map(q => q.value.cooked || q.value.raw).join('');
    }
    if (t.isNumericLiteral(attrValue.expression)) return String(attrValue.expression.value);
  }
  return null;
}

function extractSrcValue(attrValue, t, varMap, imageMap) {
  if (!attrValue) return null;
  if (t.isStringLiteral(attrValue)) return attrValue.value;
  if (t.isJSXExpressionContainer(attrValue)) {
    const expr = attrValue.expression;
    if (t.isIdentifier(expr)) {
      const varName = expr.name;
      // Check image map first
      if (imageMap[varName]) return imageMap[varName];
      // Then check variable declarations
      if (varMap[varName]) return varMap[varName];
      return varName;
    }
    if (t.isStringLiteral(expr)) return expr.value;
    if (t.isTemplateLiteral(expr)) {
      return expr.quasis.map(q => q.value.cooked || q.value.raw).join('');
    }
  }
  return null;
}

function extractInlineStyle(attrValue, t) {
  const decls = [];
  if (!attrValue || !t.isJSXExpressionContainer(attrValue)) return decls;
  const expr = attrValue.expression;
  if (!t.isObjectExpression(expr)) return decls;

  for (const prop of expr.properties) {
    if (!t.isObjectProperty(prop)) continue;
    const key = t.isIdentifier(prop.key) ? prop.key.name : (t.isStringLiteral(prop.key) ? prop.key.value : null);
    if (!key) continue;
    let value = null;
    if (t.isStringLiteral(prop.value)) {
      value = prop.value.value;
    } else if (t.isNumericLiteral(prop.value)) {
      value = String(prop.value.value);
    } else if (t.isTemplateLiteral(prop.value)) {
      value = prop.value.quasis.map(q => q.value.cooked || q.value.raw).join('');
    }
    if (key && value !== null) {
      const cssProp = camelToKebab(key);
      decls.push(`${cssProp}: ${value}`);
    }
  }
  return decls;
}

function buildAttrString(cssClass, extraAttrs) {
  const parts = [];
  if (cssClass) parts.push(`class="${cssClass}"`);
  for (const [k, v] of Object.entries(extraAttrs)) {
    parts.push(`${k}="${escapeAttr(v)}"`);
  }
  return parts.length > 0 ? ' ' + parts.join(' ') : '';
}

function escapeHTML(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildHTML(bodyContent) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Figma to Code</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
${bodyContent}
</body>
</html>
`;
}

function buildCSS(rules) {
  const lines = [];
  lines.push('/* Generated by react-to-vanilla */');
  lines.push('* { margin: 0; padding: 0; box-sizing: border-box; }');
  lines.push('');
  for (const rule of rules) {
    lines.push(`${rule.selector} {`);
    for (const d of rule.declarations) {
      lines.push(`  ${d};`);
    }
    lines.push('}');
    lines.push('');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (require.main === module) {
  const outputDir = process.argv[2];
  if (!outputDir) {
    console.error('Usage: node tools/react-to-vanilla.js <outputDir>');
    process.exit(1);
  }
  run(outputDir);
}

module.exports = { run };
