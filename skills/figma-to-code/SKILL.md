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

## 아키텍처

Mechanical-First Pipeline: MCP 데이터를 기계적으로 변환하고, AI는 검수/보정만 담당한다.

```
Figma URL → MCP(스크린샷+JSX)
  → 타겟 확인 (데스크탑/모바일/반응형)
  → jsx-to-html (기계 변환)
  → tailwind-to-css (CSS 추출)
  → AI 검수/보정 (타겟에 맞게 레이아웃 조정)
  → download-assets
  → capture 검증
```

### 도구 (4개)

| 도구 | 용도 | 속도 |
|---|---|---|
| `tools/jsx-to-html.js` | MCP JSX → HTML 기계 변환 (className→class 등) | 즉시 |
| `tools/tailwind-to-css.js` | HTML 내 Tailwind 클래스 → 실제 CSS 추출 | ~20ms |
| `tools/download-assets.js` | assets-manifest.json의 이미지를 병렬 다운로드 | 수초 |
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
`get_design_context`(fileKey, nodeId)로 JSX 코드 + 스크린샷 획득. 스크린샷은 대화 컨텍스트에 유지 (보정 루프 레퍼런스).

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

#### 4. 복합 이미지 그룹 감지 및 MCP 재호출
MCP JSX를 분석하여 **복합 이미지 그룹**을 식별하고, 개별 조각이 아닌 단일 이미지로 획득한다. (상세 규칙은 "에셋 처리 주의사항 > 2. 복합 이미지 그룹" 참조)

#### 5. JSX 저장 + 기계 변환
```bash
# JSX 저장
Write → output/{프로젝트명}/source.jsx

# JSX → HTML
node tools/jsx-to-html.js output/{프로젝트명}/source.jsx output/{프로젝트명}/index.html --wrap

# Tailwind → CSS
node tools/tailwind-to-css.js output/{프로젝트명}/index.html output/{프로젝트명}/styles.css
```

반응형의 경우 모바일 프레임도 동일하게 변환:
```bash
node tools/jsx-to-html.js output/{프로젝트명}/source-mobile.jsx output/{프로젝트명}/mobile-ref.html --wrap
```

#### 6. AI 검수/보정
변환 결과를 읽고, 타겟에 맞게 레이아웃 보정·누락 보완·이미지 경로 매핑. **전체 재작성 금지.**

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

- **레이아웃**: Flexbox 또는 CSS Grid. **절대좌표(position: absolute) 사용 금지.** 스크린샷을 보고 의도를 추론
- **이미지 크롭/마스크**: MCP JSX의 퍼센트 기반 크롭은 vanilla CSS로 변환 (`object-fit: cover`로 대체 금지)
- **복합 이미지 그룹**: 단일 `<img>` 태그로 대체 (step 4에서 획득한 이미지 사용)

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

#### 7. 에셋 다운로드
```bash
node tools/download-assets.js output/{프로젝트명}/
```

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

### 타겟별 처리

| 타겟 | 루트 레이아웃 | capture 뷰포트 |
|---|---|---|
| 데스크탑 | `max-width: {프레임너비}px`, `margin: 0 auto` | {프레임너비}px |
| 모바일 | `max-width: 480px`, `margin: 0 auto` | 480px |
| 반응형 | `@media` breakpoint로 데스크탑/모바일 분기 | 양쪽 모두 캡처 |

**반응형 선택 시**: 모바일 프레임 URL을 추가로 입력받아 두 번째 MCP 호출. 데스크탑 CSS를 기본으로 하고 `@media (max-width: 768px)`로 모바일 오버라이드.

### 핵심 원칙

1. **MCP 데이터가 기준** — 스크린샷(시각) + JSX(데이터)가 모든 판단의 기준
2. **사용자 컨펌 필수** — 타겟은 반드시 사용자가 선택. 프레임 크기로 자동 판단하지 않음
3. **기계 변환 우선** — JSX→HTML, Tailwind→CSS는 도구가 처리, AI는 재작성하지 않음
4. **AI는 검수자** — 변환 결과의 누락/오류만 수정, 전체 코드를 새로 쓰지 않음
5. **스크린샷이 시각적 진실** — 레이아웃/정렬은 스크린샷을 보고 판단

### 에셋 처리 주의사항

`download-assets.js`는 자동으로 처리하지만, AI 검수 시 추가 확인이 필요하다:

#### 1. 매니페스트에 에셋 역할 태깅 (AI 필수)
assets-manifest.json 생성 시, MCP JSX의 컨텍스트를 보고 각 에셋의 **역할(role)**을 반드시 태깅한다:

```json
[
  {
    "url": "https://...",
    "filename": "coin-decoration.png",
    "role": "decoration",
    "layer": "background",
    "cssHint": "position:absolute; z-index:0; pointer-events:none; opacity:0.5"
  },
  {
    "url": "https://...",
    "filename": "tucson-car.png",
    "role": "content",
    "layer": "foreground"
  },
  {
    "url": "https://...",
    "filename": "coupon-bg.png",
    "role": "background",
    "layer": "mid"
  }
]
```

**JSX 힌트 → role 매핑:**

| JSX 힌트 | role | layer | CSS 처리 |
|---|---|---|---|
| `pointer-events-none` + `opacity` + `blur` | `decoration` | `background` | `z-index:0`, absolute, overflow:hidden |
| `pointer-events-none` + `absolute` | `decoration` | `background` | `z-index:0~1`, 유출 방지 |
| 쿠폰/봉투/카드 배경 이미지 | `background` | `mid` | `z-index:1`, relative |
| 차량/제품/아이콘 등 핵심 시각 | `content` | `foreground` | `z-index:1`, 일반 플로우 |
| 텍스트/버튼/입력 | `interactive` | `foreground` | `z-index:2+` |

**핵심**: `decoration` 에셋은 반드시 콘텐츠 **뒤에** 배치. 컨테이너에 `overflow:hidden`으로 유출 방지. 콘텐츠 영역은 `position:relative; z-index:1`로 장식보다 위에.

#### 2. 복합 이미지 그룹 감지 및 단일 이미지 재요청 (필수)

MCP JSX에서 **여러 `<img>`가 absolute 포지셔닝으로 겹쳐 하나의 비주얼을 구성하는 그룹**을 반드시 식별한다.

**감지 패턴:**
- 부모 요소 안에 2개 이상의 `<img>`가 `absolute`로 겹쳐 있음
- 봉투+쿠폰, 카드+아이콘+텍스트 오버레이, 폰 목업+UI 스크린샷 등
- `data-name`에 "봉투", "쿠폰", "팝업" 등 합성을 암시하는 이름이 있음

**처리:**
1. 개별 이미지 조각을 CSS로 겹쳐 재구성 **절대 금지**
2. 해당 그룹의 부모 `data-node-id`를 찾음
3. `get_design_context`(fileKey, nodeId)를 그룹 노드에 재호출 → **스크린샷을 단일 이미지로 획득**
4. 획득한 이미지를 `assets-manifest.json`에 추가, HTML에서는 `<img src="assets/{이름}.png">` 단일 태그
5. 그룹 내 텍스트는 `alt` 속성으로 보존

#### 3. SVG 에셋과 aspect-ratio
Figma MCP는 벡터 요소를 SVG로 반환. SVG는 `width="100%" height="100%"`이므로 **컨테이너에 `aspect-ratio` 필수**:
- `download-assets.js`가 SVG viewBox를 파싱하여 매니페스트에 `aspectRatio`, `width`, `height`를 자동 추가
- AI 검수 시 매니페스트의 `aspectRatio` 값을 CSS에 적용:
```css
/* 매니페스트: "aspectRatio": "699/322" */
.coupon-img { aspect-ratio: 699/322; }
```

#### 4. 플레이스홀더 에셋 감지 및 대체
`download-assets.js`가 자동으로 감지하는 플레이스홀더 에셋 (`placeholder: true`):
- 빈 SVG 프레임 (stroke-only, fill 없음)
- 1KB 미만의 비정상 파일
- **대응**: 해당 UI를 HTML/CSS로 직접 구현하거나, `get_screenshot`으로 래스터 이미지 캡처

#### 5. 에셋 다운로드 후 자동 처리 (download-assets.js)
- 파일 타입 감지 → 확장자 자동 보정 (.png→.svg 등)
- SVG viewBox 파싱 → 매니페스트에 `aspectRatio`, `width`, `height` 추가
- 플레이스홀더 SVG 감지 (stroke-only) → `placeholder: true` 플래그
- 매니페스트 항상 업데이트 (메타데이터 포함)
- HTML 파일의 이미지 참조 항상 동기화
- 비정상 파일 경고 출력

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

- Figma Pro/Org Dev seat 이상 권장 (Starter/View/Collab은 월 6회 API 제한)
- 프로모션/이벤트 단일 페이지에 최적화
