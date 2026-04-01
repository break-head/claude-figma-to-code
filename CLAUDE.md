# Figma-to-Code

Figma 디자인을 배포 가능한 HTML/CSS/JS로 변환하는 AI 에이전트입니다.

## 사용법

### 슬래시 커맨드 (권장)
```
/figma-to-code https://www.figma.com/design/xxxxx/Page?node-id=1-2
```

### 자연어로도 동작
사용자가 figma.com URL을 포함한 메시지를 보내면, `/figma-to-code` 커맨드와 동일하게 동작하세요.
예: "이 피그마 디자인 코드로 만들어줘 https://figma.com/design/..."

## 프로젝트 구조

- `tools/` - 후처리 파이프라인 도구들
  - `postprocess.js` - 오케스트레이터 (assemble -> tokens -> normalize -> download -> inject)
  - `assemble.js` - 섹션 HTML/CSS를 index.html + styles.css로 합침
  - `token-extractor.js` - Figma 데이터에서 디자인 토큰 추출
  - `normalize.js` - CSS 정규화 (하드코딩 색상을 변수로 교체)
  - `download-assets.js` - assets-manifest.json의 이미지 다운로드
  - `inject-ids.js` - HTML 요소에 data-element-id 삽입
  - `capture.js` - Playwright 스크린샷 캡처
  - `preview-server.js` - 라이브 리로드 프리뷰 서버 (port 3100)
- `output/` - 변환 결과물 디렉토리
  - `sections/` - 섹션별 HTML/CSS 파일
  - `assets/` - 다운로드된 이미지
  - `index.html`, `styles.css` - 최종 결과물

## 핵심 규칙

- Figma MCP의 `get_design_context` 도구를 사용하여 디자인 데이터를 가져온다
- 출력은 항상 Vanilla HTML/CSS/JS (프레임워크 없음)
- CSS 색상/폰트는 반드시 `:root` CSS 변수로 정의하고 참조
- 이미지는 `output/assets/` 에 저장, HTML에서 상대경로 참조
- 후처리는 `node tools/postprocess.js output/` 으로 실행
- 시각적 보정 루프: preview-server -> capture -> 비교 -> 수정 (최대 2회)
