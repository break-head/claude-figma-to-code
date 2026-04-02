---
name: figma-to-code
description: Figma URL을 넣으면 배포 가능한 HTML/CSS/JS를 생성합니다. "figma", "피그마", "디자인을 코드로", "HTML로 만들어줘", "figma.com" URL이 포함된 요청에 사용됩니다.
---

# Figma-to-Code v2

Figma 디자인 URL을 받아 배포 가능한 Vanilla HTML/CSS/JS 단일 페이지를 생성한다.
MCP 코드를 베이스로 섹션별 변환하고, 시각적 보정 루프로 Figma 원본에 가까운 결과를 보장한다.

## 트리거

다음과 같은 요청에 이 스킬이 활성화된다:
- "이 Figma 디자인을 HTML로 만들어줘"
- "figma.com/design/... 이걸 코드로 변환해줘"
- 메시지에 figma.com URL이 포함된 경우

## 실행 단계

### Step 1: Figma URL 파싱

사용자 메시지에서 Figma URL을 추출하고 파싱한다:
- `figma.com/design/:fileKey/:fileName?node-id=:nodeId` → nodeId의 `-`를 `:`로 변환
- `figma.com/file/:fileKey/:fileName?node-id=:nodeId` → 동일
- `figma.com/design/:fileKey/branch/:branchKey/:fileName` → branchKey를 fileKey로 사용

node-id가 없으면 사용자에게 특정 프레임 URL을 요청한다:
> "전체 파일 URL이네요. Figma에서 변환할 프레임을 선택하고 우클릭 → 'Copy link to selection'으로 특정 프레임 URL을 알려주세요."

### Step 2: Figma MCP로 디자인 데이터 수집

1. **`get_design_context`**(fileKey, nodeId) 호출 → React+Tailwind 코드 + 스크린샷 반환
2. 반환된 코드를 `output/.mcp-source.jsx`에 Write 도구로 저장
3. MCP 응답 원본 데이터를 `output/.figma-data.json`에 저장
4. 반환된 스크린샷은 대화 컨텍스트에 유지 (보정 루프 레퍼런스)

### Step 3: 섹션 식별

MCP 코드를 읽고 최상위 컴포넌트/섹션을 구분한다:
- 최상위 JSX의 직접 자식 요소들을 섹션으로 식별
- 각 섹션에 이름 부여 (hero, features, cta, footer 등)
- 섹션 목록을 사용자에게 보여주고 확인
  > "4개 섹션으로 나눕니다: Hero, Features, CTA, Footer — 맞나요?"

### Step 4: 섹션별 변환

각 섹션마다 MCP의 React+Tailwind 코드를 바닐라 HTML + CSS로 변환한다.

**변환 규칙:**

HTML:
- 시맨틱 HTML5 태그: `<header>`, `<nav>`, `<main>`, `<section>`, `<footer>`
- BEM 스타일 클래스명: `.hero`, `.hero__title`, `.hero__cta`
- 이미지는 `assets/` 상대경로: `<img src="assets/hero.png">`

CSS:
- `:root`에 디자인 토큰을 CSS 변수로 정의 (색상, 폰트, 간격)
- 색상/폰트 하드코딩 금지 — 반드시 CSS 변수 참조
- Flexbox 또는 CSS Grid로 레이아웃
- **절대 좌표 → 정렬 의도 추론 (중요):**
  MCP 코드는 모든 요소를 `absolute` + `left/top` 픽셀 좌표로 배치한다. 바닐라 HTML로 변환할 때 이 좌표를 그대로 쓰지 말고, **레이아웃 의도를 추론하여 semantic한 CSS 정렬로 변환한다.**

  **추론 방법:**
  1. 부모 컨테이너 폭(보통 1052px = 1440px - padding 186px*2)을 기준으로 자식 요소의 `left` 값을 확인
  2. 자식이 부모의 양쪽 여백과 대칭이면 → `justify-content: center` 또는 `margin: 0 auto`
  3. 자식이 부모 좌측에 붙어있으면 → 기본 좌측 정렬
  4. `text-center` 클래스가 있으면 → `text-align: center`
  5. `-translate-x-1/2 left-[calc(50%...)]` 패턴 → 명확한 중앙 정렬

  **예시:**
  ```
  부모 w-[1052px], 자식 left-[432px] w-[224px] + 형제 left-[708px]
  → 자식 블록이 432~1072px 범위 = 부모 내 대칭 → 중앙 정렬
  ```

  절대 좌표를 보고 무조건 좌측 정렬로 변환하지 않는다.
- **font-weight 보존 (중요):**
  Figma MCP 코드에서 Bold/Regular를 별도 font-family로 구분하는 경우가 많다 (예: `font-['YouandiNewKr_Title:Bold']` vs `font-['YouandiNewKr_Title:Regular']`).
  CSS 변수로 변환할 때 `font-family`만 바꾸면 커스텀 폰트가 없는 환경에서 fallback 폰트의 weight 구분이 안 된다.
  **반드시 `font-weight`도 함께 지정한다:**
  ```css
  /* Bold 계열 */
  font-family: var(--font-bold);
  font-weight: 700;

  /* Regular 계열 */
  font-family: var(--font-regular);
  font-weight: 400;
  ```

JS:
- 인터랙션이 필요할 때만 생성. Vanilla JS만 사용.

이미지:
- Figma에서 이미지 URL 수집 → `output/assets-manifest.json`에 목록 작성:
  ```json
  [{ "url": "https://figma-image-url/...", "filename": "hero.png" }]
  ```
- **이미지 크롭/마스크 보존 (중요):**
  MCP 코드에서 이미지가 컨테이너 안에서 크롭되는 패턴을 반드시 확인하고 바닐라 CSS로 변환한다.
  Figma는 하나의 큰 이미지에서 특정 부분만 보여주기 위해 `overflow: hidden` 컨테이너 + 이미지에 퍼센트 기반 `width/height/left/top` 값을 사용한다.

  **감지 패턴 (Tailwind):**
  ```jsx
  <div className="h-[365px] w-[243px]">        ← 컨테이너 (overflow:hidden)
    <div className="overflow-hidden">
      <img className="absolute h-[276.42%] left-[-493.07%] w-[652.38%] top-[-39.22%]" />
    </div>
  </div>
  ```

  **변환 결과 (Vanilla CSS):**
  ```css
  .person-crop {
    width: 243px;
    height: 365px;
    overflow: hidden;
    position: relative;
  }
  .person-crop img {
    position: absolute;
    max-width: none;
    width: 652.38%;
    height: 276.42%;
    left: -493.07%;
    top: -39.22%;
  }
  ```

  이 패턴은 스프라이트 시트에서 특정 캐릭터를 크롭하거나, 큰 사진에서 특정 영역만 보여줄 때 사용된다. `object-fit: cover`로 대체하면 안 된다 — 원본 좌표를 그대로 옮겨야 한다.

  마찬가지로 `mask-image`, `mask-size`, `mask-position` 등 마스크 속성도 MCP 코드에서 그대로 가져온다.

**저장:**
- `output/sections/01-hero.html` + `output/sections/01-hero.css`
- `output/sections/02-features.html` + `output/sections/02-features.css`
- 번호 순서 = 페이지 내 배치 순서
- Write 도구로 각 파일을 즉시 저장

### Step 5: 후처리 파이프라인

```bash
node tools/postprocess.js output/
```

자동 수행:
1. 섹션 HTML/CSS를 index.html + styles.css로 합침
2. Figma 데이터에서 디자인 토큰 추출 + 검증
3. CSS 정규화 (하드코딩 색상→변수 교체, 네이밍 통일)
4. 이미지 다운로드 (assets-manifest.json → output/assets/)
5. HTML 요소에 data-element-id 삽입

### Step 6: 시각적 보정 루프

1. 프리뷰 서버 기동:
```bash
node tools/preview-server.js output/
```

2. 스크린샷 캡처 (Figma 프레임과 동일한 width 사용):
```bash
node tools/capture.js http://localhost:3100 output/.preview-screenshot.png <width>
```

3. Read 도구로 `output/.preview-screenshot.png` 읽기
4. Figma MCP 스크린샷 (Step 2에서 대화 컨텍스트에 유지 중)과 비교
5. 차이점을 구체적으로 식별:
   - 색상 일치 여부
   - 타이포그래피 (크기, 굵기, 행간)
   - 간격 (padding, margin, gap)
   - 레이아웃 구조 (요소 배치, 정렬)
   - 이미지 위치/크기
6. 차이가 있으면 해당 섹션 파일 수정 → `node tools/postprocess.js output/` 재실행 → 재캡처 → 재비교
7. **최대 2회 반복**. 2회 후에도 차이가 있으면 남은 차이점을 사용자에게 리포트

### Step 7: 결과 안내

```
변환 완료!

output/index.html — 메인 HTML
output/styles.css — 스타일시트
output/assets/    — 이미지 에셋

프리뷰: http://localhost:3100

수정하려면 이 대화에서 바로 요청하세요:
  "히어로 섹션 배경색을 파란색으로 바꿔줘"
  "버튼 텍스트를 '무료 시작'으로 변경해줘"
```

## 수정 워크플로우

사용자가 수정을 요청하면:
1. `output/` 폴더의 해당 파일을 Read로 읽는다
2. 정확한 위치를 찾아 Edit으로 수정한다
3. CSS 변수 체계를 유지한다 (색상 변경 시 `:root` 변수를 수정)
4. preview-server가 자동으로 브라우저에 반영한다

## 주의사항

- Figma Pro/Org Dev seat 이상 권장 (Starter/View/Collab은 월 6회 API 제한)
- 프로모션/이벤트 단일 페이지에 최적화. 복잡한 SPA/멀티페이지에는 부적합
- 반응형은 미지원 (Phase 1). 단일 프레임만 변환
- 커스텀 폰트는 Google Fonts 매핑 또는 시스템 폰트 대체
- 시각적 보정 루프는 최대 2회. 완벽하지 않을 수 있음
