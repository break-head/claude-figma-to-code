---
name: figma-mcp-setup
description: Figma MCP 연결 확인 및 트러블슈팅 가이드
---

# Figma MCP Setup

figma-to-code 스킬이 Figma 디자인 데이터를 가져오려면 Figma MCP 서버가 연결되어 있어야 합니다.

## 연결 확인

1. `/mcp` 명령으로 MCP 서버 목록을 확인하세요.
2. `figma` 서버가 목록에 있고 상태가 정상이면 사용 가능합니다.
3. `whoami` 도구를 호출하여 Figma 계정 인증 상태를 확인하세요.

## 연결이 안 되어 있다면

이 플러그인에 `.mcp.json`이 번들되어 있으므로, 플러그인이 설치되면 자동으로 Figma remote MCP가 등록됩니다.

수동으로 등록하려면:
```
claude mcp add --transport http --scope user figma https://mcp.figma.com/mcp
```

## 인증

Figma MCP는 Figma 계정 인증이 필요합니다. `/mcp`에서 figma 서버를 선택하고 인증 절차를 완료하세요.

## 요금제 참고

- **Pro/Org Dev seat 이상**: API 호출 제한 없음 (권장)
- **Starter/View/Collab**: 월 6회 제한 — figma-to-code 스킬과 궁합이 약함
