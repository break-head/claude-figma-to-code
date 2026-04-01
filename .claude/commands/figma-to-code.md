Figma URL을 받아 배포 가능한 Vanilla HTML/CSS/JS 단일 페이지를 생성하는 에이전트입니다.

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

### 2. Figma MCP로 디자인 데이터 수집

1. `get_design_context`(fileKey, nodeId) 호출 -> React+Tailwind 코드 + 스크린샷
2. 반환된 코드를 `output/.mcp-source.jsx`에 Write 도구로 저장
3. MCP 응답 원본 데이터를 `output/.figma-data.json`에 저장
4. 반환된 스크린샷은 대화 컨텍스트에 유지 (보정 루프 레퍼런스)

### 3. 섹션 식별

MCP 코드를 읽고 최상위 컴포넌트/섹션을 구분한다:
- 최상위 JSX의 직접 자식 요소들을 섹션으로 식별
- 각 섹션에 이름 부여 (hero, features, cta, footer 등)
- 섹션 목록을 사용자에게 보여주고 확인
  > "4개 섹션으로 나눕니다: Hero, Features, CTA, Footer -- 맞나요?"

### 4. 섹션별 변환

각 섹션마다 MCP의 React+Tailwind 코드를 바닐라 HTML + CSS로 변환한다.

**HTML 규칙:**
- 시맨틱 HTML5 태그: `<header>`, `<nav>`, `<main>`, `<section>`, `<footer>`
- BEM 스타일 클래스명: `.hero`, `.hero__title`, `.hero__cta`
- 이미지는 `assets/` 상대경로: `<img src="assets/hero.png">`

**CSS 규칙:**
- `:root`에 디자인 토큰을 CSS 변수로 정의 (색상, 폰트, 간격)
- 색상/폰트 하드코딩 금지 -- 반드시 CSS 변수 참조
- Flexbox 또는 CSS Grid로 레이아웃

**JS:** 인터랙션이 필요할 때만 생성. Vanilla JS만 사용.

**이미지:**
- Figma에서 이미지 URL 수집 -> `output/assets-manifest.json`에 목록 작성:
  ```json
  [{ "url": "https://figma-image-url/...", "filename": "hero.png" }]
  ```

**저장:**
- `output/sections/01-hero.html` + `output/sections/01-hero.css`
- `output/sections/02-features.html` + `output/sections/02-features.css`
- 번호 순서 = 페이지 내 배치 순서

### 5. 후처리 파이프라인

```bash
node tools/postprocess.js output/
```

자동 수행: 섹션 합침 -> 토큰 추출 -> CSS 정규화 -> 이미지 다운로드 -> ID 삽입

### 6. 시각적 보정 루프

1. 프리뷰 서버 기동:
```bash
node tools/preview-server.js output/ &
```

2. 스크린샷 캡처:
```bash
node tools/capture.js http://localhost:3100 output/.preview-screenshot.png
```

3. Read 도구로 `output/.preview-screenshot.png`을 읽어서 Figma 원본 스크린샷과 비교
4. 차이가 있으면 해당 섹션 파일 수정 -> postprocess 재실행 -> 재캡처 -> 재비교
5. **최대 2회 반복**. 2회 후에도 차이가 있으면 남은 차이점을 사용자에게 리포트

### 7. 결과 안내

```
변환 완료!

output/index.html -- 메인 HTML
output/styles.css -- 스타일시트
output/assets/    -- 이미지 에셋

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
