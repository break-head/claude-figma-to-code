---
name: figma-to-code
description: Figma URL을 넣으면 배포 가능한 HTML/CSS/JS를 생성합니다. "figma", "피그마", "디자인을 코드로", "HTML로 만들어줘", "figma.com" URL이 포함된 요청에 사용됩니다.
---

# Figma-to-Code

Figma 디자인 URL을 받아 배포 가능한 Vanilla HTML/CSS/JS를 생성하는 AI 에이전트.

## 트리거

다음과 같은 요청에 이 스킬이 활성화된다:
- "이 Figma 디자인을 HTML로 만들어줘"
- "figma.com/design/... 이걸 코드로 변환해줘"
- 메시지에 figma.com URL이 포함된 경우

## 환경 설정

`.env` 파일에 Figma API 토큰이 필요하다 (`.env.example` 참조):
```
FIGMA_TOKEN=your_figma_personal_access_token
```

## 아키텍처

AI-Driven Pipeline: MCP 데이터를 AI가 분석하여 시맨틱 HTML을 설계하고, Figma REST API로 복합 에셋을 처리한다.

```
Figma URL → MCP(스크린샷+JSX)
  → 타겟 확인 (데스크탑/모바일/반응형)
  → AI 디자인 분석 (섹션 구조 + 에셋 전략)
  → 복합 노드 래스터 내보내기 (Figma REST API)
  → 시맨틱 HTML/CSS 생성 (AI 주도, 스크린샷 기준)
  → MCP 에셋 다운로드
  → capture 검증
```

### 도구 (6개)

| 도구 | 용도 | 속도 |
|---|---|---|
| `tools/classify-nodes.js` | MCP JSX 자동 분석 → 에셋 전략 분류 (asset-plan.json) | 즉시 |
| `tools/export-nodes.js` | Figma REST API로 노드를 래스터 PNG 내보내기 | 수초 |
| `tools/download-assets.js` | assets-manifest.json의 이미지를 병렬 다운로드 | 수초 |
| `tools/jsx-to-html.js` | MCP JSX → HTML 기계 변환 (참조용) | 즉시 |
| `tools/tailwind-to-css.js` | HTML 내 Tailwind 클래스 → 실제 CSS 추출 (참조용) | ~20ms |
| `tools/capture.js` | Playwright로 렌더링 스크린샷 캡처 (검증용) | 수초 |

### 실행 순서

#### 1. URL 파싱
사용자 입력에서 Figma URL을 추출한다.
- `figma.com/design/:fileKey/:fileName?node-id=:nodeId` → nodeId의 `-`를 `:`로 변환
- `figma.com/file/:fileKey/:fileName?node-id=:nodeId` → 동일
- `figma.com/design/:fileKey/branch/:branchKey/:fileName` → branchKey를 fileKey로 사용

URL이 없거나 node-id가 없으면:
> "변환할 Figma 프레임 URL을 알려주세요. Figma에서 프레임을 선택하고 우클릭 → 'Copy link to selection'으로 복사할 수 있습니다."

#### 2. MCP 호출
`get_design_context`(fileKey, nodeId)로 JSX 코드 + 스크린샷 획득. 스크린샷은 대화 컨텍스트에 유지 (검증 루프 레퍼런스).

#### 3. 프로젝트명 + 타겟 확인 (사용자 컨펌 필수)
MCP 데이터를 가져온 후, **반드시** 사용자에게 질문한다. 프로젝트명을 자동으로 결정하지 않는다.

```
Figma 디자인을 가져왔습니다. (프레임 크기: {width}×{height})

1. 프로젝트명을 정해주세요 (output 폴더명으로 사용됩니다):
   예) my-landing-page

2. 이 디자인의 타겟은 무엇인가요?
   1) 데스크탑
   2) 모바일
   3) 반응형 (모바일 프레임 URL 추가 입력)
```

#### 4. 에셋 자동 분류

`classify-nodes.js`로 MCP JSX를 자동 분석하여 에셋 전략을 결정한다.

```bash
node tools/classify-nodes.js output/{프로젝트명}/source.jsx
```

출력: `output/{프로젝트명}/asset-plan.json`

| 분류 | 감지 기준 | 처리 |
|---|---|---|
| `composite-group` | `data-name`에 "봉투" 등 + 2개 이상 absolute img | REST API 래스터 내보내기 |
| `placeholder-candidate` | inset 오프셋 + 단일 img + 큰 사이즈(>400px) | REST API 래스터 내보내기 |
| `complex-layout` | "step" 등 이름 + grid + img 포함 | REST API 래스터 내보내기 |
| `decoration` | pointer-events-none + opacity/blur | MCP 에셋 다운로드 |
| `icon` | size < 250px + 단일 img + data-name | MCP 에셋 다운로드 |

**AI 검토**: asset-plan.json을 확인하고, 누락된 복합 그룹이나 불필요한 내보내기가 있으면 조정한다. 대부분의 경우 자동 분류 결과를 그대로 사용.

**핵심**: 개별 이미지 조각을 CSS로 겹쳐 재구성 절대 금지 — 복합 비주얼은 반드시 REST API로 단일 이미지 내보내기.

#### 5. Figma REST API로 래스터 내보내기

Step 4에서 식별한 복합 그룹 / 플레이스홀더 노드를 `export-nodes.js`로 내보낸다.

```bash
node tools/export-nodes.js output/{프로젝트명}/ \
  -f {fileKey} \
  -n "{nodeId1}:{이름1},{nodeId2}:{이름2},..."
```

**내보내기 대상:**
- 복합 이미지 그룹 (`data-node-id`로 식별)
- `download-assets.js` 실행 후 `placeholder: true`로 감지된 노드
- 폰 목업 + UI 오버레이 등 복잡한 시각 요소

`export-nodes.js`가 자동으로:
- Figma REST API `GET /v1/images/{fileKey}?ids={nodeIds}&format=png&scale=2` 호출
- 다운로드 가능한 URL 수신 → assets/ 폴더에 저장
- assets-manifest.json 업데이트

#### 6. 에셋 매니페스트 생성 + MCP 에셋 다운로드

**6-1. assets-manifest.json 작성**
MCP JSX의 이미지 URL을 매니페스트에 정리한다. 각 에셋에 역할(role)을 태깅:

```json
[
  {
    "url": "https://...",
    "filename": "coin-decoration.png",
    "role": "decoration",
    "layer": "background",
    "cssHint": "pointer-events:none; opacity:0.5"
  },
  {
    "url": "https://...",
    "filename": "tucson-car.png",
    "role": "content",
    "layer": "foreground"
  }
]
```

**JSX 힌트 → role 매핑:**

| JSX 힌트 | role | layer |
|---|---|---|
| `pointer-events-none` + `opacity` + `blur` | `decoration` | `background` |
| `pointer-events-none` + `absolute` | `decoration` | `background` |
| 차량/제품/아이콘 등 핵심 시각 | `content` | `foreground` |

**주의:** Step 5에서 이미 `export-nodes.js`로 내보낸 복합 그룹의 개별 조각은 매니페스트에 포함하지 않는다.

**6-2. 다운로드 실행**
```bash
node tools/download-assets.js output/{프로젝트명}/
```

`download-assets.js`가 자동으로:
- 파일 타입 감지 → 확장자 자동 보정 (.png→.svg 등)
- SVG viewBox 파싱 → 매니페스트에 `aspectRatio`, `width`, `height` 추가
- 플레이스홀더 SVG 감지 (stroke-only) → `placeholder: true` 플래그
- HTML 파일의 이미지 참조 동기화

**6-3. 플레이스홀더 처리**
`download-assets.js` 경고에서 `placeholder: true`인 에셋이 있으면:
→ 해당 노드를 `export-nodes.js`로 추가 내보내기

#### 7. 시맨틱 HTML/CSS 생성 (AI 주도)

**참조 데이터를 토대로 AI가 시맨틱 HTML과 CSS를 작성한다.**

참조 데이터:
- MCP 스크린샷 (시각적 진실)
- MCP JSX (데이터: 텍스트, 색상, 폰트, 간격)
- `jsx-to-html.js` / `tailwind-to-css.js` 결과 (구조 참조, 그대로 사용하지 않음)

**CSS 생성 규칙:**
```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  /* Colors — MCP JSX의 hex 값에서 추출, 하드코딩 금지 */
  --color-primary: #...;
  /* Fonts — CSS 변수로 정의, font-weight 반드시 명시 */
  --font-heading: '...', sans-serif;
  /* Spacing — 스크린샷에서 관찰된 간격 패턴 */
  --space-sm: ...px;
}
```

**레이아웃 규칙:**
- Flexbox 또는 CSS Grid 사용. **절대좌표(position: absolute) 사용 금지** (장식 요소 제외)
- 스크린샷을 보고 레이아웃 의도를 추론
- 복합 이미지 그룹 → 단일 `<img>` 태그 (Step 5에서 내보낸 이미지)
- 장식 요소는 `overflow: hidden` 컨테이너 안에서만 absolute 허용

**타겟별 레이아웃:**

| 타겟 | 루트 | 캡처 뷰포트 |
|---|---|---|
| 데스크탑 | `max-width: {프레임너비}px; margin: 0 auto` | {프레임너비}px |
| 모바일 | `max-width: 480px; margin: 0 auto` | 480px |
| 반응형 | `@media (max-width: 768px)` 분기 | 양쪽 모두 |

**반응형 추가 처리:**
1. 데스크탑 HTML을 기본 구조로 사용
2. 모바일 참조 HTML과 스크린샷을 비교하여 차이점 파악
3. `@media (max-width: 768px)`로 모바일 오버라이드
4. 완료 후 `mobile-ref.html` 삭제

#### 8. 시각적 검증 루프
```bash
# 데스크탑
node tools/capture.js file://$(pwd)/output/{프로젝트명}/index.html output/{프로젝트명}/.preview.png {프레임너비}

# 모바일
node tools/capture.js file://$(pwd)/output/{프로젝트명}/index.html output/{프로젝트명}/.preview.png 480
```

1. Read로 `.preview.png` 확인
2. MCP 원본 스크린샷과 비교
3. 차이가 있으면 Edit으로 수정 → 재캡처 (최대 2회)

#### 9. 결과 안내
```
변환 완료!

output/{프로젝트명}/index.html  — 메인 HTML
output/{프로젝트명}/styles.css  — 스타일시트
output/{프로젝트명}/assets/     — 이미지 에셋

수정하려면 이 대화에서 바로 요청하세요.
```

### 핵심 원칙

1. **MCP 데이터가 기준** — 스크린샷(시각) + JSX(데이터)가 모든 판단의 기준
2. **사용자 컨펌 필수** — 타겟은 반드시 사용자가 선택. 프레임 크기로 자동 판단하지 않음
3. **AI가 설계자** — 스크린샷과 JSX를 분석하여 시맨틱 HTML 구조를 설계한다
4. **복합 비주얼은 이미지로** — 개별 조각을 CSS로 겹치지 말고, Figma REST API로 래스터 내보내기
5. **스크린샷이 시각적 진실** — 레이아웃/정렬은 스크린샷을 보고 판단
6. **도구 출력은 참조** — jsx-to-html, tailwind-to-css는 데이터 추출 참조용. 최종 코드는 AI가 작성

### SVG 에셋과 aspect-ratio

Figma MCP는 벡터 요소를 SVG로 반환. SVG는 `width="100%" height="100%"`이므로 **컨테이너에 `aspect-ratio` 필수**:
- `download-assets.js`가 SVG viewBox를 파싱하여 매니페스트에 `aspectRatio`, `width`, `height`를 자동 추가
- AI 작성 시 매니페스트의 `aspectRatio` 값을 CSS에 적용:
```css
/* 매니페스트: "aspectRatio": "699/322" */
.coupon-img { aspect-ratio: 699/322; }
```

### 출력 구조

```
output/{프로젝트명}/
├── source.jsx          (MCP 원본, 참조용)
├── index.html
├── styles.css
├── script.js           (필요시)
├── assets-manifest.json
└── assets/
```

## 실행

`/figma-to-code {Figma URL}` 슬래시 커맨드로 실행한다.

## 주의사항

- `.env`에 `FIGMA_TOKEN` 설정 필수 (Figma REST API 사용)
- Figma Pro/Org Dev seat 이상 권장 (Starter/View/Collab은 월 6회 API 제한)
- 프로모션/이벤트 단일 페이지에 최적화
