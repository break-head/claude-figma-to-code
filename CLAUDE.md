# Figma-to-Code

Figma 디자인을 배포 가능한 HTML/CSS/JS로 변환하는 AI 에이전트.

## 사용법

- `/figma-to-code {URL}` 슬래시 커맨드 사용
- 또는 figma.com URL을 포함한 자연어 → `/figma-to-code`와 동일하게 동작

## 프로젝트 구조

- `tools/` - 변환 도구 (jsx-to-html, tailwind-to-css, download-assets, capture)
- `output/{프로젝트명}/` - 결과물
- `.claude/commands/figma-to-code.md` - 상세 파이프라인 절차
