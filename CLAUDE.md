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

## 아키텍처

Mechanical-First Pipeline: MCP 데이터를 기계적으로 변환 후, AI가 검수/보정한다.

```
Figma URL → MCP(스크린샷+JSX) → 타겟 확인(데스크탑/모바일/반응형) → jsx-to-html → tailwind-to-css → AI 검수 → download-assets → capture 검증
```

## 프로젝트 구조

- `tools/` - 변환 파이프라인 도구
  - `jsx-to-html.js` - MCP JSX → HTML 기계 변환
  - `tailwind-to-css.js` - Tailwind 클래스 → CSS 추출 (v4 CLI)
  - `download-assets.js` - assets-manifest.json의 이미지 병렬 다운로드
  - `capture.js` - Playwright 스크린샷 캡처 (검증용)
- `output/{프로젝트명}/` - 변환 결과물 디렉토리
  - `source.jsx` - MCP 원본 코드 (참조용)
  - `index.html` - 변환된 HTML
  - `styles.css` - 추출된 CSS
  - `script.js` - JS (필요시)
  - `assets/` - 다운로드된 이미지
  - `assets-manifest.json` - 이미지 URL-파일명 매핑

## 핵심 규칙

- Figma MCP의 `get_design_context`로 디자인 데이터를 가져온다
- **타겟 확인 필수**: MCP 호출 후 사용자에게 데스크탑/모바일/반응형 선택을 받는다. 프레임 크기로 자동 판단하지 않는다
- **MCP 데이터가 모든 판단의 기준** (스크린샷=시각, JSX=데이터)
- **기계 변환 우선**: JSX→HTML, Tailwind→CSS는 도구가 처리
- **AI는 검수자**: 변환 결과의 누락/오류만 수정, 전체 재작성 금지
- 출력은 항상 Vanilla HTML/CSS/JS (프레임워크 없음)
- JSX→HTML: `node tools/jsx-to-html.js output/{프로젝트명}/source.jsx output/{프로젝트명}/index.html --wrap`
- CSS 추출: `node tools/tailwind-to-css.js output/{프로젝트명}/index.html output/{프로젝트명}/styles.css`
- 이미지 다운로드: `node tools/download-assets.js output/{프로젝트명}/`
- 시각 검증: `node tools/capture.js file://path/to/index.html output/{프로젝트명}/.preview.png {뷰포트너비}`
