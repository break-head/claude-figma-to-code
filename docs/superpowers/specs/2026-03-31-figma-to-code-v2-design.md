# Figma-to-Code v2 Design Spec

## 개요

Figma URL을 입력하면 Figma MCP의 React+Tailwind 코드를 기반으로 Claude가 바닐라 HTML/CSS/JS 단일 페이지를 생성하는 Claude Code 플러그인. 시각적 보정 루프를 통해 Figma 원본에 가까운 결과물을 보장한다.

## 이전 버전(v1)과 차이점

| 항목 | v1 | v2 |
|---|---|---|
| 변환 엔진 | react-to-vanilla.js 기계적 변환 | Claude가 직접 변환 |
| 변환 단위 | 전체 페이지 한 번에 | 섹션별 분할 변환 |
| 일관성 확보 | 없음 | 후처리 스크립트로 정규화+검증 |
| 시각적 검증 | 없음 | Playwright 스크린샷 vs Figma 스크린샷 비교 보정 루프 |
| live-preview | 요소 선택+수정 패널 | 브라우저 프리뷰만 (수정 기능 제외) |
| 반응형 | desktop/mobile 자동 감지+합성 | 단일 프레임만 (반응형 제외) |

## 타겟

프로모션/이벤트 페이지 — 복잡한 비주얼, absolute positioning 다수, 이미지 중심 디자인.

## 전체 파이프라인

```
사용자: Figma URL 제공
  │
  ▼
[1. URL 파싱 + MCP 호출]
  Figma URL에서 fileKey, nodeId 추출
  get_design_context(fileKey, nodeId) → React+Tailwind 코드 + 스크린샷
  코드를 output/.mcp-source.jsx에 저장
  스크린샷은 대화 컨텍스트에 유지 (레퍼런스)
  │
  ▼
[2. 섹션 식별]
  Claude가 MCP 코드를 읽고 최상위 섹션 구분
  섹션 목록을 사용자에게 보여주고 확인
  │
  ▼
[3. 섹션별 변환]
  각 섹션마다:
    React+Tailwind → 바닐라 HTML + CSS 변환
    output/sections/01-hero.html, 01-hero.css 등에 저장
  │
  ▼
[4. 후처리]
  node tools/postprocess.js output/
    assemble → token-extractor → normalize → download-assets → inject-ids
  │
  ▼
[5. 시각적 보정 루프]
  preview-server 기동 → Playwright 스크린샷 캡처
  → Figma 스크린샷과 비교 → 차이 발견 시 수정 → 재검증 (최대 2회)
  │
  ▼
[6. 브라우저 프리뷰]
  http://localhost:3100 에서 결과 확인
```

## 상세 설계

### 1. URL 파싱 + MCP 호출

사용자 메시지에서 Figma URL 추출:

- `figma.com/design/:fileKey/:fileName?node-id=:nodeId` — nodeId의 `-`를 `:`로 변환
- `figma.com/file/:fileKey/:fileName?node-id=:nodeId` — 동일
- `figma.com/design/:fileKey/branch/:branchKey/:fileName` — branchKey를 fileKey로 사용

node-id가 없으면 사용자에게 특정 프레임 URL 요청:
> "전체 파일 URL이네요. Figma에서 변환할 프레임을 선택하고 우클릭 → 'Copy link to selection'으로 특정 프레임 URL을 알려주세요."

MCP 호출:
- `get_design_context(fileKey, nodeId)` — React+Tailwind 코드 + 스크린샷 반환
- 반환된 코드를 `output/.mcp-source.jsx`에 Write로 저장
- 반환된 MCP 응답 원본 데이터를 `output/.figma-data.json`에 저장 (token-extractor 입력)
- 반환된 스크린샷은 대화 컨텍스트에 유지 (시각적 보정 루프의 레퍼런스)

### 2. 섹션 식별

Claude가 MCP 코드를 읽고 최상위 컴포넌트/섹션을 구분한다.

- 최상위 JSX의 직접 자식 요소들을 섹션으로 식별
- 각 섹션에 이름 부여 (hero, features, cta, footer 등)
- 섹션 목록을 사용자에게 보여주고 확인
  > "4개 섹션으로 나눕니다: Hero, Features, CTA, Footer — 맞나요?"

### 3. 섹션별 변환

각 섹션마다 Claude가 React+Tailwind → 바닐라 HTML + CSS로 변환한다.

변환 규칙:

**HTML:**
- 시맨틱 HTML5: `<header>`, `<nav>`, `<main>`, `<section>`, `<footer>`
- BEM 스타일 클래스명: `.hero`, `.hero__title`, `.hero__cta`
- 이미지는 `assets/` 상대경로: `<img src="assets/hero.png">`
- SVG 아이콘은 인라인 또는 `fill="currentColor"`

**CSS:**
- `:root`에 CSS 변수 정의 (색상, 폰트, 간격)
- 색상/폰트 하드코딩 금지 — CSS 변수 참조
- Flexbox 또는 CSS Grid로 레이아웃
- 불필요한 wrapper div 제거

**JS:**
- 인터랙션 필요 시에만 생성 (모달, 탭, 아코디언 등)
- Vanilla JS만. 프레임워크 사용 금지

**저장:**
- HTML: `output/sections/01-hero.html`
- CSS: `output/sections/01-hero.css`
- 번호 순서 = 페이지 내 배치 순서

### 4. 후처리 스크립트

`node tools/postprocess.js output/` 한 번 실행으로 모든 후처리 자동화.

실행 순서:

| 순서 | 스크립트 | 역할 |
|---|---|---|
| 1 | `assemble.js` | `output/sections/*.html` + `*.css`를 index.html + styles.css로 합침. HTML은 순서대로 `<body>` 안에 배치, CSS는 순서대로 연결 |
| 2 | `token-extractor.js` | Figma MCP 데이터(`output/.figma-data.json`)에서 디자인 토큰 추출 → `output/.design-tokens.json` |
| 3 | `normalize.js` | CSS 변수 네이밍 통일(`--color-*`, `--font-*`, `--space-*`), 하드코딩 색상→변수 참조 교체, Figma 토큰과 불일치 시 경고+자동 교정 |
| 4 | `download-assets.js` | `output/assets-manifest.json`의 이미지 URL 목록 병렬 다운로드 → `output/assets/` 저장. 최대 5개 동시. 실패 시 placeholder 생성+경고 |
| 5 | `inject-ids.js` | `output/index.html`의 주요 요소에 `data-element-id="el-001"` 형태 고유 ID 삽입 |

### 5. 시각적 보정 루프

후처리 완료 후 결과물을 Figma 원본과 시각적으로 비교하여 보정한다.

**동작 방식:**

1. `preview-server.js`로 `output/` 서빙 (http://localhost:3100)
2. `capture.js`가 Playwright로 전체 페이지 스크린샷 캡처 → `output/.preview-screenshot.png`
3. Claude가 두 이미지 비교:
   - Figma MCP 스크린샷 (원본 레퍼런스)
   - 로컬 렌더링 스크린샷 (현재 결과물)
4. 차이점을 구체적으로 식별하고 해당 섹션 수정
5. 후처리 재실행 → 재캡처 → 재비교

**보정 제한:**
- 최대 2회 반복
- 2회 후에도 차이가 있으면 남은 차이점을 사용자에게 리포트하고 종료

**비교 기준:**
- 색상 일치
- 타이포그래피 (크기, 굵기, 행간)
- 간격 (padding, margin, gap)
- 레이아웃 구조 (요소 배치, 정렬)
- 이미지 위치/크기
- 사소한 렌더링 차이 (브라우저 기본값 등)는 무시

**스크린샷 캡처 옵션:**
- 뷰포트 width: Figma 프레임과 동일
- full-page 캡처 (스크롤 전체)
- 2x 해상도 (레티나 대응)

### 6. 브라우저 프리뷰

보정 루프 완료 후 `preview-server.js`가 이미 기동 중이므로:
> "프리뷰가 준비됐습니다: http://localhost:3100"

프리뷰 서버 기능:
- `output/` 정적 파일 서빙
- 파일 변경 감시 (chokidar) → 자동 리로드

수정 기능은 Phase 1에 포함하지 않는다.

## 출력 구조

```
output/
├── index.html              # 최종 HTML
├── styles.css              # 최종 CSS
├── script.js               # 인터랙션 (필요 시에만)
├── assets/                 # 다운로드된 이미지
├── sections/               # 섹션별 중간 파일 (디버그용)
│   ├── 01-hero.html
│   ├── 01-hero.css
│   ├── 02-features.html
│   └── ...
├── .mcp-source.jsx         # MCP 원본 코드 (배포 시 제거)
├── .figma-data.json        # MCP 원본 데이터 (배포 시 제거)
├── .design-tokens.json     # 추출된 토큰 (배포 시 제거)
├── .preview-screenshot.png # 캡처 결과 (배포 시 제거)
└── assets-manifest.json    # 이미지 URL 목록 (배포 시 제거)
```

## 플러그인 구조

```
figma-to-code/
├── .claude-plugin/
│   └── marketplace.json
├── .mcp.json               # Figma remote MCP 번들
├── skills/
│   └── figma-to-code/
│       └── SKILL.md        # Claude 실행 프로세스 전체 정의
├── tools/
│   ├── postprocess.js      # 원커맨드 오케스트레이터
│   ├── assemble.js         # 섹션 합치기
│   ├── normalize.js        # CSS 정규화 + 토큰 검증
│   ├── token-extractor.js  # 디자인 토큰 추출 (기존 유지)
│   ├── download-assets.js  # 이미지 다운로드 (기존 유지)
│   ├── inject-ids.js       # data-element-id 삽입 (기존 유지)
│   ├── preview-server.js   # 정적 서버 + 자동 리로드
│   └── capture.js          # Playwright 스크린샷
├── package.json
└── docs/
    └── superpowers/
        └── specs/
```

## 의존성

- `cheerio` — HTML 파싱 (inject-ids, assemble, normalize)
- `chokidar` — 파일 감시 (preview-server)
- `playwright` — 스크린샷 캡처 (capture.js)

## 삭제 대상 (v1 코드)

- `tools/react-to-vanilla.js` — Claude 직접 변환으로 대체
- `tools/pipeline.js` — postprocess.js로 대체
- `tools/live-server/overlay.js` — 수정 기능 Phase 1 제외
- `tools/live-server/server.js` — preview-server.js로 대체

## 제약 및 주의사항

- Figma Starter/View/Collab 플랜은 월 6회 API 호출 제한. Pro/Org Dev seat 이상 권장.
- 프로모션/이벤트 페이지 타겟. 복잡한 SPA나 멀티페이지에는 적합하지 않음.
- 반응형은 Phase 1에 포함하지 않음. 단일 프레임만 변환.
- 커스텀 폰트 (Hyundai Sans 등)는 웹에서 로드 불가 → 시스템 폰트 대체 또는 Google Fonts 매핑.
- 시각적 보정 루프는 최대 2회. 완벽하지 않을 수 있으며 남은 차이점은 리포트.

## Phase 로드맵

| Phase | 범위 | 상태 |
|---|---|---|
| **Phase 1 (이 문서)** | Figma → 코드 생성 + 시각적 보정 + 프리뷰 | 현재 |
| Phase 2 | live-preview 수정 기능 (스타일/텍스트) + 반응형 | 예정 |
| Phase 3 | 요소 추가/삭제/복제 + 드래그 재배치 | 예정 |
