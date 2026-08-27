# CLAUDE.md

## 언어 / 말투

사용자에게 답할 때는 항상 한국어 존댓말(~습니다/~요 체)을 사용한다.

MailRoost — 여러 메일 계정(Gmail/네이버/다음/범용 IMAP)을 한 곳에서 보는 개인용 웹메일 클라이언트.

## 스택 / 구조

- `frontend/` — React + Vite + Tailwind. `npm run build` = `tsc -b && vite build`.
- `backend/` — Cloudflare Workers + Hono. `npx wrangler dev` (로컬), `npx wrangler deploy` (배포). 상태는 전부 `env.TOKENS` KV 네임스페이스 하나에 저장.
- 배포: GitHub `main` 브랜치에 push하면 Cloudflare Workers Builds가 자동으로 빌드 + 배포한다 (별도 GitHub Actions 없음). 배포 확인은 `npx wrangler deployments list` (backend 디렉터리에서).

## 상태 저장 방식 (중요)

로그인한 사용자별로 `MailOrgState` 하나가 KV 키 `user:mailorg:<userId>`에 통째로 JSON blob으로 저장된다 (`backend/src/lib/mailOrg.ts`). 분류 메일함, 자동분류 규칙, 스누즈, 뮤트, 보관 여부, 저장된 필터가 전부 이 안에 들어있다.

**동시 요청 주의**: 이 blob은 "읽기 → 메모리에서 수정 → 통째로 쓰기" 패턴이라, 두 요청이 겹치면(20초 자동 폴링, 여러 탭, 수동 새로고침 등) 나중에 끝난 쪽이 먼저 쓴 쪽의 변경을 덮어쓸 수 있다. `/api/mail`의 자동분류 처리(`classifyIfNew`)에서 이 문제가 실제로 있었고(2026-08-13 수정, 커밋 `ca33b57`), 저장 직전에 최신 상태를 다시 읽어와 이번 요청이 만든 델타만 얹는 방식으로 고쳤다. **새로 org를 수정하는 코드를 추가할 때 이 패턴을 참고할 것** — 그냥 읽은 객체를 통째로 다시 쓰면 레이스가 생긴다.

## 메일 식별자 (assignmentKey)

계정별 메일을 가리키는 내부 키는 `assignmentKey(accountId, mailId)` (`backend/src/lib/mailOrg.ts`)이고, `accountId`와 `mailId`를 구분자 없이 그냥 이어붙인다. 반대로 키 하나를 받아서 accountId/mailId로 되돌려야 할 때(`parseAssignmentKey`)는 **현재 연결된 계정 id 목록과 접두사 대조**로 나눈다 — 문자열 안에 구분자를 넣는 방식이 아니다.

**절대 하지 말 것**: 이 키에 구분자를 넣고 싶어도 문자열 리터럴에 눈에 안 보이는 제어문자(U+0001 같은)를 직접 박아넣지 말 것. 예전에 정확히 이걸 하다가 편집 과정에서 그 문자가 빈 문자열로 조용히 깎여나가서(`KEY_DELIMITER = ""`), `"x".indexOf("")`가 항상 `0`을 반환하는 JS 특성 때문에 분류 메일함 조회와 스누즈 기능이 몇 달째 아무 에러 로그도 없이 항상 빈 결과를 반환하는 버그로 이어졌다. 자세한 경위는 [`docs/incidents/2026-08-13-folder-and-snooze-lookup-broken.md`](docs/incidents/2026-08-13-folder-and-snooze-lookup-broken.md) 참고. 구분자가 꼭 필요하면 `String.fromCharCode(n)`처럼 명시적으로 만들고, 비교도 `charCodeAt`처럼 눈에 보이는 방식으로 할 것.

## 디버깅 팁

- 이 앱의 실패 모드는 대부분 **에러 없이 조용히 빈 배열/빈 객체를 반환**하는 형태다 (계정 매핑 실패, 파싱 실패 등을 전부 `if (!x) return []`류로 처리해서). 증상만 봐서 원인을 못 찾겠으면:
  1. `npx wrangler tail --format json` (backend 디렉터리)로 실제 배포된 워커의 요청/로그를 실시간으로 관찰한다.
  2. 의심되는 라우트에 임시 `console.log`를 추가해 커밋 + push (직접 `wrangler deploy`는 auto-mode 승인 정책에 막힘 — 반드시 git push로 배포할 것), 재현 후 로그 확인, 원인 찾으면 로그 제거.
  3. 필요하면 `npx wrangler kv key list --namespace-id <id> --remote` / `kv key get`으로 실제 저장된 상태를 직접 열어서 "데이터가 잘못 저장된 건지, 조회 로직이 잘못된 건지"부터 구분한다.
- 로컬 재현: `backend/`에서 `npx wrangler dev`, `frontend/`에서 `npx vite`. 타입체크는 `npx tsc --noEmit`(backend) / `npx tsc -b`(frontend), 린트는 `npx oxlint`(frontend에서 실행, backend 경로도 인자로 받을 수 있음).

## 커밋 / 배포 습관

- 서로 다른 기능/수정은 별도 커밋으로 나눈다 (한 파일 안에 여러 논리적 변경이 섞여도 `git add`로 필요한 부분만 골라 커밋). 커밋 메시지는 영어, `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` 트레일러 포함.
- 커밋/push는 명시적으로 요청받았을 때만 한다.
