# codex advisor artifact

- Provider: codex
- Exit code: 0
- Created at: 2026-03-30T15:31:43.554Z

## Original task

figma-to-code 스킬 플러그인의 배포/실행 방식 아이데이션을 해줘. 현재 상태: /Users/leejuhwan/Desktop/figma-to-code 에 skills/figma-to-code/SKILL.md 와 .claude-plugin/plugin.json이 있다. 이 스킬은 Figma URL을 받아 Vanilla HTML/CSS/JS를 생성하는 Claude Code 스킬이다. 질문: Claude Code 사용자가 이 스킬을 가장 쉽게 설치하고 실행할 수 있는 방법은? 다음 관점에서 분석해줘: 1) Claude Code 스킬 배포 메커니즘 (로컬 스킬 vs 플러그인 마켓플레이스 vs npm 패키지 vs git clone) 2) 각 방식의 기술적 장단점과 구현 복잡도 3) Figma MCP 의존성 처리 방법 4) 실행 트리거 방식 (슬래시 커맨드, 자연어, URL 자동감지 등) 5) 추천 아키텍처와 디렉토리 구조

## Final prompt

figma-to-code 스킬 플러그인의 배포/실행 방식 아이데이션을 해줘. 현재 상태: /Users/leejuhwan/Desktop/figma-to-code 에 skills/figma-to-code/SKILL.md 와 .claude-plugin/plugin.json이 있다. 이 스킬은 Figma URL을 받아 Vanilla HTML/CSS/JS를 생성하는 Claude Code 스킬이다. 질문: Claude Code 사용자가 이 스킬을 가장 쉽게 설치하고 실행할 수 있는 방법은? 다음 관점에서 분석해줘: 1) Claude Code 스킬 배포 메커니즘 (로컬 스킬 vs 플러그인 마켓플레이스 vs npm 패키지 vs git clone) 2) 각 방식의 기술적 장단점과 구현 복잡도 3) Figma MCP 의존성 처리 방법 4) 실행 트리거 방식 (슬래시 커맨드, 자연어, URL 자동감지 등) 5) 추천 아키텍처와 디렉토리 구조

## Raw output

```text
현재 구조를 보면 스킬 본체는 [SKILL.md](/Users/leejuhwan/Desktop/figma-to-code/skills/figma-to-code/SKILL.md), 플러그인 매니페스트는 [plugin.json](/Users/leejuhwan/Desktop/figma-to-code/.claude-plugin/plugin.json)만 있는 최소 형태입니다. 이 상태에서 Claude Code 사용자에게 가장 쉽게 배포하려면, 결론은 `단일 플러그인 repo`보다 `플러그인 마켓플레이스 repo + figma-to-code plugin` 구조가 가장 낫습니다.

1. Claude Code 스킬 배포 메커니즘
- `로컬 스킬` (`~/.claude/skills` 또는 프로젝트 `.claude/skills`): 가장 단순하지만 설치가 수동 복붙 수준이라 배포성이 약합니다.
- `플러그인 마켓플레이스`: 현재 Claude Code의 공식 배포 표면입니다. 사용자는 `/plugin marketplace add ...` 후 `/plugin install figma-to-code@marketplace`로 설치하고, 이후 `plugin update`까지 일관되게 갑니다.
- `npm 패키지`: Claude Code는 플러그인을 직접 npm에서 “찾아” 설치하는 게 아니라, 마켓플레이스 항목의 `source`로 npm을 참조하는 구조입니다. 즉 npm은 배포 백엔드일 뿐, UX 전면은 아닙니다.
- `git clone`: 개발자 친화적이지만 일반 사용자 UX는 나쁩니다. `claude --plugin-dir` 같은 개발/테스트 용도에는 좋고, 배포 기본값으로는 부적절합니다.

2. 기술적 장단점과 구현 복잡도
- 로컬 스킬
  - 장점: 구현 0에 가깝고 즉시 사용 가능.
  - 단점: 업데이트, 버전관리, 의존성 안내, 팀 배포가 약함.
  - 복잡도: 매우 낮음.
- 마켓플레이스
  - 장점: 공식 설치/업데이트 플로우, 버전관리, 팀 공유, 캐시/스코프 관리가 맞물립니다.
  - 단점: `.claude-plugin/marketplace.json` 추가와 배포 구조 재편이 필요.
  - 복잡도: 중간.
- npm source
  - 장점: semver, registry 배포, private registry 지원.
  - 단점: 이 플러그인은 프롬프트/스킬 중심이라 npm의 장점이 작고, publish 파이프라인만 늘어납니다.
  - 복잡도: 중간 이상.
- git clone
  - 장점: 가장 투명하고 디버그 쉬움.
  - 단점: 사용자가 설치/업데이트를 직접 관리해야 함.
  - 복잡도: 낮지만 사용자 경험이 나쁨.

3. Figma MCP 의존성 처리
- 권장 기본값은 `공식 remote Figma MCP`를 전제로 하는 것입니다. Figma는 remote server를 preferred로 안내하고, endpoint는 `https://mcp.figma.com/mcp`입니다.
- 설치 방식은 3가지가 있습니다.
  - 플러그인에 `.mcp.json`을 번들: 가장 쉬운 UX. 플러그인 enable 시 Figma MCP도 같이 잡히고, 사용자는 `/mcp`에서 인증만 하면 됩니다.
  - 사용자 수동 등록: `claude mcp add --transport http --scope user figma https://mcp.figma.com/mcp`. 가장 안전하지만 설치 단계가 하나 늘어납니다.
  - 프로젝트 `.mcp.json`: 팀 repo에는 좋지만, Figma 인증이 개인 계정 단위라 개인용 배포에는 과합니다.
- 추천은 `플러그인 번들 + 수동 fallback`입니다.
- 주의: Figma 요금제/seat에 따라 호출 제한이 큽니다. Starter/View/Collab은 월 6회 수준이라 사실상 이 스킬과 궁합이 약합니다. Pro/Org의 Dev/Full seat 이상을 사실상 권장해야 합니다.

4. 실행 트리거 방식
- 1순위: 명시적 슬래시 커맨드 `/figma-to-code <figma-url>`
  - 가장 예측 가능하고 데모하기 쉽습니다.
  - `argument-hint: [figma-url]`를 넣는 게 좋습니다.
- 2순위: 자연어 트리거
  - 설명문에 “Figma URL”, “HTML/CSS/JS”, “landing page”, “design to code” 같은 실제 사용자 표현을 넣으면 자동 발화가 잘 됩니다.
- 3순위: URL 자동감지
  - 가능하지만 단독 트리거로 두면 과발동 위험이 있습니다.
  - 추천은 “Figma URL이 있고, 동시에 코드 생성 의도가 있는 자연어”일 때만 자동 트리거되도록 설명문을 다듬는 것입니다.
- 현재 [SKILL.md](/Users/leejuhwan/Desktop/figma-to-code/skills/figma-to-code/SKILL.md)의 `aliases` 필드는 공식 frontmatter 목록에 없습니다. 즉 실제로는 무시될 가능성이 높습니다. 별칭에 기대지 말고 `description`과 예시에 키워드를 넣는 쪽이 안전합니다.

5. 추천 아키텍처와 디렉토리 구조
- 추천 아키텍처:
  - `배포는 marketplace`
  - `실행은 plugin skill`
  - `Figma MCP는 plugin-bundled remote MCP + /mcp 인증`
  - `로컬 git clone + --plugin-dir`는 개발자용 테스트 경로로만 유지
- 추천 구조:
```text
figma-to-code-marketplace/
├── .claude-plugin/
│   └── marketplace.json
└── plugins/
    └── figma-to-code/
        ├── .claude-plugin/
        │   └── plugin.json
        ├── .mcp.json
        ├── skills/
        │   └── figma-to-code/
        │       ├── SKILL.md
        │       ├── references/
        │       │   ├── figma-url-parsing.md
        │       │   └── output-contract.md
        │       └── scripts/
        │           └── validate-output.sh
        └── commands/
            └── figma-mcp-setup.md
```
- `plugin.json`에는 최소한 `name`, `description`, `version`, `skills`를 넣고, 가능하면 `homepage`, `repository`, `keywords`, `license`도 넣는 편이 좋습니다.
- `SKILL.md`는 500줄 이하로 유지하고, URL 파싱 규칙/출력 계약/반응형 정책은 `references/`로 분리하는 게 좋습니다.
- `commands/figma-mcp-setup.md`는 설치 문제를 만났을 때 “공식 remote MCP 연결 확인, `/mcp` 인증, `whoami` 확인”을 안내하는 복구용 커맨드로 두면 좋습니다.

추천안만 한 줄로 정리하면, `이 repo를 marketplace repo로 재구성하고, figma-to-code plugin 안에 remote Figma MCP 설정을 번들한 뒤, 사용자에게는 /plugin marketplace add -> /plugin install -> /figma-to-code <url> 흐름만 노출`하는 것이 가장 쉽습니다.

출처:
- Claude Code skills: https://code.claude.com/docs/en/slash-commands
- Claude Code plugins reference: https://code.claude.com/docs/en/plugins-reference
- Claude Code plugin marketplaces: https://code.claude.com/docs/en/plugin-marketplaces
- Claude Code MCP: https://code.claude.com/docs/en/mcp
- Figma MCP overview: https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server
- Figma MCP remote vs desktop: https://help.figma.com/hc/en-us/articles/35281385065751-Figma-MCP-collection-Compare-Figma-s-remote-and-desktop-MCP-servers
- Figma MCP plans/limits: https://developers.figma.com/docs/figma-mcp-server/plans-access-and-permissions/

원하면 다음 턴에서 바로 `marketplace.json` 포함한 실제 디렉토리 재구성과 `SKILL.md` frontmatter 정리안까지 만들어드릴 수 있습니다.


OpenAI Codex v0.107.0 (research preview)
--------
workdir: /Users/leejuhwan/Desktop/figma-to-code
model: gpt-5.4
provider: openai
approval: never
sandbox: danger-full-access
reasoning effort: none
reasoning summaries: none
session id: 019d3f5c-f318-7ca1-878b-5ee7e867df45
--------
user
figma-to-code 스킬 플러그인의 배포/실행 방식 아이데이션을 해줘. 현재 상태: /Users/leejuhwan/Desktop/figma-to-code 에 skills/figma-to-code/SKILL.md 와 .claude-plugin/plugin.json이 있다. 이 스킬은 Figma URL을 받아 Vanilla HTML/CSS/JS를 생성하는 Claude Code 스킬이다. 질문: Claude Code 사용자가 이 스킬을 가장 쉽게 설치하고 실행할 수 있는 방법은? 다음 관점에서 분석해줘: 1) Claude Code 스킬 배포 메커니즘 (로컬 스킬 vs 플러그인 마켓플레이스 vs npm 패키지 vs git clone) 2) 각 방식의 기술적 장단점과 구현 복잡도 3) Figma MCP 의존성 처리 방법 4) 실행 트리거 방식 (슬래시 커맨드, 자연어, URL 자동감지 등) 5) 추천 아키텍처와 디렉토리 구조
mcp startup: no servers
codex
요청은 `figma-to-code` 스킬을 Claude Code 사용자에게 가장 쉽게 배포·실행시키는 방식을 설계하는 것입니다. 먼저 스킬 지침과 현재 저장소의 `SKILL.md`, `.claude-plugin/plugin.json` 구조를 읽고, Claude Code 배포 메커니즘 관점에서 현실적인 옵션을 정리하겠습니다.
exec
/bin/zsh -lc "sed -n '1,220p' /Users/leejuhwan/.codex/skills/.system/skill-creator/SKILL.md" in /Users/leejuhwan/Desktop/figma-to-codeexec
/bin/zsh -lc "sed -n '1,220p' /Users/leejuhwan/Desktop/figma-to-code/skills/figma-to-code/SKILL.md" in /Users/leejuhwan/Desktop/figma-to-codeexec
/bin/zsh -lc "sed -n '1,220p' /Users/leejuhwan/Desktop/figma-to-code/.claude-plugin/plugin.json" in /Users/leejuhwan/Desktop/figma-to-code succeeded in 50ms:
---
name: figma-to-code
description: Figma URL을 넣으면 배포 가능한 HTML/CSS/JS를 생성합니다. "figma", "피그마", "디자인을 코드로", "HTML로 만들어줘" 등의 요청에 사용됩니다.
aliases: [figma, 피그마]
---

# Figma-to-Code

Figma 디자인 URL을 받아 배포 가능한 Vanilla HTML/CSS/JS를 생성합니다.

## 트리거

다음과 같은 요청에 이 스킬이 활성화됩니다:
- "이 Figma 디자인을 HTML로 만들어줘"
- "figma.com/design/... 이걸 코드로 변환해줘"
- "/figma-to-code <URL>"
- 메시지에 figma.com URL이 포함된 경우

## 실행 단계

 succeeded in 50ms:
---
name: skill-creator
description: Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends Codex's capabilities with specialized knowledge, workflows, or tool integrations.
metadata:
  short-description: Create or update a skill
---

# Skill Creator

This skill provides guidance for creating effective skills.

## About Skills

Skills are modular, self-contained folders that extend Codex's capabilities by providing
specialized knowledge, workflows, and tools. Think of them as "onboarding guides" for specific
domains or tasks—they transform Codex from a general-purpose agent into a specialized agent
equipped with procedural knowledge that no model can fully possess.

### What Skills Provide

 succeeded in 51ms:
{
  "name": "figma-to-code",
  "version": "0.1.0",
  "description": "Figma URL → HTML/CSS/JS 변환 플러그인",
  "author": {
    "name": "leejuhwan"
  },
  "skills": "./skills/"
}
codex
현재 구조는 Claude Code 스킬 본체와 `.claude-plugin/plugin.json`만 있는 최소 구성입니다. 다음 단계로 저장소 구조를 더 확인하고, 실제 배포 단위를 어떻게 쪼개야 설치 경험이 가장 단순해지는지 기준을 세우겠습니다.
exec
/bin/zsh -lc 'find /Users/leejuhwan/Desktop/figma-to-code -maxdepth 3 -type d | sort' in /Users/leejuhwan/Desktop/figma-to-code succeeded in 51ms:
/Users/leejuhwan/Desktop/figma-to-code
/Users/leejuhwan/Desktop/figma-to-code/.claude-plugin
/Users/leejuhwan/Desktop/figma-to-code/.omc
/Users/leejuhwan/Desktop/figma-to-code/.omc/state
/Users/leejuhwan/Desktop/figma-to-code/skills
/Users/leejuhwan/Desktop/figma-to-code/skills/figma-to-code
exec
/bin/zsh -lc 'rg --files /Users/leejuhwan/Desktop/figma-to-code' in /Users/leejuhwan/Desktop/figma-to-code succeeded in 52ms:
/Users/leejuhwan/Desktop/figma-to-code/skills/figma-to-code/SKILL.md
codex
로컬 구조는 매우 단순해서, 배포 UX의 핵심은 저장소보다는 Claude Code가 현재 공식적으로 어떤 설치 표면을 제공하느냐에 달려 있습니다. 공식 문서 기준으로 `skills`, 플러그인 설치, MCP 연동 가능 범위를 확인한 뒤 각 옵션을 비교하겠습니다.
🌐 Searching the web...
🌐 Searched: Anthropic Claude Code skills plugin marketplace documentation
🌐 Searching the web...
🌐 Searched: ".claude-plugin" "plugin.json" Claude Code
🌐 Searching the web...
🌐 Searched: https://docs.claude.com/en/docs/claude-code/plugin-marketplaces
🌐 Searching the web...
🌐 Searched: 'GitHub' in https://docs.claude.com/en/docs/claude-code/plugin-marketplaces
🌐 Searching the web...
🌐 Searched: https://docs.claude.com/en/docs/claude-code/plugins-reference
🌐 Searching the web...
🌐 Searched: 'disable-model-invocation' in https://docs.anthropic.com/en/docs/claude-code/slash-commands
🌐 Searching the web...
🌐 Searched: site:code.claude.com/docs/en "plugin marketplace add" Claude Code
🌐 Searching the web...
🌐 Searched: site:code.claude.com/docs/en "Discover and install plugins" Claude Code
🌐 Searching the web...
🌐 Searched: 'MCP servers' in https://docs.claude.com/en/docs/claude-code/plugins-reference
🌐 Searching the web...
🌐 Searched: 'Working with external dependencies' in https://docs.claude.com/en/docs/claude-code/plugins-reference
🌐 Searching the web...
🌐 Searched: official Figma MCP Claude Code Figma official docs
🌐 Searching the web...
🌐 Searched: https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Dev-Mode-MCP-Server
codex
현재 구조를 보면 스킬 본체는 [SKILL.md](/Users/leejuhwan/Desktop/figma-to-code/skills/figma-to-code/SKILL.md), 플러그인 매니페스트는 [plugin.json](/Users/leejuhwan/Desktop/figma-to-code/.claude-plugin/plugin.json)만 있는 최소 형태입니다. 이 상태에서 Claude Code 사용자에게 가장 쉽게 배포하려면, 결론은 `단일 플러그인 repo`보다 `플러그인 마켓플레이스 repo + figma-to-code plugin` 구조가 가장 낫습니다.

1. Claude Code 스킬 배포 메커니즘
- `로컬 스킬` (`~/.claude/skills` 또는 프로젝트 `.claude/skills`): 가장 단순하지만 설치가 수동 복붙 수준이라 배포성이 약합니다.
- `플러그인 마켓플레이스`: 현재 Claude Code의 공식 배포 표면입니다. 사용자는 `/plugin marketplace add ...` 후 `/plugin install figma-to-code@marketplace`로 설치하고, 이후 `plugin update`까지 일관되게 갑니다.
- `npm 패키지`: Claude Code는 플러그인을 직접 npm에서 “찾아” 설치하는 게 아니라, 마켓플레이스 항목의 `source`로 npm을 참조하는 구조입니다. 즉 npm은 배포 백엔드일 뿐, UX 전면은 아닙니다.
- `git clone`: 개발자 친화적이지만 일반 사용자 UX는 나쁩니다. `claude --plugin-dir` 같은 개발/테스트 용도에는 좋고, 배포 기본값으로는 부적절합니다.

2. 기술적 장단점과 구현 복잡도
- 로컬 스킬
  - 장점: 구현 0에 가깝고 즉시 사용 가능.
  - 단점: 업데이트, 버전관리, 의존성 안내, 팀 배포가 약함.
  - 복잡도: 매우 낮음.
- 마켓플레이스
  - 장점: 공식 설치/업데이트 플로우, 버전관리, 팀 공유, 캐시/스코프 관리가 맞물립니다.
  - 단점: `.claude-plugin/marketplace.json` 추가와 배포 구조 재편이 필요.
  - 복잡도: 중간.
- npm source
  - 장점: semver, registry 배포, private registry 지원.
  - 단점: 이 플러그인은 프롬프트/스킬 중심이라 npm의 장점이 작고, publish 파이프라인만 늘어납니다.
  - 복잡도: 중간 이상.
- git clone
  - 장점: 가장 투명하고 디버그 쉬움.
  - 단점: 사용자가 설치/업데이트를 직접 관리해야 함.
  - 복잡도: 낮지만 사용자 경험이 나쁨.

3. Figma MCP 의존성 처리
- 권장 기본값은 `공식 remote Figma MCP`를 전제로 하는 것입니다. Figma는 remote server를 preferred로 안내하고, endpoint는 `https://mcp.figma.com/mcp`입니다.
- 설치 방식은 3가지가 있습니다.
  - 플러그인에 `.mcp.json`을 번들: 가장 쉬운 UX. 플러그인 enable 시 Figma MCP도 같이 잡히고, 사용자는 `/mcp`에서 인증만 하면 됩니다.
  - 사용자 수동 등록: `claude mcp add --transport http --scope user figma https://mcp.figma.com/mcp`. 가장 안전하지만 설치 단계가 하나 늘어납니다.
  - 프로젝트 `.mcp.json`: 팀 repo에는 좋지만, Figma 인증이 개인 계정 단위라 개인용 배포에는 과합니다.
- 추천은 `플러그인 번들 + 수동 fallback`입니다.
- 주의: Figma 요금제/seat에 따라 호출 제한이 큽니다. Starter/View/Collab은 월 6회 수준이라 사실상 이 스킬과 궁합이 약합니다. Pro/Org의 Dev/Full seat 이상을 사실상 권장해야 합니다.

4. 실행 트리거 방식
- 1순위: 명시적 슬래시 커맨드 `/figma-to-code <figma-url>`
  - 가장 예측 가능하고 데모하기 쉽습니다.
  - `argument-hint: [figma-url]`를 넣는 게 좋습니다.
- 2순위: 자연어 트리거
  - 설명문에 “Figma URL”, “HTML/CSS/JS”, “landing page”, “design to code” 같은 실제 사용자 표현을 넣으면 자동 발화가 잘 됩니다.
- 3순위: URL 자동감지
  - 가능하지만 단독 트리거로 두면 과발동 위험이 있습니다.
  - 추천은 “Figma URL이 있고, 동시에 코드 생성 의도가 있는 자연어”일 때만 자동 트리거되도록 설명문을 다듬는 것입니다.
- 현재 [SKILL.md](/Users/leejuhwan/Desktop/figma-to-code/skills/figma-to-code/SKILL.md)의 `aliases` 필드는 공식 frontmatter 목록에 없습니다. 즉 실제로는 무시될 가능성이 높습니다. 별칭에 기대지 말고 `description`과 예시에 키워드를 넣는 쪽이 안전합니다.

5. 추천 아키텍처와 디렉토리 구조
- 추천 아키텍처:
  - `배포는 marketplace`
  - `실행은 plugin skill`
  - `Figma MCP는 plugin-bundled remote MCP + /mcp 인증`
  - `로컬 git clone + --plugin-dir`는 개발자용 테스트 경로로만 유지
- 추천 구조:
```text
figma-to-code-marketplace/
├── .claude-plugin/
│   └── marketplace.json
└── plugins/
    └── figma-to-code/
        ├── .claude-plugin/
        │   └── plugin.json
        ├── .mcp.json
        ├── skills/
        │   └── figma-to-code/
        │       ├── SKILL.md
        │       ├── references/
        │       │   ├── figma-url-parsing.md
        │       │   └── output-contract.md
        │       └── scripts/
        │           └── validate-output.sh
        └── commands/
            └── figma-mcp-setup.md
```
- `plugin.json`에는 최소한 `name`, `description`, `version`, `skills`를 넣고, 가능하면 `homepage`, `repository`, `keywords`, `license`도 넣는 편이 좋습니다.
- `SKILL.md`는 500줄 이하로 유지하고, URL 파싱 규칙/출력 계약/반응형 정책은 `references/`로 분리하는 게 좋습니다.
- `commands/figma-mcp-setup.md`는 설치 문제를 만났을 때 “공식 remote MCP 연결 확인, `/mcp` 인증, `whoami` 확인”을 안내하는 복구용 커맨드로 두면 좋습니다.

추천안만 한 줄로 정리하면, `이 repo를 marketplace repo로 재구성하고, figma-to-code plugin 안에 remote Figma MCP 설정을 번들한 뒤, 사용자에게는 /plugin marketplace add -> /plugin install -> /figma-to-code <url> 흐름만 노출`하는 것이 가장 쉽습니다.

출처:
- Claude Code skills: https://code.claude.com/docs/en/slash-commands
- Claude Code plugins reference: https://code.claude.com/docs/en/plugins-reference
- Claude Code plugin marketplaces: https://code.claude.com/docs/en/plugin-marketplaces
- Claude Code MCP: https://code.claude.com/docs/en/mcp
- Figma MCP overview: https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server
- Figma MCP remote vs desktop: https://help.figma.com/hc/en-us/articles/35281385065751-Figma-MCP-collection-Compare-Figma-s-remote-and-desktop-MCP-servers
- Figma MCP plans/limits: https://developers.figma.com/docs/figma-mcp-server/plans-access-and-permissions/

원하면 다음 턴에서 바로 `marketplace.json` 포함한 실제 디렉토리 재구성과 `SKILL.md` frontmatter 정리안까지 만들어드릴 수 있습니다.
tokens used
60,749

```

## Concise summary

Provider completed successfully. Review the raw output for details.

## Action items

- Review the response and extract decisions you want to apply.
- Capture follow-up implementation tasks if needed.
