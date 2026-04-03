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

1. **MCP 호출**: `get_design_context`로 JSX 코드 + 스크린샷 획득
2. **타겟 확인**: 프레임 크기 표시 후 사용자에게 데스크탑/모바일/반응형 선택 요청
3. **JSX 저장**: MCP 코드를 `output/{프로젝트명}/source.jsx`에 Write
4. **기계 변환**: `node tools/jsx-to-html.js output/{프로젝트명}/source.jsx output/{프로젝트명}/index.html --wrap`
5. **CSS 추출**: `node tools/tailwind-to-css.js output/{프로젝트명}/index.html output/{프로젝트명}/styles.css`
6. **AI 검수/보정**: 변환 결과를 읽고, 타겟에 맞게 레이아웃 보정·누락 보완·이미지 경로 매핑
7. **에셋 다운로드**: `node tools/download-assets.js output/{프로젝트명}/`
8. **시각 검증**: `node tools/capture.js file://path/to/index.html output/{프로젝트명}/.preview.png {뷰포트너비}`

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
