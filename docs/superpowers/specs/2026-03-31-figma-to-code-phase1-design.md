# Figma-to-Code Phase 1 Design Spec

## 개요

Figma URL을 입력하면 배포 가능한 바닐라 HTML/CSS/JS 단일 페이지를 생성하고, 브라우저 기반 live-preview에서 요소를 선택해 실시간으로 스타일/텍스트를 수정할 수 있는 Claude Code 플러그인.

## Phase 범위

| Phase | 범위 | 상태 |
|---|---|---|
| **Phase 1 (이 문서)** | Figma → 코드 생성 + live-preview + 스타일/텍스트 수정 | 현재 |
| Phase 2 | 레이아웃 수정 (Flex 방향, 열 수, 순서) + 이미지 교체 | 예정 |
| Phase 3 | 요소 추가/삭제/복제 + 드래그 재배치 | 예정 |

## 아키텍처

### 전체 파이프라인

```
Figma URL(s)
  |
  v
[Figma MCP] get_design_context + get_metadata
  |
  v
[frame-analyzer] mobile/desktop 판단
  |
  +-- 1개만 --> 그대로 진행
  +-- 2개   --> [responsive-mapper] 노드 매칭 + 차이 추출 --> 통합 스펙
  |
  v
[Claude] 디자인 분석 + HTML/CSS/JS 코드 생성
  |
  v
[node tools/pipeline.js output/] 후처리 자동화
  |-- token-extractor.js   : Figma 데이터 --> CSS 변수 JSON
  |-- download-assets.js   : 이미지 URL --> assets/ 저장
  |-- inject-ids.js        : HTML에 data-element-id 삽입
  |-- live-server 기동     : 파일 서빙 + WebSocket + 수정 API
  |
  v
브라우저에서 live-preview + 실시간 수정
```

### Claude 실행 흐름 (3단계)

1. **Figma MCP 호출** — `get_design_context`(fileKey, nodeId) + `get_metadata`(fileKey, nodeId)
2. **디자인 분석 + 코드 작성** — frame-analyzer 판단, 반응형 처리, HTML/CSS/JS 생성
3. **후처리** — `node tools/pipeline.js output/` 한 번 실행으로 나머지 자동 처리

## 상세 설계

### 1. Figma URL 파싱

사용자 메시지에서 Figma URL을 추출:

- `figma.com/design/:fileKey/:fileName?node-id=:nodeId` — nodeId의 `-`를 `:`로 변환
- `figma.com/file/:fileKey/:fileName?node-id=:nodeId` — 동일
- `figma.com/design/:fileKey/branch/:branchKey/:fileName` — branchKey를 fileKey로 사용

node-id가 없으면 사용자에게 특정 프레임 URL 요청:
> "전체 파일 URL이네요. Figma에서 변환할 프레임을 선택하고 우클릭 → 'Copy link to selection'으로 특정 프레임 URL을 알려주세요."

### 2. Frame Analyzer (mobile/desktop 판단)

단순 width 기반이 아닌 복합 판단:

| 우선순위 | 신호 | 방법 |
|---|---|---|
| 1 | 프레임 이름 | "Mobile", "Desktop", "375", "1440" 등 키워드 감지 |
| 2 | 프레임 크기 비율 | width < height → 모바일 가능성 높음 (세로형) |
| 3 | width 구간 | 보조 지표 (<=480 모바일, >=1024 데스크탑, 사이는 불확실) |
| 4 | 레이아웃 구조 | 단일 컬럼 auto-layout → 모바일, 다중 컬럼 → 데스크탑 |
| 5 | 형제 프레임 탐색 | 동일 섹션에 375px + 1440px 프레임이 나란히 있으면 반응형 세트 |

판단 플로우:

```
1. get_metadata로 프레임 이름 + 크기 가져옴
2. 이름에 mobile/desktop 키워드 → 확정
3. 없으면 width:height 비율 + width 구간으로 추정
4. 형제 프레임 중 반응형 짝이 있는지 탐색
5. 확신 못하면 → 사용자에게 질문
```

결과에 따른 분기:

- **데스크탑만** → "모바일 반응형도 추가할까요?" 질문. Yes면 모바일 URL 요청 또는 자동 반응형 생성
- **모바일만** → 모바일 전용 코드 생성
- **둘 다 제공** → responsive-mapper로 데이터 단계에서 통합

### 3. Responsive Mapper

데스크탑 + 모바일 두 프레임이 제공된 경우, **코드 생성 전에** 데이터 단계에서 매핑:

| 단계 | 내용 |
|---|---|
| 노드 매칭 | Desktop "Hero Section"과 Mobile "Hero Section"이 같은 요소인지 판단 (이름, 구조, 텍스트 내용 기반) |
| 차이점 추출 | 같은 요소의 layout, font-size, spacing, 표시/숨김 차이 기록 |
| 구조 차이 감지 | Desktop 3열 → Mobile 1열, Desktop에만 있는 요소, 순서 변경 등 |
| 통합 스펙 생성 | 하나의 HTML 구조 + desktop CSS 기본 + `@media` mobile 오버라이드 |

출력물은 반드시 **단일 HTML/CSS/JS 파일 세트**.

### 4. 코드 생성 규칙

#### HTML

- 시맨틱 HTML5: `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<footer>`
- div 남용 금지. 모든 `<div>`는 명확한 구조적 목적 필요
- BEM 스타일 클래스명: `.hero`, `.hero__title`, `.hero__cta`
- 접근성: alt 텍스트, heading 계층 (h1 > h2 > h3)
- 모든 요소에 `data-element-id` 속성 (live-preview 매핑용, pipeline.js가 자동 삽입)
- `styles.css`와 `script.js`를 외부 파일로 링크

#### CSS

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
- Flexbox 또는 CSS Grid로 레이아웃
- 반응형이면 desktop-first + `max-width` 미디어 쿼리
- 불필요한 wrapper div 제거

#### JS

- 인터랙션이 필요할 때만 생성 (모달, 탭, 아코디언, 캐러셀 등)
- Vanilla JS만. 프레임워크 사용 금지
- 이벤트 위임 활용

#### 이미지

- Figma에서 이미지 URL 수집 → `download-assets.js`가 `output/assets/`에 저장
- HTML에서 상대 경로 참조: `<img src="assets/hero.png">`
- SVG 아이콘은 인라인 또는 `fill="currentColor"`

### 5. Tools 상세

#### tools/pipeline.js

원커맨드 후처리 오케스트레이터:

```
node tools/pipeline.js output/
```

실행 순서:
1. `token-extractor.js` — Figma MCP 응답 JSON에서 CSS 변수 맵 생성 (Claude가 이미 `:root`에 반영했으므로 검증 용도)
2. `download-assets.js` — `output/assets-manifest.json`에 기록된 이미지 URL 목록을 순회하며 다운로드
3. `inject-ids.js` — `output/index.html`의 모든 시맨틱 요소에 `data-element-id="el-001"` 형태 삽입
4. `live-server/server.js` 기동 — `http://localhost:3100`에서 서빙

#### tools/download-assets.js

입력: `output/assets-manifest.json`
```json
[
  { "url": "https://figma-image-url/...", "filename": "hero.png" },
  { "url": "https://figma-image-url/...", "filename": "logo.svg" }
]
```

동작:
- 병렬 다운로드 (최대 5개 동시)
- `output/assets/`에 저장
- 다운로드 실패 시 placeholder 이미지 생성 + 경고 출력

#### tools/inject-ids.js

입력: `output/index.html`

동작:
- HTML 파싱 (cheerio 또는 자체 파서)
- `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<footer>`, `<div>`, `<h1>`~`<h6>`, `<p>`, `<a>`, `<button>`, `<img>`, `<ul>`, `<ol>`, `<li>`, `<span>` 등 주요 요소에 고유 ID 부여
- 이미 `data-element-id`가 있으면 건너뜀
- 원본 파일 덮어쓰기

#### tools/token-extractor.js

입력: Figma MCP 응답 데이터 (Claude가 `output/.figma-data.json`에 저장)

출력: `output/.design-tokens.json`
```json
{
  "colors": { "primary": "#E0004D", "secondary": "#1A1A1A" },
  "fonts": { "heading": "Poppins", "body": "Inter" },
  "spacing": { "xs": 4, "sm": 8, "md": 16, "lg": 32, "xl": 64 }
}
```

용도: Claude가 생성한 CSS 변수와 교차 검증. 불일치 시 경고.

Claude는 코드 생성 단계에서 `get_design_context` 응답 원본을 `output/.figma-data.json`에 Write 도구로 저장한다. 이 파일이 token-extractor의 입력이 된다.

#### tools/live-server/server.js

기능:
- `output/` 정적 파일 서빙 (`http://localhost:3100`)
- WebSocket 서버 (포트 3101)
- 파일 수정 API: WebSocket 메시지 수신 → 소스 파일 직접 수정
- 파일 감시 (fs.watch) → 변경 시 브라우저에 리로드 신호

파일 수정 프로토콜:
```json
{
  "type": "style-update",
  "elementId": "el-007",
  "property": "color",
  "value": "#FF0000"
}
```

```json
{
  "type": "text-update",
  "elementId": "el-012",
  "content": "새로운 텍스트"
}
```

수정 엔진:
- `data-element-id`로 HTML 요소 위치 특정
- style-update → `styles.css`에서 해당 selector 찾아 속성 값 변경
- text-update → `index.html`에서 해당 요소의 텍스트 콘텐츠 변경
- 수정 후 파일 저장 → fs.watch가 감지 → WebSocket으로 리로드 신호

#### tools/live-server/overlay.js

서버가 `index.html` 서빙 시 자동 주입하는 스크립트.

기능:
- **요소 선택**: 마우스 호버 시 하이라이트 (outline), 클릭 시 선택
- **수정 패널**: 선택된 요소 옆에 floating 패널 표시
  - 텍스트 편집 (contenteditable 활성화)
  - 색상 변경 (color picker)
  - 폰트 크기 (숫자 입력 + 단위)
  - 폰트 굵기 (드롭다운)
  - padding/margin (4방향 개별 입력)
  - 배경색 (color picker)
- **실시간 반영**: 값 변경 시 즉시 브라우저에 적용 (미리보기) + WebSocket으로 서버에 전송 → 소스 파일 수정
- **실행 취소/다시 실행**: Ctrl+Z / Ctrl+Shift+Z

### 6. 출력 구조

```
output/
├── index.html              # 메인 HTML
├── styles.css              # 스타일시트 (CSS 변수 체계)
├── script.js               # 인터랙션 (필요 시에만)
├── assets/                 # 이미지 에셋
│   ├── hero.png
│   └── logo.svg
├── assets-manifest.json    # 이미지 URL 목록 (pipeline용, 배포 시 제거)
└── .figma-data.json        # Figma MCP 원본 데이터 (pipeline용, 배포 시 제거)
```

### 7. 배포 구조 (플러그인 마켓플레이스)

```
figma-to-code/
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── .mcp.json                   # Figma remote MCP 번들
├── skills/
│   └── figma-to-code/
│       └── SKILL.md
├── tools/
│   ├── pipeline.js
│   ├── download-assets.js
│   ├── inject-ids.js
│   ├── token-extractor.js
│   └── live-server/
│       ├── server.js
│       ├── overlay.js
│       └── package.json        # 최소 의존성 (cheerio, ws)
├── commands/
│   └── figma-mcp-setup.md
└── docs/
    └── superpowers/
        └── specs/
```

### 8. 의존성

tools/live-server/package.json:
- `ws` — WebSocket 서버
- `cheerio` — HTML 파싱 + 수정 (inject-ids, 파일 수정 엔진)
- `chokidar` — 파일 감시 (fs.watch 대체, 크로스 플랫폼 안정성)

의존성 설치는 `pipeline.js` 첫 실행 시 자동 (`node_modules` 없으면 `npm install` 실행).

### 9. 수정 패널 지원 속성 (Phase 1)

| 카테고리 | 속성 | UI |
|---|---|---|
| 텍스트 | innerText | contenteditable 직접 편집 |
| 색상 | color | color picker |
| 배경색 | background-color | color picker |
| 폰트 크기 | font-size | 숫자 입력 + px/rem 단위 |
| 폰트 굵기 | font-weight | 드롭다운 (300/400/500/600/700) |
| 간격 | padding, margin | 4방향 개별 숫자 입력 |
| 테두리 | border-radius | 숫자 입력 |
| 투명도 | opacity | 슬라이더 |

### 10. 제약 및 주의사항

- Figma Starter/View/Collab 플랜은 월 6회 API 호출 제한. Pro/Org Dev seat 이상 권장.
- 복잡한 SPA나 멀티페이지에는 적합하지 않음. 단일 페이지(랜딩, 프로모션) 최적화.
- live-preview 수정은 스타일/텍스트만 지원 (Phase 1). 구조 변경은 Phase 2~3.
- SKILL.md의 `aliases` frontmatter는 비공식 → `description`에 키워드 포함으로 대체.
