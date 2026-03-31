---
name: figma-to-code
description: Figma URL을 넣으면 배포 가능한 HTML/CSS/JS를 생성하고 브라우저에서 실시간 수정할 수 있습니다. "figma", "피그마", "디자인을 코드로", "HTML로 만들어줘", "figma.com" URL이 포함된 요청에 사용됩니다.
---

# Figma-to-Code

Figma 디자인 URL을 받아 배포 가능한 Vanilla HTML/CSS/JS 단일 페이지를 생성한다.
생성 후 브라우저 live-preview에서 요소를 선택해 스타일/텍스트를 실시간으로 수정할 수 있다.

## 트리거

다음과 같은 요청에 이 스킬이 활성화된다:
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
> "전체 파일 URL이네요. Figma에서 변환할 프레임을 선택하고 우클릭 → 'Copy link to selection'으로 특정 프레임 URL을 알려주세요."

### Step 2: Figma MCP로 디자인 데이터 수집

Figma MCP 도구를 호출한다:

1. **`get_design_context`**(fileKey, nodeId): 디자인 데이터, 코드 힌트, 스크린샷
2. **`get_metadata`**(fileKey, nodeId): 프레임 이름, 크기, 구조

### Step 3: Frame Analyzer — mobile/desktop 판단

get_metadata 결과로 프레임 유형을 판단한다. 단순 width가 아닌 복합 판단:

1. **프레임 이름** — "Mobile", "Desktop", "375", "1440" 등 키워드 → 확정
2. **크기 비율** — width < height → 모바일 가능성 높음
3. **width 구간** — 보조 지표 (<=480 모바일, >=1024 데스크탑)
4. **레이아웃 구조** — 단일 컬럼 → 모바일, 다중 컬럼 → 데스크탑
5. **형제 프레임** — 동일 섹션에 375px + 1440px이 나란히 있으면 반응형 세트
6. **확신 못하면** → 사용자에게 "이 프레임은 모바일인가요, 데스크탑인가요?" 질문

결과에 따른 분기:
- **데스크탑만** → "모바일 반응형도 추가할까요?" 질문. Yes면 모바일 URL 요청
- **모바일만** → 모바일 전용 코드 생성
- **둘 다 제공** → Step 3-1 Responsive Mapper 실행

#### Step 3-1: Responsive Mapper (둘 다 제공된 경우)

두 프레임의 디자인 데이터를 **코드 생성 전에** 매핑한다:
- 노드 매칭: 이름, 구조, 텍스트 내용 기반으로 같은 요소 판단
- 차이점 추출: layout, font-size, spacing, 표시/숨김 차이 기록
- 구조 차이 감지: 3열→1열, 데스크탑에만 있는 요소, 순서 변경
- 통합 스펙 생성: 하나의 HTML 구조 + desktop CSS 기본 + `@media` mobile 오버라이드

### Step 4: 코드 생성

다음 규칙을 반드시 따른다:

**HTML:**
- 시맨틱 HTML5 태그: `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<footer>`
- BEM 스타일 클래스명: `.hero`, `.hero__title`, `.hero__cta`
- 접근성: alt 텍스트, heading 계층 (h1 > h2 > h3)
- `styles.css`와 `script.js`를 외부 파일로 링크

**CSS:**
- `:root`에 디자인 토큰을 CSS 변수로 정의 (색상, 폰트, 간격)
- 색상/폰트 하드코딩 금지 — 반드시 CSS 변수 참조
- Flexbox 또는 CSS Grid로 레이아웃
- 반응형이면 desktop-first + `max-width` 미디어 쿼리

**JS:**
- 인터랙션이 필요할 때만 생성. Vanilla JS만 사용.

**이미지:**
- Figma에서 이미지 URL 수집 → `output/assets-manifest.json`에 목록 작성
- HTML에서 `<img src="assets/파일명.확장자">`로 참조

**출력 파일:**
- `output/index.html`
- `output/styles.css`
- `output/script.js` (필요 시에만)
- `output/assets-manifest.json` — 이미지 URL 목록 JSON 배열:
  ```json
  [{ "url": "https://figma-image-url/...", "filename": "hero.png" }]
  ```
- `output/.figma-data.json` — `get_design_context` 응답 원본 저장 (Write 도구로)

### Step 5: 후처리 파이프라인 실행

코드 생성이 완료되면 다음 명령을 실행한다:

```bash
node tools/pipeline.js output/
```

이 명령이 자동으로 수행하는 작업:
1. 디자인 토큰 추출 및 검증
2. 이미지 에셋 다운로드 (`assets-manifest.json` → `output/assets/`)
3. HTML 요소에 `data-element-id` 자동 삽입
4. Live-preview 서버 기동 (`http://localhost:3100`)

### Step 6: 결과 안내

```
생성 완료!

output/index.html — 메인 HTML
output/styles.css — 스타일시트
output/assets/    — 이미지 에셋

Live Preview가 http://localhost:3100 에서 실행 중입니다.
브라우저에서 요소를 클릭하면 스타일과 텍스트를 직접 수정할 수 있습니다.

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
4. live-preview 서버가 자동으로 브라우저에 반영한다

## 주의사항

- Figma Pro/Org Dev seat 이상 권장 (Starter/View/Collab은 월 6회 API 제한)
- 단일 페이지(랜딩, 프로모션)에 최적화. 복잡한 SPA/멀티페이지에는 부적합
- live-preview 수정은 스타일/텍스트만 지원 (Phase 1)
