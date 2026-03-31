const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { extractTokens } = require('../token-extractor.js');

describe('extractTokens', () => {
  it('색상 토큰을 추출한다', () => {
    const figmaData = {
      nodes: {
        'node-1': {
          fills: [{ type: 'SOLID', color: { r: 0.878, g: 0, b: 0.302, a: 1 } }],
          name: 'Primary Button'
        }
      }
    };
    const tokens = extractTokens(figmaData);
    assert.ok(tokens.colors);
    assert.ok(Object.keys(tokens.colors).length > 0);
  });

  it('폰트 토큰을 추출한다', () => {
    const figmaData = {
      nodes: {
        'node-1': {
          type: 'TEXT',
          style: { fontFamily: 'Poppins', fontSize: 32, fontWeight: 700 },
          name: 'Heading'
        },
        'node-2': {
          type: 'TEXT',
          style: { fontFamily: 'Inter', fontSize: 16, fontWeight: 400 },
          name: 'Body'
        }
      }
    };
    const tokens = extractTokens(figmaData);
    assert.ok(tokens.fonts);
    assert.ok(Object.keys(tokens.fonts).length > 0);
  });

  it('간격 토큰을 추출한다', () => {
    const figmaData = {
      nodes: {
        'node-1': {
          type: 'FRAME',
          paddingTop: 16, paddingRight: 32, paddingBottom: 16, paddingLeft: 32,
          itemSpacing: 8
        }
      }
    };
    const tokens = extractTokens(figmaData);
    assert.ok(tokens.spacing);
    assert.ok(Object.keys(tokens.spacing).length > 0);
  });

  it('빈 데이터를 처리한다', () => {
    const tokens = extractTokens({});
    assert.deepStrictEqual(tokens, { colors: {}, fonts: {}, spacing: {} });
  });

  it('중복 색상을 제거한다', () => {
    const figmaData = {
      nodes: {
        'node-1': { fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }] },
        'node-2': { fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }] }
      }
    };
    const tokens = extractTokens(figmaData);
    const colorValues = Object.values(tokens.colors);
    const unique = [...new Set(colorValues)];
    assert.strictEqual(colorValues.length, unique.length);
  });
});
