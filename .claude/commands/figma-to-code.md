Figma URL을 받아 배포 가능한 HTML/CSS/JS + assets를 생성하는 AI 에이전트입니다.

사용자 입력: $ARGUMENTS

---

## 실행 절차

### 1. URL 파싱

$ARGUMENTS에서 Figma URL을 추출한다.
- `figma.com/design/:fileKey/:fileName?node-id=:nodeId` -> nodeId의 `-`를 `:`로 변환
- `figma.com/file/:fileKey/:fileName?node-id=:nodeId` -> 동일
- `figma.com/design/:fileKey/branch/:branchKey/:fileName` -> branchKey를 fileKey로 사용

URL이 없거나 node-id가 없으면:
> "변환할 Figma 프레임 URL을 알려주세요. Figma에서 프레임을 선택하고 우클릭 -> 'Copy link to selection'으로 복사할 수 있습니다."

**프로젝트명 결정:**
- URL의 fileName 부분에서 추출 (하이픈/언더스코어 정리)
- 또는 사용자가 지정한 이름 사용
- 출력 디렉토리: `output/{프로젝트명}/`

### 2. Figma MCP로 디자인 데이터 수집

1. `get_design_context`(fileKey, nodeId) 호출
2. 반환 데이터:
   - **스크린샷** — 디자인의 시각적 진실. 레이아웃, 정렬, 간격 판단의 최종 기준
   - **React+Tailwind JSX 코드** — 데이터 소스. 텍스트 내용, 이미지 URL, 색상값, 폰트명 추출용
   - **메타데이터** — 프레임 크기, 컴포넌트 정보
3. 스크린샷은 대화 컨텍스트에 유지 (보정 루프 레퍼런스)

**중요: MCP 데이터가 모든 판단의 기준이다.**
- 스크린샷 = 레이아웃/정렬/간격의 진실
- JSX 코드 = 텍스트/색상/이미지/폰트의 진실
- 이 둘이 충돌하면 스크린샷을 우선한다 (시각적 결과가 최종 목표)

### 3. 타겟 확인 (사용자 컨펌 필수)

MCP 데이터를 가져온 후, 반드시 사용자에게 질문한다:

```
Figma 디자인을 가져왔습니다. (프레임 크기: {width}×{height})

이 디자인의 타겟은 무엇인가요?
1. 데스크탑
2. 모바일
3. 반응형 (모바일 프레임 URL 추가 입력)
```

**사용자 응답에 따른 분기:**

| 선택 | 동작 |
|---|---|
| **1. 데스크탑** | 데스크탑 레이아웃으로 진행. `max-width: {프레임너비}px`, `margin: 0 auto` |
| **2. 모바일** | 모바일 레이아웃으로 진행. `max-width: 480px`, `margin: 0 auto` |
| **3. 반응형** | 모바일 프레임 URL을 추가로 입력받고, 두 번째 MCP 호출 후 반응형 생성 |

**중요: 프레임 픽셀 크기로 자동 판단하지 않는다.** 1440px 프레임이 모바일 디자인일 수도, 375px 프레임이 데스크탑 디자인일 수도 있다. 반드시 사용자가 선택한다.

### 4. 기계 변환 (도구 사용)

MCP JSX 코드를 `output/{프로젝트명}/source.jsx`에 Write로 저장한 후, 도구로 기계 변환한다.

#### 단일 타겟 (데스크탑 또는 모바일)

```bash
# JSX → HTML 변환
node tools/jsx-to-html.js output/{프로젝트명}/source.jsx output/{프로젝트명}/index.html --wrap

# Tailwind → CSS 추출
node tools/tailwind-to-css.js output/{프로젝트명}/index.html output/{프로젝트명}/styles.css
```

#### 반응형 (두 프레임)

```bash
# 데스크탑 JSX → HTML
node tools/jsx-to-html.js output/{프로젝트명}/source.jsx output/{프로젝트명}/index.html --wrap

# 모바일 JSX → HTML (참조용)
node tools/jsx-to-html.js output/{프로젝트명}/source-mobile.jsx output/{프로젝트명}/mobile-ref.html --wrap

# 데스크탑 기준 CSS 추출
node tools/tailwind-to-css.js output/{프로젝트명}/index.html output/{프로젝트명}/styles.css
```

### 5. AI 검수/보정

기계 변환 결과를 Read로 읽고 검수한다. **전체 재작성 금지. 누락/오류만 수정한다.**

#### 공통 검수 항목

- **구조**: 스크린샷과 HTML 구조가 일치하는가?
- **텍스트**: MCP JSX의 텍스트가 정확히 반영되었는가?
- **이미지**: `assets-manifest.json` 생성. 이미지 경로를 `assets/{filename}`으로 매핑
- **스타일 보완**: absolute 좌표를 flexbox/grid로 대체, 색상 변수화, 폰트 정리

#### 타겟별 레이아웃 보정

**데스크탑:**
- 루트에 `max-width: {프레임너비}px`, `margin: 0 auto` 적용
- 스크린샷 기준으로 flexbox/grid 레이아웃 정리

**모바일:**
- 루트에 `max-width: 480px`, `margin: 0 auto` 적용
- 스크린샷 기준으로 세로 스택 레이아웃 정리

**반응형:**
1. 데스크탑 HTML을 기본 구조로 사용
2. 모바일 참조 HTML(`mobile-ref.html`)과 스크린샷을 비교하여 차이점 파악
3. 데스크탑 CSS를 기본으로 하고, `@media (max-width: 768px)`로 모바일 오버라이드 추가
4. 공통 HTML 구조 통합 (모바일에서만 보이는 요소는 `display: none` ↔ `display: block` 전환)
5. 완료 후 `mobile-ref.html` 삭제

#### CSS 생성 규칙

```css
/* Reset */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* Design Tokens */
:root {
  /* Colors - MCP JSX의 hex 값에서 추출 */
  --color-primary: #...;
  --color-bg: #...;

  /* Fonts - MCP JSX의 font-family에서 추출 */
  --font-heading: '...', sans-serif;
  --font-body: '...', sans-serif;

  /* Spacing - 스크린샷에서 관찰된 간격 패턴 */
  --space-sm: ...px;
  --space-md: ...px;
  --space-lg: ...px;
}
```

- **색상**: 모든 색상은 `:root` 변수로 정의하고 `var()`로 참조. 하드코딩 금지
- **폰트**: CSS 변수로 정의. **font-weight를 반드시 명시적으로 지정**
- **레이아웃**: Flexbox 또는 CSS Grid. **절대좌표(position: absolute) 사용 금지**
  - MCP JSX의 `absolute`, `left-[px]`, `top-[px]`를 그대로 옮기지 않는다. 스크린샷을 보고 의도를 추론한다
- **이미지 크롭/마스크**: MCP JSX의 퍼센트 기반 크롭 패턴은 그대로 vanilla CSS로 변환 (`object-fit: cover`로 대체 금지)

#### 이미지 처리 규칙

MCP JSX에서 모든 `<img>` 태그의 src URL을 추출하여 `assets-manifest.json`을 생성:

```json
[
  { "url": "https://figma-alpha-api.s3...", "filename": "hero-image.png" },
  { "url": "https://figma-alpha-api.s3...", "filename": "logo.svg" }
]
```

- filename은 의미 있는 이름으로 지정 (hero-image, team-photo-1, logo 등)
- HTML에서는 `assets/{filename}`으로 참조

#### JS 생성 규칙

- 인터랙션이 필요할 때만 `script.js` 생성
- Vanilla JS만 사용. 프레임워크/라이브러리 없음
- index.html 하단에 `<script src="script.js"></script>` 추가

### 6. 에셋 다운로드

```bash
node tools/download-assets.js output/{프로젝트명}/
```

### 7. 시각적 검증 루프

#### 단일 타겟

1. 캡처:
```bash
# 데스크탑: 프레임 너비로 캡처
node tools/capture.js file://$(pwd)/output/{프로젝트명}/index.html output/{프로젝트명}/.preview.png {프레임너비}

# 모바일: 480px로 캡처
node tools/capture.js file://$(pwd)/output/{프로젝트명}/index.html output/{프로젝트명}/.preview.png 480
```

2. Read로 `.preview.png` 확인
3. MCP 원본 스크린샷과 비교
4. 차이가 있으면 Edit으로 수정 → 재캡처 (최대 2회)

#### 반응형

1. 데스크탑 캡처:
```bash
node tools/capture.js file://$(pwd)/output/{프로젝트명}/index.html output/{프로젝트명}/.preview-desktop.png {데스크탑프레임너비}
```

2. 모바일 캡처:
```bash
node tools/capture.js file://$(pwd)/output/{프로젝트명}/index.html output/{프로젝트명}/.preview-mobile.png 480
```

3. 각각 원본 스크린샷과 비교 → 수정 → 재캡처 (최대 2회)

### 8. 결과 안내

```
변환 완료!

output/{프로젝트명}/index.html  — 메인 HTML
output/{프로젝트명}/styles.css  — 스타일시트
output/{프로젝트명}/assets/     — 이미지 에셋

수정하려면 이 대화에서 바로 요청하세요:
  "배경색을 파란색으로 바꿔줘"
  "버튼 텍스트를 '시작하기'로 변경해줘"
```

## 수정 워크플로우

사용자가 수정을 요청하면:
1. `output/{프로젝트명}/` 폴더의 해당 파일을 Read로 읽는다
2. 정확한 위치를 찾아 Edit으로 수정한다
3. CSS 변수 체계를 유지한다 (색상 변경 시 `:root` 변수를 수정)

## 핵심 원칙

1. **MCP 데이터가 기준**: 모든 판단은 MCP가 반환한 스크린샷과 JSX 코드를 기준으로 한다
2. **사용자 컨펌 필수**: 타겟(데스크탑/모바일/반응형)은 반드시 사용자가 선택한다. 프레임 크기로 자동 판단하지 않는다
3. **기계 변환 우선**: jsx-to-html, tailwind-to-css 도구가 1차 변환. AI는 검수/보정만 담당
4. **AI는 검수자**: 변환 결과의 누락/오류만 수정. 전체 재작성 금지
5. **스크린샷이 시각적 진실**: 레이아웃/정렬/간격은 스크린샷을 보고 판단. JSX의 absolute 좌표를 맹목적으로 따르지 않는다
6. **JSX가 데이터 진실**: 텍스트 내용, 색상 hex, 이미지 URL, 폰트명은 JSX에서 정확히 추출한다
