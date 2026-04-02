const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseTailwindClass, parseJsx } = require('../parse-jsx.js');

describe('parseTailwindClass', () => {
  it('w-[Npx] → width', () => {
    assert.deepStrictEqual(parseTailwindClass('w-[1052px]'), { width: '1052px' });
  });

  it('h-[Npx] → height', () => {
    assert.deepStrictEqual(parseTailwindClass('h-[200px]'), { height: '200px' });
  });

  it('text-[Npx] → font-size', () => {
    assert.deepStrictEqual(parseTailwindClass('text-[20px]'), { 'font-size': '20px' });
  });

  it('text-[#hex] → color', () => {
    assert.deepStrictEqual(parseTailwindClass('text-[#2b2b2b]'), { color: '#2b2b2b' });
  });

  it('bg-[#hex] → background-color', () => {
    assert.deepStrictEqual(parseTailwindClass('bg-[#f9bb34]'), { 'background-color': '#f9bb34' });
  });

  it('absolute → position', () => {
    assert.deepStrictEqual(parseTailwindClass('absolute'), { position: 'absolute' });
  });

  it('relative → position', () => {
    assert.deepStrictEqual(parseTailwindClass('relative'), { position: 'relative' });
  });

  it('fixed → position', () => {
    assert.deepStrictEqual(parseTailwindClass('fixed'), { position: 'fixed' });
  });

  it('sticky → position', () => {
    assert.deepStrictEqual(parseTailwindClass('sticky'), { position: 'sticky' });
  });

  it('flex → display', () => {
    assert.deepStrictEqual(parseTailwindClass('flex'), { display: 'flex' });
  });

  it('inline-flex → display', () => {
    assert.deepStrictEqual(parseTailwindClass('inline-flex'), { display: 'inline-flex' });
  });

  it('grid → display', () => {
    assert.deepStrictEqual(parseTailwindClass('grid'), { display: 'grid' });
  });

  it('gap-[Npx] → gap', () => {
    assert.deepStrictEqual(parseTailwindClass('gap-[20px]'), { gap: '20px' });
  });

  it('text-center → text-align', () => {
    assert.deepStrictEqual(parseTailwindClass('text-center'), { 'text-align': 'center' });
  });

  it('text-left → text-align', () => {
    assert.deepStrictEqual(parseTailwindClass('text-left'), { 'text-align': 'left' });
  });

  it('text-right → text-align', () => {
    assert.deepStrictEqual(parseTailwindClass('text-right'), { 'text-align': 'right' });
  });

  it('overflow-hidden → overflow', () => {
    assert.deepStrictEqual(parseTailwindClass('overflow-hidden'), { overflow: 'hidden' });
  });

  it('overflow-auto → overflow', () => {
    assert.deepStrictEqual(parseTailwindClass('overflow-auto'), { overflow: 'auto' });
  });

  it('rounded-[Npx] → border-radius', () => {
    assert.deepStrictEqual(parseTailwindClass('rounded-[10px]'), { 'border-radius': '10px' });
  });

  it('rounded-full → border-radius 9999px', () => {
    assert.deepStrictEqual(parseTailwindClass('rounded-full'), { 'border-radius': '9999px' });
  });

  it('leading-[Npx] → line-height', () => {
    assert.deepStrictEqual(parseTailwindClass('leading-[30px]'), { 'line-height': '30px' });
  });

  it('left-[Npx] → left', () => {
    assert.deepStrictEqual(parseTailwindClass('left-[432px]'), { left: '432px' });
  });

  it('top-[Npx] → top', () => {
    assert.deepStrictEqual(parseTailwindClass('top-[80px]'), { top: '80px' });
  });

  it('right-[Npx] → right', () => {
    assert.deepStrictEqual(parseTailwindClass('right-[20px]'), { right: '20px' });
  });

  it('bottom-[Npx] → bottom', () => {
    assert.deepStrictEqual(parseTailwindClass('bottom-[10px]'), { bottom: '10px' });
  });

  it("font-['Bold'] → font-family + font-weight 700", () => {
    assert.deepStrictEqual(parseTailwindClass("font-['YouandiNewKr:Bold']"), {
      'font-family': "'YouandiNewKr:Bold'",
      'font-weight': '700',
    });
  });

  it("font-['Regular'] → font-family + font-weight 400", () => {
    assert.deepStrictEqual(parseTailwindClass("font-['Pretendard:Regular']"), {
      'font-family': "'Pretendard:Regular'",
      'font-weight': '400',
    });
  });

  it('percent-based width', () => {
    assert.deepStrictEqual(parseTailwindClass('w-[652.38%]'), { width: '652.38%' });
  });

  it('negative left percent', () => {
    assert.deepStrictEqual(parseTailwindClass('left-[-493.07%]'), { left: '-493.07%' });
  });

  it('flex-col → flex-direction', () => {
    assert.deepStrictEqual(parseTailwindClass('flex-col'), { 'flex-direction': 'column' });
  });

  it('flex-row → flex-direction', () => {
    assert.deepStrictEqual(parseTailwindClass('flex-row'), { 'flex-direction': 'row' });
  });

  it('items-center → align-items', () => {
    assert.deepStrictEqual(parseTailwindClass('items-center'), { 'align-items': 'center' });
  });

  it('items-start → align-items', () => {
    assert.deepStrictEqual(parseTailwindClass('items-start'), { 'align-items': 'flex-start' });
  });

  it('items-end → align-items', () => {
    assert.deepStrictEqual(parseTailwindClass('items-end'), { 'align-items': 'flex-end' });
  });

  it('justify-center → justify-content', () => {
    assert.deepStrictEqual(parseTailwindClass('justify-center'), { 'justify-content': 'center' });
  });

  it('justify-between → justify-content', () => {
    assert.deepStrictEqual(parseTailwindClass('justify-between'), { 'justify-content': 'space-between' });
  });

  it('p-[Npx] → padding', () => {
    assert.deepStrictEqual(parseTailwindClass('p-[16px]'), { padding: '16px' });
  });

  it('px-[Npx] → padding left+right', () => {
    assert.deepStrictEqual(parseTailwindClass('px-[16px]'), {
      'padding-left': '16px',
      'padding-right': '16px',
    });
  });

  it('py-[Npx] → padding top+bottom', () => {
    assert.deepStrictEqual(parseTailwindClass('py-[8px]'), {
      'padding-top': '8px',
      'padding-bottom': '8px',
    });
  });

  it('pt-[Npx] → padding-top', () => {
    assert.deepStrictEqual(parseTailwindClass('pt-[8px]'), { 'padding-top': '8px' });
  });

  it('pb-[Npx] → padding-bottom', () => {
    assert.deepStrictEqual(parseTailwindClass('pb-[8px]'), { 'padding-bottom': '8px' });
  });

  it('pl-[Npx] → padding-left', () => {
    assert.deepStrictEqual(parseTailwindClass('pl-[8px]'), { 'padding-left': '8px' });
  });

  it('pr-[Npx] → padding-right', () => {
    assert.deepStrictEqual(parseTailwindClass('pr-[8px]'), { 'padding-right': '8px' });
  });

  it('m-[Npx] → margin', () => {
    assert.deepStrictEqual(parseTailwindClass('m-[16px]'), { margin: '16px' });
  });

  it('mx-auto → margin auto', () => {
    assert.deepStrictEqual(parseTailwindClass('mx-auto'), {
      'margin-left': 'auto',
      'margin-right': 'auto',
    });
  });

  it('opacity-[N] → opacity', () => {
    assert.deepStrictEqual(parseTailwindClass('opacity-[50]'), { opacity: '50' });
  });

  it('min-w-[Npx] → min-width', () => {
    assert.deepStrictEqual(parseTailwindClass('min-w-[100px]'), { 'min-width': '100px' });
  });

  it('min-h-[Npx] → min-height', () => {
    assert.deepStrictEqual(parseTailwindClass('min-h-[50px]'), { 'min-height': '50px' });
  });

  it('max-w-[Npx] → max-width', () => {
    assert.deepStrictEqual(parseTailwindClass('max-w-[500px]'), { 'max-width': '500px' });
  });

  it('unknown-class → {}', () => {
    assert.deepStrictEqual(parseTailwindClass('unknown-class'), {});
  });
});

describe('parseJsx', () => {
  const simpleJsx = `
    function Page() {
      return (
        <div className="relative w-[1052px] h-[800px] bg-[#ffffff]">
          <span className="text-[20px] text-[#2b2b2b]">Hello</span>
        </div>
      );
    }
  `;

  it('유효한 JSX를 파싱하면 ok:true를 반환한다', () => {
    const result = parseJsx(simpleJsx);
    assert.equal(result.ok, true);
  });

  it('파싱 결과에 ast, images, tokens, meta가 있다', () => {
    const result = parseJsx(simpleJsx);
    assert.ok(result.data.ast);
    assert.ok(Array.isArray(result.data.images));
    assert.ok(result.data.tokens);
    assert.ok(result.data.meta);
  });

  it('AST 루트 노드의 tag가 div이다', () => {
    const result = parseJsx(simpleJsx);
    assert.equal(result.data.ast.tag, 'div');
  });

  it('AST 루트에 className이 있다', () => {
    const result = parseJsx(simpleJsx);
    assert.ok(result.data.ast.className.includes('w-[1052px]'));
  });

  it('자식 노드를 추출한다', () => {
    const result = parseJsx(simpleJsx);
    assert.equal(result.data.ast.children.length, 1);
    assert.equal(result.data.ast.children[0].tag, 'span');
  });

  it('텍스트 노드를 추출한다', () => {
    const result = parseJsx(simpleJsx);
    assert.equal(result.data.ast.children[0].text, 'Hello');
  });

  it('colors 토큰을 추출한다', () => {
    const result = parseJsx(simpleJsx);
    assert.ok(result.data.tokens.colors.includes('#ffffff'));
    assert.ok(result.data.tokens.colors.includes('#2b2b2b'));
  });

  it('meta에 width와 height가 있다', () => {
    const result = parseJsx(simpleJsx);
    assert.equal(result.data.meta.width, '1052px');
    assert.equal(result.data.meta.height, '800px');
  });

  it('이미지 URL을 추출한다', () => {
    const jsxWithImg = `
      function Page() {
        return (
          <div className="relative w-[500px] h-[300px]">
            <img src="https://example.com/image.png" className="w-[100px] h-[100px]" />
          </div>
        );
      }
    `;
    const result = parseJsx(jsxWithImg);
    assert.equal(result.data.images.length, 1);
    assert.equal(result.data.images[0].src, 'https://example.com/image.png');
  });

  it('여러 이미지를 모두 추출한다 (zero image loss)', () => {
    const jsxWithMultipleImgs = `
      function Page() {
        return (
          <div className="relative w-[500px] h-[300px]">
            <img src="https://example.com/img1.png" className="absolute" />
            <img src="https://example.com/img2.jpg" className="absolute" />
            <img src="https://example.com/img3.png" className="absolute" />
          </div>
        );
      }
    `;
    const result = parseJsx(jsxWithMultipleImgs);
    assert.equal(result.data.images.length, 3);
  });

  it('크롭 패턴이 있는 이미지를 감지한다', () => {
    const jsxWithCrop = `
      function Page() {
        return (
          <div className="relative w-[500px] h-[300px] overflow-hidden">
            <img src="https://example.com/img.png" className="absolute w-[652.38%] h-[123.45%] left-[-493.07%] top-[-10%]" />
          </div>
        );
      }
    `;
    const result = parseJsx(jsxWithCrop);
    assert.equal(result.data.images.length, 1);
    assert.equal(result.data.images[0].isCrop, true);
  });

  it('폰트를 추출한다', () => {
    const jsxWithFont = `
      function Page() {
        return (
          <div className="relative w-[500px] h-[300px]">
            <span className="font-['Pretendard:Regular'] text-[16px]">Text</span>
          </div>
        );
      }
    `;
    const result = parseJsx(jsxWithFont);
    assert.ok(result.data.tokens.fonts.length > 0);
    assert.ok(result.data.tokens.fonts.some(f => f.includes('Pretendard')));
  });

  it('meta.nodeCount가 올바르다', () => {
    const result = parseJsx(simpleJsx);
    assert.equal(result.data.meta.nodeCount, 2); // div + span
  });

  it('meta.imageCount가 올바르다', () => {
    const jsxWithImg = `
      function Page() {
        return (
          <div className="relative w-[500px] h-[300px]">
            <img src="https://example.com/a.png" />
            <img src="https://example.com/b.png" />
          </div>
        );
      }
    `;
    const result = parseJsx(jsxWithImg);
    assert.equal(result.data.meta.imageCount, 2);
  });

  it('유효하지 않은 JSX는 ok:false를 반환한다', () => {
    const result = parseJsx('this is not jsx }{{{');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'PARSE_ERROR');
  });

  it('fontWeights 토큰을 추출한다', () => {
    const jsxWithFonts = `
      function Page() {
        return (
          <div className="relative w-[500px] h-[300px]">
            <span className="font-['Pretendard:Bold']">Bold</span>
            <span className="font-['Pretendard:Regular']">Regular</span>
          </div>
        );
      }
    `;
    const result = parseJsx(jsxWithFonts);
    assert.ok(result.data.tokens.fontWeights.includes('700'));
    assert.ok(result.data.tokens.fontWeights.includes('400'));
  });

  it('중첩된 구조에서 모든 이미지를 추출한다', () => {
    const jsxNested = `
      function Page() {
        return (
          <div className="relative w-[1052px] h-[800px]">
            <div className="absolute">
              <div className="relative overflow-hidden">
                <img src="https://cdn.example.com/deep.png" className="absolute w-[200%] left-[-50%]" />
              </div>
            </div>
          </div>
        );
      }
    `;
    const result = parseJsx(jsxNested);
    assert.equal(result.data.images.length, 1);
    assert.equal(result.data.images[0].src, 'https://cdn.example.com/deep.png');
  });
});
