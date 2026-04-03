# Figma-to-Code

Figma 디자인을 배포 가능한 HTML/CSS/JS로 변환하는 AI 에이전트.

## 사용법

- `/figma-to-code {URL}` 슬래시 커맨드 사용
- 또는 figma.com URL을 포함한 자연어 → `/figma-to-code`와 동일하게 동작

## 환경 설정

`.env` 파일에 Figma API 토큰 필요 (`.env.example` 참조):
```
FIGMA_TOKEN=your_figma_personal_access_token
```

## 프로젝트 구조

- `tools/` - 변환 도구 7개
  - `classify-nodes.js` — MCP JSX 자동 분석 → asset-plan.json (에셋 전략 분류)
  - `export-nodes.js` — Figma REST API로 노드 래스터 내보내기 (복합 이미지 해결)
  - `download-assets.js` — 에셋 병렬 다운로드 + 타입 감지 + HTML 동기화
  - `classify-html-assets.js` — 다운로드된 에셋 중 HTML 전환 대상 자동 분류 (테이블/리스트 감지)
  - `jsx-to-html.js` — MCP JSX → HTML 기계 변환 (참조용)
  - `tailwind-to-css.js` — Tailwind → CSS 추출 (참조용)
  - `capture.js` — Playwright 스크린샷 캡처 (검증용)
- `output/{프로젝트명}/` - 결과물
- `skills/figma-to-code/SKILL.md` - 상세 파이프라인 절차
