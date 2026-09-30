# MailRoost 인수인계 문서

> 이 문서는 대화 로그 없이도 작업을 이어갈 수 있도록 프로젝트의 현재 상태를 기록한다.
> 마지막 업데이트: 2026-10-01 (커밋 `40c80d9`)

---

## 프로젝트 한 줄 요약

Gmail/네이버/다음/범용 IMAP 계정을 한 곳에서 관리하는 **개인용 웹메일 클라이언트**.
Cloudflare Workers(백엔드) + React 19 + Vite(프런트)로 구성. 배포는 `main` push → Cloudflare Workers Builds 자동 배포.

---

## 구현 완료된 주요 기능 (최신순)

### 2026-10 (현 세션)
| 커밋 | 내용 |
|------|------|
| `40c80d9` | **chip 드롭다운 순차 선택 버그 수정**: 이메일 선택 후 드롭다운이 닫히던 문제 → `setOpen(false)` → `setOpen(true)` (auto-rules-view, recipient-input 모두 적용) |
| `bf492bc` | **스레드 뷰 개선**: 최신 메일 "최신" 배지, 접힌 메일에 날짜+시간 표시, iframe 높이 `min-h-[520px]` 고정, URL 링크 렌더링 |
| `8624630` | snooze-mute-rules-panel 드롭다운 깜빡임 버그 수정 (document mousedown → onBlur) |
| `0b957a4` | RecipientInput 드롭다운 깜빡임 버그 수정 |
| `e50b479` | 자동분류 규칙 목록 행 세로 중앙 정렬 |
| `f4c27d5` | "기존 메일에 적용" 0건 버그 수정: 다중 이메일 주소를 각각 별도로 검색 |
| `2c911da` | EmailChipInput 깜빡임 버그 + 수정 버튼 추가 |
| `9d67825` | **자동분류 규칙 편집기에 이메일 chip 태그 UI 도입** (발신자 포함/제외 필드) |

### 2026-09
| 커밋 범위 | 내용 |
|-----------|------|
| `3f861b7` | OAuth state를 KV에 저장 (쿠키 대신) |
| `b051e70` | Android WebView URL 로드, UA 고정, 핀치줌 |
| `6ba392b` | Capacitor Android 앱 스캐폴드 |
| 여러 커밋 | PWA 다크모드 강제 적용(Samsung Internet) 버그 수정 시리즈 |

### 2026-08
| 커밋 범위 | 내용 |
|-----------|------|
| `e520b9a`~`7745519` | **스레드 뷰 구현** (PR #1): Gmail threadId, IMAP Message-ID/References/In-Reply-To, 프런트 그룹핑 알고리즘, MailList 그룹 렌더링, MailDetail 아코디언 |
| `6ea2a46`~`c5b38aa` | **통합 첨부함 구현**: Gmail `has:attachment` + IMAP bounded scan, `/api/attachments` 라우트, `AttachmentsView` 컴포넌트 |
| `ec4dfb7` | 자동분류 규칙 AND/제외 조건 확장 |
| `4b9dc35` | .eml 내보내기 |
| `2e77cd3` | 백업 내보내기/가져오기 |
| `ca33b57` | classifyIfNew 동시 요청 레이스 컨디션 수정 (중요 패턴 — CLAUDE.md 참고) |

---

## 현재 코드 구조 (핵심 파일만)

### 프런트엔드
```
frontend/src/
  App.tsx                          # 전체 라우팅, workspace 훅 연결
  hooks/use-mail-workspace.ts      # 메일 상태 중앙 관리 (AppView 타입 포함)
  types/mail.ts                    # Mail, Account, MailFolder 등 공통 타입
  lib/
    api.ts                         # 백엔드 API 호출 함수
    threading.ts                   # 스레드 그룹핑 알고리즘 (union-find)
  components/
    mail/
      mail-list.tsx                # 메일 목록 (스레드 그룹 단위 렌더링)
      mail-detail.tsx              # 스레드 아코디언 래퍼
      message-card.tsx             # 메일 1통 상세 뷰 (헤더+본문+첨부)
      recipient-input.tsx          # 작성창 To/CC/BCC chip 입력
    cleanup/
      auto-rules-view.tsx          # 자동분류 규칙 편집 (EmailChipInput 포함)
    snoozed/
      snooze-mute-rules-panel.tsx  # 스누즈/뮤트 자동 규칙 패널
    attachments/
      attachments-view.tsx         # 통합 첨부함 화면
```

### 백엔드
```
backend/src/
  lib/
    mailOrg.ts          # MailOrgState KV blob 읽기/쓰기 (레이스 패턴 주의)
    rules.ts            # 자동분류 규칙 매칭 (splitTerms OR 매칭 포함)
    gmail.ts            # Gmail API (listAttachmentsForAccount 포함)
    imap.ts             # IMAP (naverListAttachments, daumListAttachments 포함)
    imap-parse.ts       # IMAP FETCH 파싱 순수 함수 (vitest 가능)
    threading.ts        # (없음 — 그룹핑은 프런트에서만 함)
  routes/
    rules.ts            # /rules/:id/apply (다중 검색어 개별 검색)
    attachments.ts      # GET /api/attachments
    mail.ts             # 메인 메일 라우트 (classifyIfNew 포함)
```

---

## 드롭다운/chip 입력 패턴 (반복 적용됨)

깜빡임 버그 방지를 위해 아래 패턴을 사용한다. `document mousedown` + `onFocus` 조합은 쓰지 않는다.

```tsx
// 래퍼 div에 onBlur로 외부 클릭 감지
<div
  ref={rootRef}
  onBlur={(e) => {
    if (!rootRef.current?.contains(e.relatedTarget as Node)) setOpen(false)
  }}
>
  <input onFocus={() => setOpen(true)} ... />
  
  {open && (
    <div /* 드롭다운 */>
      <button
        tabIndex={-1}                          // focus가 input에서 안 빠져나가도록
        onMouseDown={(e) => e.preventDefault()} // blur 방지
        onClick={() => { /* 선택 처리 */ }}
      />
    </div>
  )}
</div>
```

chip 추가 후 드롭다운은 `setOpen(true)`로 유지해야 연속 선택이 된다 (`setOpen(false)` 금지).

---

## 알려진 미해결 이슈

없음. 현재 알려진 버그 없음.

---

## 다음에 할 수 있는 작업 (미완성/미착수)

기능 계획이 있는 것:
- `docs/superpowers/plans/2026-08-29-thread-view.md` — 구현 완료 (PR #1 머지됨), 계획 파일의 체크박스는 업데이트 안 됨
- `docs/superpowers/plans/2026-08-29-attachment-library.md` — 구현 완료 (2026-08 커밋), 체크박스 업데이트 안 됨

사용자가 언급한 개선 아이디어 (아직 구현 안 됨):
- 없음 (최근 대화에서 새로 요청된 미완성 기능 없음)

---

## 배포 / 디버깅 메모

- **배포**: `git push origin main` → Cloudflare Workers Builds 자동 빌드+배포. `wrangler deploy` 직접 사용 금지 (auto-mode 승인 정책).
- **배포 확인**: `npx wrangler deployments list` (backend 디렉터리)
- **실시간 로그**: `npx wrangler tail --format json` (backend 디렉터리)
- **로컬 개발**: backend → `npx wrangler dev`, frontend → `npx vite`
- **타입체크**: backend → `npx tsc --noEmit`, frontend → `npx tsc -b`
- **테스트**: backend → `npx vitest run`, frontend → `npx vitest run`

이 앱의 실패 모드는 대부분 **에러 없이 조용히 빈 배열 반환** (계정 매핑 실패, 파싱 실패를 `if (!x) return []`로 처리). 증상만 보고 원인 못 찾으면 wrangler tail로 실제 요청 확인.
