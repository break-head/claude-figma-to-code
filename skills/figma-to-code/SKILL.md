---
name: figma-to-code
description: Figma URL을 넣으면 배포 가능한 HTML/CSS/JS를 생성합니다. "figma", "피그마", "디자인을 코드로", "HTML로 만들어줘" 등의 요청에 사용됩니다.
aliases: [figma, 피그마]
---

# Figma-to-Code

Figma 디자인 URL을 받아 배포 가능한 Vanilla HTML/CSS/JS를 생성합니다.

## 트리거

다음과 같은 요청에 이 스킬이 활성화됩니다:
- "이 Figma 디자인을 HTML로 만들어줘"
- "figma.com/design/... 이걸 코드로 변환해줘"
- "/figma-to-code <URL>"
- 메시지에 figma.com URL이 포함된 경우

## 실행 단계

### Step 1: Figma URL 파싱

사용자 메시지에서 Figma URL을 추출하고 파싱한다:
- `figma.com/design/:fileKey/:fileName?node-id=:nodeId` → nodeId의 `-`를 `:`로 변환
- `figma.com/file/:fileKey/:fileName?node-id=:nodeId` → 동일
- `figma.com/design/:fileKey/branch/:branchKey/:fileName` → branchKey를 fileKey로 사용

node-id가 없으면 사용자에게 특정 프레임 URL을 요청한다:
> "전체 파일 URL이네요. Figma에서 변환할 프레임을 선택하고 우클릭 → 'Copy link to selection'으로 특정 프레임 URL을 알려주세요. 그래야 더 정확한 결과를 얻을 수 있습니다."

### Step 2: Figma MCP로 디자인 분석

Figma MCP 도구를 순서대로 호출한다:

1. **`get_design_context`**(fileKey, nodeId): 디자인 데이터, 코드 힌트, 스크린샷을 가져온다. 이것이 핵심 데이터.
2. **`get_metadata`**(fileKey, nodeId): 프레임 크기와 구조를 확인한다.
3. **`get_screenshot`**(fileKey, nodeId): 시각적 참조용 스크린샷. get_design_context에 포함되지 않은 경우에만.

### Step 3: 반응형 전략 결정

get_metadata에서 프레임 크기를 확인:
- **Desktop 프레임만** (width >= 1024px): 사용자에게 질문한다 → "데스크톱 전용으로 만들까요, 모바일 반응형도 추가할까요?"
- **Desktop + Mobile 프레임**: 자동으로 반응형 코드 생성 (`@media` 쿼리 포함)
- **Mobile 프레임만** (width < 768px): 모바일 전용 코드 생성

### Step 4: 출력 폴더 결정

현재 작업 디렉토리에 `output/` 폴더를 생성한다:
```
output/
├── index.html
├── styles.css
├── script.js     (인터랙션 필요 시에만)
└── assets/       (이미지, 아이콘)
```

### Step 5: HTML 생성

다음 규칙을 **반드시** 따른다:

**HTML 규칙:**
- 시맨틱 HTML5 태그 사용: `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<footer>`
- div 남용 금지. 모든 `<div>`는 명확한 구조적 목적이 있어야 한다
- BEM 스타일 클래스명: `.hero`, `.hero__title`, `.hero__cta`, `.card`, `.card__image`
- 버튼 모양이면 `<button>`, 링크면 `<a>`, 리스트면 `<ul>`/`<ol>` 사용
- 접근성: alt 텍스트, 올바른 heading 계층 (h1 > h2 > h3)
- `styles.css`와 `script.js`를 외부 파일로 링크

**CSS 규칙:**
- `:root`에 디자인 토큰을 CSS 변수로 정의:
  ```css
  :root {
    --color-primary: #...;
    --color-secondary: #...;
    --color-background: #...;
    --color-text: #...;
    --font-heading: '...', sans-serif;
    --font-body: '...', sans-serif;
    --space-xs: 4px;
    --space-sm: 8px;
    --space-md: 16px;
    --space-lg: 32px;
    --space-xl: 64px;
  }
  ```
- 색상/폰트 하드코딩 금지. 반드시 CSS 변수 참조
- Flexbox 또는 CSS Grid로 레이아웃 (Figma auto-layout 매칭)
- 절대 좌표 대신 Flex/Grid로 가능하면 Flex/Grid 사용
- 불필요한 wrapper div 제거 (배경/보더 없고 자식 1개면 제거)
- 반응형이면 mobile-first 접근 (`min-width` 미디어 쿼리)

**JS 규칙:**
- 인터랙션이 필요할 때만 생성 (모달, 탭, 아코디언, 캐러셀 등)
- Vanilla JS만. 프레임워크 절대 사용 금지
- 이벤트 위임 활용

**이미지 규칙:**
- Figma에서 이미지를 추출하여 `output/assets/`에 저장
- HTML에서 상대 경로로 참조: `<img src="assets/hero.png">`
- SVG 아이콘은 `fill="currentColor"`로 색상 상속

### Step 6: 결과 안내

생성 완료 후 사용자에게 안내:

```
생성 완료!

📁 output/index.html
📁 output/styles.css
📁 output/assets/

미리보기:
  npx live-server output/

수정하려면 이 대화에서 바로 요청하세요:
  "히어로 섹션 배경색을 파란색으로 바꿔줘"
  "버튼 텍스트를 '무료 시작'으로 변경해줘"
  "카드 레이아웃을 3열에서 2열로 바꿔줘"
```

## 수정 워크플로우

사용자가 수정을 요청하면:
1. `output/` 폴더의 해당 파일을 Read로 읽는다
2. 정확한 위치를 찾아 Edit으로 수정한다
3. CSS 변수 체계를 유지한다 (색상 변경 시 `:root` 변수를 수정)
4. 구조를 깨뜨리지 않는다

## 내보내기

사용자가 "내보내기", "ZIP", "배포"를 요청하면:
1. `output/` 폴더를 ZIP으로 압축
2. 개발 전용 코드가 있다면 제거
3. 깨끗한 배포용 파일만 포함

## 주의사항

- 이 스킬은 **프로모션 랜딩페이지, 원페이지** 등 단순한 정적 페이지에 최적화되어 있다
- 복잡한 SPA나 멀티페이지 앱 생성에는 적합하지 않다
- Figma MCP 도구가 사용 가능해야 한다 (Claude Code에 Figma MCP가 연결되어 있어야 함)
