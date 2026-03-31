# gemini advisor artifact

- Provider: gemini
- Exit code: 0
- Created at: 2026-03-30T15:32:07.041Z

## Original task

figma-to-code 스킬의 사용자 경험(UX) 관점 아이데이션을 해줘. 배경: Claude Code에서 Figma URL을 넣으면 HTML/CSS/JS를 자동 생성하는 스킬 플러그인이다. 현재 skills/figma-to-code/SKILL.md에 스킬이 정의되어 있고, .claude-plugin/plugin.json으로 플러그인 구조를 잡았다. 다음 관점에서 분석해줘: 1) 사용자 입장에서 가장 직관적인 설치 경험은? (한 줄 명령어? GitHub에서 클론? npm install?) 2) 실행 UX: '/figma <URL>' vs 자연어 'Figma 디자인을 코드로 만들어줘' vs URL 자동감지 중 뭐가 좋을까? 3) 출력물 전달 방식: output/ 폴더 생성 vs 현재 프로젝트에 통합 vs 임시 디렉토리 중 뭐가 자연스러운가? 4) 반응형/커스텀 옵션 물어보는 타이밍과 방식 5) 경쟁 도구(v0, Bolt, Anima 등) 대비 차별점이 될 수 있는 UX 아이디어 6) 초보자와 숙련자 모두 만족시키는 경험 설계

## Final prompt

figma-to-code 스킬의 사용자 경험(UX) 관점 아이데이션을 해줘. 배경: Claude Code에서 Figma URL을 넣으면 HTML/CSS/JS를 자동 생성하는 스킬 플러그인이다. 현재 skills/figma-to-code/SKILL.md에 스킬이 정의되어 있고, .claude-plugin/plugin.json으로 플러그인 구조를 잡았다. 다음 관점에서 분석해줘: 1) 사용자 입장에서 가장 직관적인 설치 경험은? (한 줄 명령어? GitHub에서 클론? npm install?) 2) 실행 UX: '/figma <URL>' vs 자연어 'Figma 디자인을 코드로 만들어줘' vs URL 자동감지 중 뭐가 좋을까? 3) 출력물 전달 방식: output/ 폴더 생성 vs 현재 프로젝트에 통합 vs 임시 디렉토리 중 뭐가 자연스러운가? 4) 반응형/커스텀 옵션 물어보는 타이밍과 방식 5) 경쟁 도구(v0, Bolt, Anima 등) 대비 차별점이 될 수 있는 UX 아이디어 6) 초보자와 숙련자 모두 만족시키는 경험 설계

## Raw output

```text
MCP issues detected. Run /mcp list for status.현재 작성하신 `skills/figma-to-code/SKILL.md`와 플러그인 구조를 바탕으로, CLI 기반 AI 에이전트(Claude Code 등) 환경에 최적화된 UX 아이데이션을 6가지 관점에서 정리해 드립니다.

CLI 환경에서는 웹 기반 서비스(v0, 웹용 Claude 등)와 달리 **'로컬 파일시스템에 대한 직접적인 제어'**와 **'개발자의 기존 워크플로우에 자연스럽게 녹아드는 것'**이 가장 중요합니다.

---

### 1. 직관적인 설치 경험 (Installation UX)
현재 `.claude-plugin` 구조를 사용하고 계신데, CLI 사용자에게 가장 친숙한 방식은 **명시적이지만 극도로 짧은 명령어**입니다.

*   **Best Practice:** `claude plugin install figma-to-code` (npm이나 git clone보다 에이전트 네이티브한 명령어 제공)
*   **Magic UX (자동 제안):** 사용자가 플러그인이 없는 상태에서 실수로(또는 무심코) Figma 링크를 붙여넣었을 때, 단순 에러를 뱉는 대신 다음과 같이 묻는 것이 최고의 UX입니다.
    > 💡 "Figma 링크가 감지되었습니다. 이 디자인을 HTML/CSS로 바로 변환해 주는 `figma-to-code` 스킬을 설치할까요? (Y/n)"

### 2. 실행 UX: URL 감지 vs 자연어 vs 명령어
세 가지 방식은 상호 배타적이지 않으며, 사용자 숙련도에 따라 다르게 쓰이도록 **하이브리드(Hybrid)**로 지원하는 것이 좋습니다.

*   **자연어 + URL 감지 (초보자 & 일반적 사용):** "이 링크 코드로 짜줘 figma.com/..."
    *   가장 자연스럽습니다. URL만 덜렁 입력했을 때는 "Figma 링크네요. 디자인을 코드로 변환해 드릴까요?" 하고 Intent(의도)를 한 번 확인하는 것이 좋습니다. (단순히 링크 내용만 요약해 달라는 의도일 수 있으므로)
*   **`/figma <URL>` 명시적 명령어 (숙련자용 Shortcut):**
    *   AI의 의도 파악 시간을 기다리기 싫은 개발자를 위한 'Fast Track'입니다. `/figma <URL> --react --responsive` 처럼 뒤에 플래그나 추가 지시를 붙이기 용이합니다.

### 3. 출력물 전달 방식 (Output Directory)
현재 `SKILL.md`의 `output/` 폴더 생성 방식은 안전하지만, 여러 번 변환할 경우 덮어씌워지거나 관리가 어려워질 수 있습니다. **'컨텍스트 인지형(Context-aware)'** 방식이 가장 자연스럽습니다.

*   **현재 프로젝트 빈 폴더인 경우:** 현재 위치에 생성하되, `figma-export/` 또는 프레임 이름(예: `hero-section/`)으로 폴더명을 명확히 합니다.
*   **기존 프로젝트(예: React, Next.js 등) 내부인 경우 (추천 UX):**
    *   무작정 섞지 않고 샌드박싱합니다.
    *   > "현재 프로젝트에 코드를 추가합니다. 안전을 위해 `src/figma-components/[프레임명]/` 경로에 생성했습니다."
*   **임시 디렉토리:** 결과물 미리보기(`npx live-server`) 용도로는 좋지만, 결국 개발자가 코드를 자기 프로젝트로 옮겨야 하는 번거로움이 생기므로 CLI 도구의 장점이 퇴색됩니다.

### 4. 반응형/커스텀 옵션 물어보는 타이밍과 방식
현재 `SKILL.md` (Step 3) 에서는 프레임 크기를 보고 사용자에게 데스크톱/모바일 여부를 묻습니다. 하지만 CLI 환경에서 **작업 중간에 흐름을 끊고 질문하는 것은 피로도를 높입니다.**

*   **Zero-shot 기본 생성 + Follow-up 제안 (Progressive Disclosure):**
    *   질문 없이 일단 **Figma 원본 크기(Desktop)를 기준으로 완벽한 초안을 빠르게 뽑아냅니다.**
    *   결과 출력 시 팁으로 후속 조치를 유도합니다.
    > ✅ `output/`에 코드가 생성되었습니다. (미리보기: `npx live-server output/`)
    > 💡 **Tip:** 모바일 화면도 필요하신가요? *"모바일 반응형으로 수정해줘"* 또는 *"테일윈드 CSS로 바꿔줘"* 라고 말씀해 보세요.

### 5. 경쟁 도구(v0, Bolt, Anima) 대비 차별점 UX
웹 기반 생성 AI나 기존 플러그인들이 주지 못하는 **CLI AI 에이전트만의 강력한 차별점**을 강조해야 합니다.

*   **로컬 컨텍스트 동기화 (초격차):** v0나 Bolt는 내 프로젝트의 디자인 시스템을 모릅니다. figma-to-code는 현재 로컬 디렉토리의 `tailwind.config.js`나 `globals.css`를 읽고, **"기존 프로젝트의 색상 변수(`var(--primary)`)와 폰트를 100% 재사용하여"** 코드를 짜준다는 점이 최고의 무기입니다.
*   **Clean Code (유지보수성):** Anima 등은 절대 좌표(`position: absolute`)를 남발하여 쓰레기 코드를 생성하는 경우가 많습니다. `SKILL.md`에 명시된 "Semantic HTML, Flex/Grid 기반, 불필요한 div 제거" 규칙은 개발자들에게 엄청난 셀링 포인트입니다. 이 부분을 완료 메시지에서 어필하면 좋습니다. (예: *"Flexbox 기반의 시맨틱 HTML로 깔끔하게 작성되었습니다."*)
*   **즉각적인 부분 수정 루프:** 브라우저 탭을 오갈 필요 없이, 터미널에서 *"방금 만든 파일에서 버튼 여백만 2배로 늘려"* 라고 하면 로컬 파일이 바로 수정되는 경험.

### 6. 초보자와 숙련자 모두 만족시키는 경험 설계 (Dual Persona)

*   **초보자 (The "Make it work" user):**
    *   **가이드 중심:** 완료 후 어떻게 실행해봐야 하는지(`npx live-server` 안내 등) 명확히 알려줍니다.
    *   **방어적 코드:** 기존 코드를 덮어쓰지 않도록 항상 격리된 폴더(`output/`)에 결과를 담아줍니다.
*   **숙련자 (The "Make it mine" user):**
    *   **투명성 & 제어권:** 숙련자는 AI가 내 파일을 마음대로 헤집는 것을 두려워합니다. 수정 워크플로우 시 *"index.html의 45~60라인의 `<header>` 태그를 수정합니다"* 라고 명시적으로 알려주는 UX가 필요합니다.
    *   **인라인 프롬프팅 지원:** `/figma <URL> --framework react --styling tailwind --dest ./src/components/Hero` 처럼, 대화를 생략하고 한 줄로 모든 컨텍스트를 주입할 수 있는 파워 유저용 문법을 지원하면 완벽합니다.

---
**💡 요약하자면 현재 `SKILL.md`의 방향성은 매우 훌륭합니다.**
여기서 작업 중간의 질문(Step 3)을 과감히 줄여 **'One-shot 생성 + 대화형 수정'** 구조로 가져가고, 생성된 코드가 **'개발자가 직접 짠 것 같은 Clean Code'**라는 점을 UX 상에서 (안내 메시지 등을 통해) 적극적으로 인지시켜 주시면 압도적인 스킬이 될 것입니다.


YOLO mode is enabled. All tool calls will be automatically approved.
YOLO mode is enabled. All tool calls will be automatically approved.
[MCP error] Error during discovery for MCP server 'context7': MCP error -32000: Connection closed McpError: MCP error -32000: Connection closed
    at McpError.fromError (file:///Users/leejuhwan/.nvm/versions/node/v22.17.0/lib/node_modules/@google/gemini-cli/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js:2035:16)
    at Client._onclose (file:///Users/leejuhwan/.nvm/versions/node/v22.17.0/lib/node_modules/@google/gemini-cli/node_modules/@modelcontextprotocol/sdk/dist/esm/shared/protocol.js:259:32)
    at _transport.onclose (file:///Users/leejuhwan/.nvm/versions/node/v22.17.0/lib/node_modules/@google/gemini-cli/node_modules/@modelcontextprotocol/sdk/dist/esm/shared/protocol.js:223:18)
    at ChildProcess.<anonymous> (file:///Users/leejuhwan/.nvm/versions/node/v22.17.0/lib/node_modules/@google/gemini-cli/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js:85:31)
    at ChildProcess.emit (node:events:518:28)
    at maybeClose (node:internal/child_process:1101:16)
    at ChildProcess._handle.onexit (node:internal/child_process:304:5) {
  code: -32000,
  data: undefined
}
Server 'chrome-devtools' supports tool updates. Listening for changes...

```

## Concise summary

Provider completed successfully. Review the raw output for details.

## Action items

- Review the response and extract decisions you want to apply.
- Capture follow-up implementation tasks if needed.
