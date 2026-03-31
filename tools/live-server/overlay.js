(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────
  var WS_PORT = window.__FIGMA_TO_CODE_WS_PORT__ || 3101;
  var BRAND = '#E0004D';
  var PANEL_ID = '__ftc-panel__';
  var HIGHLIGHT_ID = '__ftc-highlight__';

  // ── State ──────────────────────────────────────────────────────────────────
  var selectedEl = null;
  var ws = null;
  var undoStack = [];
  var redoStack = [];

  // ── WebSocket ──────────────────────────────────────────────────────────────
  function connectWS() {
    try {
      ws = new WebSocket('ws://localhost:' + WS_PORT);
    } catch (e) {
      ws = null;
      return;
    }

    ws.onclose = function () {
      ws = null;
      setTimeout(connectWS, 3000);
    };

    ws.onerror = function () {
      // will trigger onclose, reconnect handled there
    };

    ws.onmessage = function (evt) {
      var msg;
      try { msg = JSON.parse(evt.data); } catch (e) { return; }
      if (msg.type === 'reload') {
        window.location.reload();
      }
    };
  }

  function sendWS(data) {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(data));
    }
  }

  connectWS();

  // ── Helpers ────────────────────────────────────────────────────────────────
  function rgbToHex(rgb) {
    if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return '#000000';
    var m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return '#000000';
    return '#' + [m[1], m[2], m[3]].map(function (n) {
      return ('0' + parseInt(n, 10).toString(16)).slice(-2);
    }).join('');
  }

  function getComputedVal(el, prop) {
    return window.getComputedStyle(el).getPropertyValue(prop).trim();
  }

  function parsePixelVal(val) {
    var n = parseFloat(val);
    return isNaN(n) ? 0 : n;
  }

  // ── Highlight div ──────────────────────────────────────────────────────────
  var highlight = document.createElement('div');
  highlight.id = HIGHLIGHT_ID;
  highlight.style.cssText = [
    'position:fixed',
    'pointer-events:none',
    'box-sizing:border-box',
    'border:2px solid ' + BRAND,
    'z-index:2147483646',
    'display:none',
    'transition:all 0.08s ease',
  ].join(';');
  document.body.appendChild(highlight);

  function showHighlight(el) {
    var r = el.getBoundingClientRect();
    highlight.style.display = 'block';
    highlight.style.top = r.top + 'px';
    highlight.style.left = r.left + 'px';
    highlight.style.width = r.width + 'px';
    highlight.style.height = r.height + 'px';
  }

  function hideHighlight() {
    highlight.style.display = 'none';
  }

  // ── Panel DOM ──────────────────────────────────────────────────────────────
  var panel = document.createElement('div');
  panel.id = PANEL_ID;
  document.body.appendChild(panel);

  // Panel styles — scoped to #__ftc-panel__
  var styleTag = document.createElement('style');
  styleTag.textContent = [
    '#' + PANEL_ID + ' {',
    '  position: fixed;',
    '  top: 24px;',
    '  right: 24px;',
    '  width: 280px;',
    '  max-height: 80vh;',
    '  overflow-y: auto;',
    '  background: #ffffff;',
    '  border-radius: 10px;',
    '  box-shadow: 0 4px 24px rgba(0,0,0,0.18), 0 1px 4px rgba(0,0,0,0.10);',
    '  z-index: 2147483647;',
    '  display: none;',
    '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
    '  font-size: 12px;',
    '  color: #1a1a1a;',
    '  box-sizing: border-box;',
    '}',
    '#' + PANEL_ID + ' * {',
    '  box-sizing: border-box;',
    '}',
    '#' + PANEL_ID + ' .__ftc-header {',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: space-between;',
    '  padding: 12px 14px 10px;',
    '  border-bottom: 1px solid #f0f0f0;',
    '  position: sticky;',
    '  top: 0;',
    '  background: #fff;',
    '  z-index: 1;',
    '}',
    '#' + PANEL_ID + ' .__ftc-header .__ftc-title {',
    '  font-weight: 600;',
    '  font-size: 13px;',
    '  color: #1a1a1a;',
    '  white-space: nowrap;',
    '  overflow: hidden;',
    '  text-overflow: ellipsis;',
    '  max-width: 200px;',
    '}',
    '#' + PANEL_ID + ' .__ftc-header .__ftc-subtitle {',
    '  font-size: 11px;',
    '  color: #999;',
    '  margin-top: 2px;',
    '}',
    '#' + PANEL_ID + ' .__ftc-close {',
    '  background: none;',
    '  border: none;',
    '  cursor: pointer;',
    '  padding: 4px;',
    '  color: #888;',
    '  font-size: 16px;',
    '  line-height: 1;',
    '  border-radius: 4px;',
    '  flex-shrink: 0;',
    '}',
    '#' + PANEL_ID + ' .__ftc-close:hover {',
    '  background: #f5f5f5;',
    '  color: #333;',
    '}',
    '#' + PANEL_ID + ' .__ftc-body {',
    '  padding: 10px 14px 14px;',
    '}',
    '#' + PANEL_ID + ' .__ftc-section {',
    '  margin-bottom: 14px;',
    '}',
    '#' + PANEL_ID + ' .__ftc-section-label {',
    '  font-size: 10px;',
    '  font-weight: 700;',
    '  letter-spacing: 0.06em;',
    '  text-transform: uppercase;',
    '  color: ' + BRAND + ';',
    '  margin-bottom: 6px;',
    '}',
    '#' + PANEL_ID + ' .__ftc-row {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 6px;',
    '  margin-bottom: 6px;',
    '}',
    '#' + PANEL_ID + ' .__ftc-label {',
    '  width: 82px;',
    '  flex-shrink: 0;',
    '  color: #666;',
    '  font-size: 11px;',
    '}',
    '#' + PANEL_ID + ' .__ftc-input {',
    '  flex: 1;',
    '  border: 1px solid #ddd;',
    '  border-radius: 5px;',
    '  padding: 4px 7px;',
    '  font-size: 12px;',
    '  font-family: inherit;',
    '  color: #1a1a1a;',
    '  background: #fafafa;',
    '  min-width: 0;',
    '}',
    '#' + PANEL_ID + ' .__ftc-input:focus {',
    '  outline: none;',
    '  border-color: ' + BRAND + ';',
    '  background: #fff;',
    '}',
    '#' + PANEL_ID + ' .__ftc-select {',
    '  flex: 1;',
    '  border: 1px solid #ddd;',
    '  border-radius: 5px;',
    '  padding: 4px 7px;',
    '  font-size: 12px;',
    '  font-family: inherit;',
    '  color: #1a1a1a;',
    '  background: #fafafa;',
    '  min-width: 0;',
    '}',
    '#' + PANEL_ID + ' .__ftc-select:focus {',
    '  outline: none;',
    '  border-color: ' + BRAND + ';',
    '}',
    '#' + PANEL_ID + ' .__ftc-input-unit {',
    '  display: flex;',
    '  align-items: center;',
    '  flex: 1;',
    '  gap: 2px;',
    '  min-width: 0;',
    '}',
    '#' + PANEL_ID + ' .__ftc-input-unit .__ftc-input {',
    '  flex: 1;',
    '}',
    '#' + PANEL_ID + ' .__ftc-unit {',
    '  font-size: 11px;',
    '  color: #aaa;',
    '  flex-shrink: 0;',
    '}',
    '#' + PANEL_ID + ' .__ftc-color-row {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 6px;',
    '  margin-bottom: 6px;',
    '}',
    '#' + PANEL_ID + ' .__ftc-color-swatch {',
    '  width: 26px;',
    '  height: 26px;',
    '  border: 1px solid #ddd;',
    '  border-radius: 4px;',
    '  cursor: pointer;',
    '  flex-shrink: 0;',
    '  padding: 0;',
    '}',
    '#' + PANEL_ID + ' .__ftc-grid-4 {',
    '  display: grid;',
    '  grid-template-columns: 1fr 1fr 1fr 1fr;',
    '  gap: 5px;',
    '  margin-bottom: 4px;',
    '}',
    '#' + PANEL_ID + ' .__ftc-grid-4 .__ftc-grid-item {',
    '  display: flex;',
    '  flex-direction: column;',
    '  align-items: center;',
    '  gap: 2px;',
    '}',
    '#' + PANEL_ID + ' .__ftc-grid-4 .__ftc-input {',
    '  text-align: center;',
    '  padding: 4px 2px;',
    '}',
    '#' + PANEL_ID + ' .__ftc-grid-label {',
    '  font-size: 10px;',
    '  color: #bbb;',
    '}',
    '#' + PANEL_ID + ' .__ftc-slider {',
    '  flex: 1;',
    '  accent-color: ' + BRAND + ';',
    '  min-width: 0;',
    '}',
    '#' + PANEL_ID + ' .__ftc-textarea {',
    '  width: 100%;',
    '  border: 1px solid #ddd;',
    '  border-radius: 5px;',
    '  padding: 6px 7px;',
    '  font-size: 12px;',
    '  font-family: inherit;',
    '  color: #1a1a1a;',
    '  background: #fafafa;',
    '  resize: vertical;',
    '  min-height: 52px;',
    '}',
    '#' + PANEL_ID + ' .__ftc-textarea:focus {',
    '  outline: none;',
    '  border-color: ' + BRAND + ';',
    '  background: #fff;',
    '}',
  ].join('\n');
  document.head.appendChild(styleTag);

  // ── Build panel HTML ───────────────────────────────────────────────────────
  function buildPanel() {
    panel.innerHTML = [
      '<div class="__ftc-header">',
      '  <div>',
      '    <div class="__ftc-title" id="__ftc-tag__"></div>',
      '    <div class="__ftc-subtitle" id="__ftc-id__"></div>',
      '  </div>',
      '  <button class="__ftc-close" id="__ftc-close-btn__" title="Close (Esc)">&#x2715;</button>',
      '</div>',
      '<div class="__ftc-body">',

      // ── Text ──
      '  <div class="__ftc-section">',
      '    <div class="__ftc-section-label">Text</div>',
      '    <textarea class="__ftc-textarea" id="__ftc-text-content__" placeholder="Text content"></textarea>',
      '  </div>',

      // ── Typography ──
      '  <div class="__ftc-section">',
      '    <div class="__ftc-section-label">Typography</div>',
      '    <div class="__ftc-row">',
      '      <span class="__ftc-label">Font size</span>',
      '      <div class="__ftc-input-unit">',
      '        <input class="__ftc-input" id="__ftc-font-size__" type="number" min="1" max="999" step="1">',
      '        <span class="__ftc-unit">px</span>',
      '      </div>',
      '    </div>',
      '    <div class="__ftc-row">',
      '      <span class="__ftc-label">Font weight</span>',
      '      <select class="__ftc-select" id="__ftc-font-weight__">',
      '        <option value="300">300 — Light</option>',
      '        <option value="400">400 — Regular</option>',
      '        <option value="500">500 — Medium</option>',
      '        <option value="600">600 — SemiBold</option>',
      '        <option value="700">700 — Bold</option>',
      '      </select>',
      '    </div>',
      '  </div>',

      // ── Colors ──
      '  <div class="__ftc-section">',
      '    <div class="__ftc-section-label">Colors</div>',
      '    <div class="__ftc-color-row">',
      '      <span class="__ftc-label">Text color</span>',
      '      <input type="color" class="__ftc-color-swatch" id="__ftc-color-picker__">',
      '      <input class="__ftc-input" id="__ftc-color-hex__" type="text" maxlength="7" placeholder="#000000">',
      '    </div>',
      '    <div class="__ftc-color-row">',
      '      <span class="__ftc-label">Background</span>',
      '      <input type="color" class="__ftc-color-swatch" id="__ftc-bg-picker__">',
      '      <input class="__ftc-input" id="__ftc-bg-hex__" type="text" maxlength="7" placeholder="#ffffff">',
      '    </div>',
      '  </div>',

      // ── Spacing: Padding ──
      '  <div class="__ftc-section">',
      '    <div class="__ftc-section-label">Padding</div>',
      '    <div class="__ftc-grid-4">',
      '      <div class="__ftc-grid-item"><input class="__ftc-input" id="__ftc-pt__" type="number" min="0"><span class="__ftc-grid-label">Top</span></div>',
      '      <div class="__ftc-grid-item"><input class="__ftc-input" id="__ftc-pr__" type="number" min="0"><span class="__ftc-grid-label">Right</span></div>',
      '      <div class="__ftc-grid-item"><input class="__ftc-input" id="__ftc-pb__" type="number" min="0"><span class="__ftc-grid-label">Bottom</span></div>',
      '      <div class="__ftc-grid-item"><input class="__ftc-input" id="__ftc-pl__" type="number" min="0"><span class="__ftc-grid-label">Left</span></div>',
      '    </div>',
      '  </div>',

      // ── Spacing: Margin ──
      '  <div class="__ftc-section">',
      '    <div class="__ftc-section-label">Margin</div>',
      '    <div class="__ftc-grid-4">',
      '      <div class="__ftc-grid-item"><input class="__ftc-input" id="__ftc-mt__" type="number"><span class="__ftc-grid-label">Top</span></div>',
      '      <div class="__ftc-grid-item"><input class="__ftc-input" id="__ftc-mr__" type="number"><span class="__ftc-grid-label">Right</span></div>',
      '      <div class="__ftc-grid-item"><input class="__ftc-input" id="__ftc-mb__" type="number"><span class="__ftc-grid-label">Bottom</span></div>',
      '      <div class="__ftc-grid-item"><input class="__ftc-input" id="__ftc-ml__" type="number"><span class="__ftc-grid-label">Left</span></div>',
      '    </div>',
      '  </div>',

      // ── Effects ──
      '  <div class="__ftc-section">',
      '    <div class="__ftc-section-label">Effects</div>',
      '    <div class="__ftc-row">',
      '      <span class="__ftc-label">Border radius</span>',
      '      <div class="__ftc-input-unit">',
      '        <input class="__ftc-input" id="__ftc-border-radius__" type="number" min="0" step="1">',
      '        <span class="__ftc-unit">px</span>',
      '      </div>',
      '    </div>',
      '    <div class="__ftc-row">',
      '      <span class="__ftc-label">Opacity</span>',
      '      <input type="range" class="__ftc-slider" id="__ftc-opacity__" min="0" max="1" step="0.01">',
      '      <span id="__ftc-opacity-val__" style="width:32px;text-align:right;color:#666;font-size:11px;">1</span>',
      '    </div>',
      '  </div>',

      '</div>',
    ].join('');

    // Wire up close button
    document.getElementById('__ftc-close-btn__').addEventListener('click', function (e) {
      e.stopPropagation();
      deselectElement();
    });

    // Wire up all inputs
    wireInputs();
  }

  // ── Populate panel from element's computed styles ─────────────────────────
  function populatePanel(el) {
    var cs = window.getComputedStyle(el);

    document.getElementById('__ftc-tag__').textContent = el.tagName.toLowerCase();
    document.getElementById('__ftc-id__').textContent = '#' + el.getAttribute('data-element-id');

    // Text content — only the direct text, not child element text
    var textContent = '';
    el.childNodes.forEach(function (node) {
      if (node.nodeType === Node.TEXT_NODE) textContent += node.textContent;
    });
    document.getElementById('__ftc-text-content__').value = textContent.trim();

    // Typography
    document.getElementById('__ftc-font-size__').value = parsePixelVal(cs.fontSize);
    var fwEl = document.getElementById('__ftc-font-weight__');
    var fwVal = cs.fontWeight;
    // Normalize named weights
    if (fwVal === 'bold') fwVal = '700';
    if (fwVal === 'normal') fwVal = '400';
    fwEl.value = fwVal;

    // Colors
    var colorHex = rgbToHex(cs.color);
    document.getElementById('__ftc-color-picker__').value = colorHex;
    document.getElementById('__ftc-color-hex__').value = colorHex;

    var bgHex = rgbToHex(cs.backgroundColor);
    document.getElementById('__ftc-bg-picker__').value = bgHex;
    document.getElementById('__ftc-bg-hex__').value = bgHex;

    // Padding
    document.getElementById('__ftc-pt__').value = parsePixelVal(cs.paddingTop);
    document.getElementById('__ftc-pr__').value = parsePixelVal(cs.paddingRight);
    document.getElementById('__ftc-pb__').value = parsePixelVal(cs.paddingBottom);
    document.getElementById('__ftc-pl__').value = parsePixelVal(cs.paddingLeft);

    // Margin
    document.getElementById('__ftc-mt__').value = parsePixelVal(cs.marginTop);
    document.getElementById('__ftc-mr__').value = parsePixelVal(cs.marginRight);
    document.getElementById('__ftc-mb__').value = parsePixelVal(cs.marginBottom);
    document.getElementById('__ftc-ml__').value = parsePixelVal(cs.marginLeft);

    // Effects
    document.getElementById('__ftc-border-radius__').value = parsePixelVal(cs.borderRadius);
    var opacity = parseFloat(cs.opacity);
    if (isNaN(opacity)) opacity = 1;
    document.getElementById('__ftc-opacity__').value = opacity;
    document.getElementById('__ftc-opacity-val__').textContent = opacity.toFixed(2);
  }

  // ── Undo / Redo ────────────────────────────────────────────────────────────
  function pushUndo(entry) {
    undoStack.push(entry);
    redoStack = [];
  }

  function applyEntry(entry) {
    if (!entry) return;
    var el = document.querySelector('[data-element-id="' + entry.elementId + '"]');
    if (!el) return;

    if (entry.type === 'style') {
      el.style[entry.property] = entry.value;
      sendWS({ type: 'style-update', elementId: entry.elementId, property: cssPropertyName(entry.property), value: entry.value });
    } else if (entry.type === 'text') {
      // Set direct text node
      el.childNodes.forEach(function (node) {
        if (node.nodeType === Node.TEXT_NODE) node.textContent = entry.value;
      });
      if (!Array.from(el.childNodes).some(function (n) { return n.nodeType === Node.TEXT_NODE; })) {
        el.textContent = entry.value;
      }
      sendWS({ type: 'text-update', elementId: entry.elementId, content: entry.value });
    }

    if (selectedEl && selectedEl.getAttribute('data-element-id') === entry.elementId) {
      populatePanel(selectedEl);
    }
  }

  function undo() {
    var entry = undoStack.pop();
    if (!entry) return;
    redoStack.push(entry);
    applyEntry(entry.prev);
  }

  function redo() {
    var entry = redoStack.pop();
    if (!entry) return;
    undoStack.push(entry);
    applyEntry(entry.next);
  }

  // ── Handle style change ────────────────────────────────────────────────────
  // Converts camelCase JS property to kebab-case CSS property name
  function cssPropertyName(jsName) {
    return jsName.replace(/([A-Z])/g, function (m) { return '-' + m.toLowerCase(); });
  }

  function handleStyleChange(jsProp, value) {
    if (!selectedEl) return;
    var elementId = selectedEl.getAttribute('data-element-id');
    var prevValue = selectedEl.style[jsProp] || getComputedVal(selectedEl, cssPropertyName(jsProp));

    selectedEl.style[jsProp] = value;

    pushUndo({
      type: 'style',
      elementId: elementId,
      property: jsProp,
      prev: { type: 'style', elementId: elementId, property: jsProp, value: prevValue },
      next: { type: 'style', elementId: elementId, property: jsProp, value: value },
    });

    sendWS({ type: 'style-update', elementId: elementId, property: cssPropertyName(jsProp), value: value });
  }

  function handleTextChange(content) {
    if (!selectedEl) return;
    var elementId = selectedEl.getAttribute('data-element-id');

    var prevText = '';
    selectedEl.childNodes.forEach(function (node) {
      if (node.nodeType === Node.TEXT_NODE) prevText += node.textContent;
    });

    // Apply in DOM
    var applied = false;
    selectedEl.childNodes.forEach(function (node) {
      if (node.nodeType === Node.TEXT_NODE && !applied) {
        node.textContent = content;
        applied = true;
      }
    });
    if (!applied) selectedEl.textContent = content;

    pushUndo({
      type: 'text',
      elementId: elementId,
      prev: { type: 'text', elementId: elementId, value: prevText },
      next: { type: 'text', elementId: elementId, value: content },
    });

    sendWS({ type: 'text-update', elementId: elementId, content: content });
  }

  // ── Wire inputs ────────────────────────────────────────────────────────────
  function wireInputs() {
    // Text content
    var textArea = document.getElementById('__ftc-text-content__');
    textArea.addEventListener('input', function () {
      handleTextChange(textArea.value);
    });

    // Font size
    var fontSizeInput = document.getElementById('__ftc-font-size__');
    fontSizeInput.addEventListener('input', function () {
      handleStyleChange('fontSize', fontSizeInput.value + 'px');
    });

    // Font weight
    var fontWeightSel = document.getElementById('__ftc-font-weight__');
    fontWeightSel.addEventListener('change', function () {
      handleStyleChange('fontWeight', fontWeightSel.value);
    });

    // Text color — picker
    var colorPicker = document.getElementById('__ftc-color-picker__');
    var colorHex = document.getElementById('__ftc-color-hex__');
    colorPicker.addEventListener('input', function () {
      colorHex.value = colorPicker.value;
      handleStyleChange('color', colorPicker.value);
    });
    colorHex.addEventListener('input', function () {
      var v = colorHex.value;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        colorPicker.value = v;
        handleStyleChange('color', v);
      }
    });
    colorHex.addEventListener('blur', function () {
      var v = colorHex.value;
      if (!/^#[0-9a-fA-F]{6}$/.test(v)) {
        // restore
        colorHex.value = colorPicker.value;
      }
    });

    // Background color — picker
    var bgPicker = document.getElementById('__ftc-bg-picker__');
    var bgHex = document.getElementById('__ftc-bg-hex__');
    bgPicker.addEventListener('input', function () {
      bgHex.value = bgPicker.value;
      handleStyleChange('backgroundColor', bgPicker.value);
    });
    bgHex.addEventListener('input', function () {
      var v = bgHex.value;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        bgPicker.value = v;
        handleStyleChange('backgroundColor', v);
      }
    });
    bgHex.addEventListener('blur', function () {
      var v = bgHex.value;
      if (!/^#[0-9a-fA-F]{6}$/.test(v)) {
        bgHex.value = bgPicker.value;
      }
    });

    // Padding
    [
      ['__ftc-pt__', 'paddingTop'],
      ['__ftc-pr__', 'paddingRight'],
      ['__ftc-pb__', 'paddingBottom'],
      ['__ftc-pl__', 'paddingLeft'],
    ].forEach(function (pair) {
      var inp = document.getElementById(pair[0]);
      inp.addEventListener('input', function () {
        handleStyleChange(pair[1], inp.value + 'px');
      });
    });

    // Margin
    [
      ['__ftc-mt__', 'marginTop'],
      ['__ftc-mr__', 'marginRight'],
      ['__ftc-mb__', 'marginBottom'],
      ['__ftc-ml__', 'marginLeft'],
    ].forEach(function (pair) {
      var inp = document.getElementById(pair[0]);
      inp.addEventListener('input', function () {
        handleStyleChange(pair[1], inp.value + 'px');
      });
    });

    // Border radius
    var brInput = document.getElementById('__ftc-border-radius__');
    brInput.addEventListener('input', function () {
      handleStyleChange('borderRadius', brInput.value + 'px');
    });

    // Opacity
    var opacitySlider = document.getElementById('__ftc-opacity__');
    var opacityVal = document.getElementById('__ftc-opacity-val__');
    opacitySlider.addEventListener('input', function () {
      opacityVal.textContent = parseFloat(opacitySlider.value).toFixed(2);
      handleStyleChange('opacity', opacitySlider.value);
    });

    // Prevent panel clicks from propagating to document (avoid deselect)
    panel.addEventListener('click', function (e) {
      e.stopPropagation();
    });
    panel.addEventListener('mousedown', function (e) {
      e.stopPropagation();
    });
  }

  // ── Select / deselect element ──────────────────────────────────────────────
  function selectElement(el) {
    selectedEl = el;
    hideHighlight();
    panel.style.display = 'block';
    populatePanel(el);
  }

  function deselectElement() {
    selectedEl = null;
    panel.style.display = 'none';
    hideHighlight();
  }

  // ── Mouse event handlers ───────────────────────────────────────────────────
  document.addEventListener('mouseover', function (e) {
    if (selectedEl) return; // don't re-highlight when panel is open
    var target = e.target;
    // Walk up to find nearest element with data-element-id
    while (target && target !== document.body) {
      if (target.id === PANEL_ID || target.id === HIGHLIGHT_ID) return;
      if (target.hasAttribute && target.hasAttribute('data-element-id')) {
        showHighlight(target);
        return;
      }
      target = target.parentElement;
    }
    hideHighlight();
  }, true);

  document.addEventListener('mouseout', function (e) {
    if (selectedEl) return;
    hideHighlight();
  }, true);

  document.addEventListener('click', function (e) {
    // Ignore clicks on the panel or highlight overlay
    if (e.target.closest && (e.target.closest('#' + PANEL_ID) || e.target.closest('#' + HIGHLIGHT_ID))) {
      return;
    }

    var target = e.target;
    while (target && target !== document.body) {
      if (target.hasAttribute && target.hasAttribute('data-element-id')) {
        e.preventDefault();
        e.stopPropagation();
        selectElement(target);
        return;
      }
      target = target.parentElement;
    }

    // Clicked on empty space — deselect
    deselectElement();
  }, true);

  // ── Keyboard handlers ──────────────────────────────────────────────────────
  document.addEventListener('keydown', function (e) {
    var isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    var modKey = isMac ? e.metaKey : e.ctrlKey;

    if (e.key === 'Escape') {
      deselectElement();
      return;
    }

    if (modKey && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }

    if (modKey && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
      return;
    }
  });

  // ── Reposition highlight on scroll/resize ─────────────────────────────────
  window.addEventListener('scroll', function () {
    if (selectedEl) {
      // panel stays fixed, highlight not shown when panel open
    } else {
      hideHighlight();
    }
  }, true);

  // ── Init ───────────────────────────────────────────────────────────────────
  buildPanel();

})();
