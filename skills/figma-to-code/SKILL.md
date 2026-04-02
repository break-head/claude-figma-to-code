---
name: figma-to-code
description: Figma URL을 넣으면 배포 가능한 HTML/CSS/JS를 생성합니다. "figma", "피그마", "디자인을 코드로", "HTML로 만들어줘", "figma.com" URL이 포함된 요청에 사용됩니다.
---

# Figma-to-Code v2

Figma 디자인 URL을 받아 배포 가능한 Vanilla HTML/CSS/JS 단일 페이지를 생성한다.
자동 변환 파이프라인과 AI 자율 보정 루프로 Figma 원본에 가까운 결과를 보장한다.

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

### Step 3: 자동 변환

전체 파이프라인을 한 번에 실행:

```bash
node tools/postprocess.js output/
```

파이프라인 순서: parse-jsx → convert-to-html → download-assets → inject-ids

개별 도구를 단계별로 실행할 수도 있다:

```bash
# 1. JSX 파싱 — 이미지, 토큰, 메타 정보 확인
node tools/parse-jsx.js output/.mcp-source.jsx

# 2. HTML/CSS 생성
node tools/convert-to-html.js output/

# 3. 이미지 다운로드
node tools/download-assets.js output/

# 4. 요소 ID 삽입
node tools/inject-ids.js output/
```

모든 도구는 JSON을 stdout으로 출력한다: `{ ok, data, warnings }`

**변환 규칙 (자동 처리):**

`convert-to-html`이 다음을 자동으로 처리한다:
- Tailwind 유틸리티 클래스 → Vanilla CSS 변환
- 절대 좌표 → 레이아웃 의도 추론 (Flexbox/Grid)
- 색상/폰트/간격 → `:root` CSS 변수 정의 및 참조
- 이미지 크롭 좌표 보존 (overflow:hidden + 퍼센트 기반 포지셔닝)

### Step 4: AI 자율 보정 루프

1. 프리뷰 서버 기동:
```bash
node tools/preview-server.js output/
```

2. 스크린샷 캡처 (Figma 프레임과 동일한 width 사용):
```bash
node tools/capture.js http://localhost:3100 output/.preview-screenshot.png <width>
```

3. Read 도구로 `output/.preview-screenshot.png` 읽기
4. Step 2에서 대화 컨텍스트에 유지 중인 Figma MCP 스크린샷과 비교 (AI 비전)
5. 차이 유형에 따라 수정 방법을 선택:
   - **구조 문제** → overrides JSON을 작성하고 `convert-to-html` 재실행
   - **스타일 문제** → `output/styles.css` 직접 편집
   - **이미지 문제** → 크롭 좌표 수정 또는 재다운로드
6. 수정 후 `node tools/postprocess.js output/` 재실행 → 재캡처 → 재비교
7. **픽셀 퍼펙트에 도달할 때까지 반복** (횟수 제한 없음)

검증 도구:
```bash
node tools/validate.js output/ http://localhost:3100
```

### Step 5: 결과 안내

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
