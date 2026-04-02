# Figma-to-Code AI 에이전트 재설계

## 요약

고정 파이프라인을 **AI 에이전트 아키텍처**로 전환한다. AI가 도구(tool)들을 상황에 맞게 호출하고, Figma 원본과 시각적으로 동일한 HTML/CSS/JS를 생성할 때까지 자율적으로 반복한다.

## 동기

- AI가 MCP 코드를 읽고 수동으로 HTML을 작성하면서 이미지 누락, 크롭 좌표 손실 등 정보 손실 발생
- 섹션 분리 방식이 복잡성만 추가하고 품질에 기여하지 못함
- 도구 출력이 console.log 텍스트라 AI가 결과를 정확히 파싱하기 어려움
- 고정 파이프라인은 에이전트가 아님 — AI가 판단/분기/반복하는 구조가 필요

## 설계 결정

| 결정 | 선택 | 이유 |
|------|------|------|
| 아키텍처 | AI 에이전트 + 도구 | 고정 파이프라인은 에러 대응/판단 불가 |
| 변환 방식 | 완전 자동 (프로그래밍적) | AI 수동 변환이 이미지 누락의 근본 원인 |
| JSX 파서 | Babel AST | 정규식은 중첩/엣지케이스에 취약 |
| 도구 인터페이스 | JSON 표준화 CLI | 기존 패턴 유지하면서 입출력만 구조화 |
| 섹션 분리 | 제거 | 자동 변환이면 전체 재생성 비용이 낮음 |
| 보정 루프 | AI 자율 판단 반복 | 고정 2회가 아닌, 완벽해질 때까지 |

## AI 에이전트 아키텍처

### 핵심 개념

도구는 **능력(capability)**이지 **단계(step)**가 아니다. AI가 목표(Figma와 동일한 결과물)를 달성하기 위해 도구를 자율적으로 선택하고 조합한다.

### 에이전트 루프

```
┌──────────────────────────────────────────────┐
│                 AI Agent                      │
│                                               │
│  1. MCP로 Figma 데이터 수집                     │
│  2. parse-jsx로 구조/이미지/토큰 추출            │
│  3. convert-to-html로 초안 HTML/CSS 생성        │
│  4. download-assets로 이미지 다운로드            │
│  5. preview + capture로 스크린샷 촬영            │
│  6. Figma 원본 스크린샷과 비교 (AI 비전)          │
│  7. 차이가 있으면:                               │
│     ├─ 구조 문제 → convert 옵션(overrides) 조정  │
│     │              후 재생성                     │
│     ├─ 스타일 문제 → CSS 직접 수정               │
│     ├─ 시맨틱 판단 → 태그/클래스 변경             │
│     └─ 이미지 문제 → 크롭 좌표 수정              │
│  8. 다시 5번으로 → 완벽해질 때까지                │
│                                               │
│  도구: parse-jsx, convert-to-html,             │
│        download-assets, capture, validate,     │
│        preview-server, inject-ids              │
└──────────────────────────────────────────────┘
```

### 고정 파이프라인과의 차이

| | 이전 (빌드 도구) | 새 설계 (에이전트) |
|---|---|---|
| 흐름 | 고정 순서 실행 | AI가 판단하여 도구 선택 |
| 시맨틱 태그 | 코드가 규칙 기반 매핑 | AI가 디자인 맥락 보고 판단 |
| 레이아웃 추론 | 코드가 좌표 계산 | convert가 초안 생성 + AI가 시각적 확인 후 수정 |
| 보정 | 최대 2회 고정 | 완벽해질 때까지 반복 |
| 에러 대응 | 없음 | AI가 validate 결과 보고 자동 수정 |
| 이미지 실패 | 플레이스홀더로 대체 | AI가 재시도 또는 대안 결정 |

## 도구 설계

### 공통: JSON 표준화 CLI

모든 도구가 동일한 출력 형식을 따른다:

```json
{ "ok": true, "data": { ... }, "warnings": [] }
{ "ok": false, "error": "메시지", "code": "ERROR_CODE" }
```

- `stdout` → 결과 JSON (AI가 파싱)
- `stderr` → 로그 메시지 (사람이 읽는 용도)
- exit 0 → 성공, exit 1 → 실패

### 새 도구: `parse-jsx.js`

Babel로 JSX를 파싱하여 경량 AST, 이미지 목록, 디자인 토큰을 추출한다.

**CLI:** `node tools/parse-jsx.js <jsx-file>`

**출력:**
```json
{
  "ok": true,
  "data": {
    "ast": {
      "tag": "div",
      "className": "relative w-[1440px]",
      "children": [...]
    },
    "images": [
      { "url": "https://...", "filename": "hero.png", "crop": { "width": "652.38%", "left": "-493.07%" } }
    ],
    "tokens": {
      "colors": { "--color-primary": "#2b2b2b" },
      "fonts": { "--font-heading": "'YouandiNewKr_Title'" },
      "fontWeights": { "--fw-bold": 700 }
    },
    "meta": { "width": 1440, "height": 3200, "nodeCount": 47, "imageCount": 5 }
  }
}
```

**핵심 로직:**
1. `@babel/parser`로 JSX 파싱 → Babel AST
2. AST 순회하며 모든 `<img src="...">` 자동 수집 (이미지 누락 원천 차단)
3. 모든 Tailwind 클래스에서 색상/폰트/크롭 정보 추출
4. 기존 `parse-mcp.js`의 Tailwind 파서 함수들 재활용
5. 경량 트리 구조로 변환

### 새 도구: `convert-to-html.js`

parse-jsx의 출력(AST + tokens)을 받아 vanilla HTML + CSS를 생성한다.

**CLI:** `node tools/convert-to-html.js <output-dir> [--overrides <overrides.json>]`

**출력:**
```json
{
  "ok": true,
  "data": {
    "htmlPath": "output/index.html",
    "cssPath": "output/styles.css",
    "assetsManifest": [
      { "url": "https://...", "filename": "hero.png" }
    ]
  }
}
```

**AI 개입 옵션 (overrides):**

AI가 첫 변환 결과를 보고 판단하면, overrides JSON을 전달하여 재변환할 수 있다:

```json
{
  "overrides": {
    "node-42:353": { "tag": "nav", "className": "main-nav" },
    "node-55:100": { "layout": "grid", "columns": 3 }
  },
  "layoutStrategy": "flex",
  "semanticLevel": "full"
}
```

**변환 규칙:**

Tailwind → CSS:
- `w-[1052px]` → `width: 1052px`
- `bg-[#f9bb34]` → `background-color: var(--color-accent)`
- `text-[20px]` → `font-size: 20px`
- `flex`, `gap-[20px]` → `display: flex; gap: 20px`

레이아웃 의도 추론 (초안):
- 부모 내 자식 left 값이 대칭 → `margin: 0 auto`
- 동일 top 값 형제들 → `display: flex`
- `-translate-x-1/2 left-[calc(50%)]` → 중앙 정렬
- AI가 결과를 보고 overrides로 재조정 가능

이미지 크롭 보존:
- 퍼센트 기반 크롭 패턴 → `overflow: hidden` + `position: absolute` + 원본 좌표 그대로

CSS 변수:
- tokens 데이터로 `:root` 선언, 본문에서 `var()` 참조
- 하드코딩 색상 0개

BEM 네이밍:
- AST 트리 깊이 + 위치 기반 자동 생성 (`.header`, `.header__logo`)

### 기존 도구 JSON 표준화

| 도구 | CLI | 주요 출력 data |
|------|-----|---------------|
| `download-assets` | `node tools/download-assets.js <output-dir>` | `{ downloaded, failed, files }` |
| `inject-ids` | `node tools/inject-ids.js <output-dir>` | `{ count }` |
| `capture` | `node tools/capture.js <url> <output-path>` | `{ path, width }` |
| `validate` | `node tools/validate.js <output-dir> [url]` | `{ pass, warn, fail, issues }` |

AI가 개별 도구를 독립적으로 호출할 수 있다:
- 이미지 1개만 실패 → `download-assets`에 특정 파일만 재시도
- validate 결과에서 색상 불일치 → AI가 CSS 직접 수정 후 재검증
- 레이아웃이 틀림 → `convert-to-html`에 overrides 넘겨서 재생성

### 유지 (변경 없음)

| 파일 | 이유 |
|------|------|
| `tools/preview-server.js` | 프리뷰 서버, 변경 불필요 |
| `tools/extract-styles.js` | validate 내부 사용, 변경 불필요 |

## `postprocess.js` 역할 변경

더 이상 고정 파이프라인 오케스트레이터가 아니다. **AI가 직접 도구를 호출하므로**, postprocess.js는 **편의용 일괄 실행 도구**로 축소된다:

```bash
# AI가 개별 호출 (에이전트 모드)
node tools/parse-jsx.js output/.mcp-source.jsx
node tools/convert-to-html.js output/
node tools/download-assets.js output/

# 또는 한번에 실행 (편의용)
node tools/postprocess.js output/
```

postprocess.js는 parse-jsx → convert-to-html → download-assets → inject-ids를 순서대로 실행하는 숏컷일 뿐, AI는 필요에 따라 개별 도구를 직접 호출할 수 있다.

## 삭제 대상

| 파일 | 이유 |
|------|------|
| `tools/assemble.js` | 섹션 합침 불필요 |
| `tools/token-extractor.js` | parse-jsx가 토큰 추출 담당 |
| `tools/normalize.js` | convert-to-html이 처음부터 CSS 변수 생성 |
| `tools/parse-mcp.js` | Tailwind 파서 함수를 parse-jsx.js로 이전 |
| `output/sections/` | 섹션 분리 제거 |

## 새 의존성

- `@babel/parser` — JSX → AST 파싱

## SKILL.md 변경

기존 Step 3 (섹션 식별), Step 4 (섹션별 변환)를 삭제하고, AI 에이전트 루프로 대체:

1. MCP로 Figma 데이터 수집 → `.mcp-source.jsx` 저장
2. `parse-jsx` 실행 → 구조/이미지/토큰 확인
3. `convert-to-html` 실행 → 초안 HTML/CSS 생성
4. `download-assets` 실행 → 이미지 다운로드
5. `preview-server` + `capture` → 스크린샷 촬영
6. Figma 원본과 비교 → 차이점 식별
7. 차이가 있으면 수정 후 5번으로 (AI 판단, 횟수 제한 없음)
8. 완벽하면 `inject-ids` 실행 → 결과 안내
