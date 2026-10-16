# MailRoost 인수인계 문서

> 이 문서는 대화 로그 없이도 작업을 이어갈 수 있도록 프로젝트의 현재 상태를 기록한다.
> 마지막 업데이트: 2026-10-16

---

## 프로젝트 한 줄 요약

Gmail/네이버/다음/범용 IMAP 계정을 한 곳에서 관리하는 **개인용 웹메일 클라이언트**.
Cloudflare Workers(백엔드) + React 19 + Vite(프런트)로 구성. 배포는 `main` push → Cloudflare Workers Builds 자동 배포.

---

## 구현 완료된 주요 기능 (최신순)

### 2026-10
| 커밋 | 내용 |
|------|------|
| (최신) | **고급 검색 필터 (M3)**: SavedFilter에 `dateFrom`/`dateTo` 추가. 필터 저장 다이얼로그에 날짜 입력, `matchesSavedFilter`에 날짜 범위 비교 |
| (최신) | **단축키 확장 (M5)**: `c` 새 메일 작성, `a` 보관, `e` 내일 오전 9시 스누즈, `#` 삭제 추가. SHORTCUTS 상수 업데이트 |
| (최신) | **브라우저 탭 배지 (H4)**: 읽지 않은 메일 수를 탭 타이틀 `(N) MailRoost` + 파비콘 SVG 배지로 표시. `use-tab-badge.ts` 훅, App.tsx `totalUnread` 합산 |
| (최신) | **예약발송 실패 재시도 (H3)**: 실패 항목에 "다시 시도" 버튼. `POST /api/scheduled-mails/:id/retry`. 재시도 중 스피너, 성공 시 "전송됨"으로 즉시 전환 |
| `99afb32` | **분류 메일함 간 메일 이동 (H2)**: 분류 메일함 뷰에서 FolderInput 드롭다운이 이동 모드로 전환 (기존 체크박스 → 단독 이동). "받은편지함으로 꺼내기" 추가. 백엔드 `moveMail` op 버그 수정 (폴더A→폴더B 이동 시 폴더A에서 안 빠지던 문제). `applyMove` 프론트 버그도 수정 (이동 후 현재 목록에서 안 사라지던 문제) |
| `fea2064` | **계정별 메일 서명 (H1)**: 설정 시트 > 서명 섹션 추가. 계정마다 textarea로 편집, "저장" 버튼 → `PATCH /api/accounts/:id/signature`. 작성창에서 계정 전환 시 서명 자동 교체. 백엔드·API·compose 로직은 이미 구현돼 있었고 설정 UI만 추가 |
| `31548d2` | **React Router URL 기반 네비게이션**: 각 뷰가 실제 URL을 가짐 (`/inbox`, `/folder/:id`, `/archive`, `/trash`, `/drafts`, `/scheduled`, `/auto-reply` 등). `window.history` 수동 관리 제거, `BrowserRouter` + `useLocation`/`useMatch`/`useNavigate`로 교체. 브라우저 캐시로 인해 강제 새로고침(Ctrl+Shift+R) 필요할 수 있음 |
| `5983ac4` | **보내기 취소 (Undo Send)**: 5초 카운트다운 배너, 취소 버튼으로 중단 가능 (프런트 전용) |
| `5983ac4` | **예약 발송 (Scheduled Send)**: CalendarClock 버튼 → datetime-local 피커 → KV 저장. GET /api/mail 20초 폴링에 `waitUntil` 피기백, `/api/scheduled-mails` GET/POST/DELETE 라우트, 사이드바 "예약 발송" 뷰 |
| `5983ac4` | **자동 응답 (Auto Reply)**: 날짜범위/반복요일·시간/둘다 3가지 모드, 발신자 필터, 24시간 루프 방지. `MailOrgState.autoReplies` + `autoReplySentTo` 저장. CRUD `/api/auto-reply-rules`, 사이드바 "자동 응답" 뷰 |
| `852d808` | **보내는 사람 이름 칩 UI**: 이름 편집/초기화 버튼, RFC 2047 인코딩 적용 |
| `852d808` | **첨부파일 크기 확대**: Gmail 25MB 유지, 네이버/다음/IMAP 50MB. 인라인 이미지 삽입 버튼 제거 |
| `e4826e5` | **robots.txt 추가** (`frontend/public/robots.txt`) — Google 색인 허용 |
| `c539022` | 홈 뷰 자동 zoom 제거 + max-width 1800px 확대 |
| `c102d9b` | 계정 연결 가이드 다이얼로그 (`ConnectGuideDialog`) |
| `40c80d9` | chip 드롭다운 순차 선택 버그 수정 |
| `bf492bc` | 스레드 뷰 개선 (최신 배지, 날짜 표시, iframe 높이, URL 링크) |

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
| `e520b9a`~`7745519` | 스레드 뷰 구현 (PR #1) |
| `6ea2a46`~`c5b38aa` | 통합 첨부함 구현 |
| `ec4dfb7` | 자동분류 규칙 AND/제외 조건 확장 |
| `4b9dc35` | .eml 내보내기 |
| `2e77cd3` | 백업 내보내기/가져오기 |
| `ca33b57` | classifyIfNew 동시 요청 레이스 컨디션 수정 (중요 패턴 — CLAUDE.md 참고) |

---

## 현재 코드 구조 (핵심 파일만)

### 프런트엔드
```
frontend/src/
  App.tsx                          # React Router 기반 뷰 라우팅, workspace 훅 연결
  main.tsx                         # BrowserRouter 래핑
  hooks/use-mail-workspace.ts      # 메일 상태 중앙 관리 (AppView 타입 포함)
  types/mail.ts                    # Mail, Account, MailFolder, ScheduledMail, AutoReplyRule 등
  lib/
    api.ts                         # 백엔드 API 호출 함수 (scheduled, auto-reply 포함)
    threading.ts                   # 스레드 그룹핑 알고리즘 (union-find)
  components/
    mail/
      mail-list.tsx                # 메일 목록 (스레드 그룹 단위 렌더링)
      mail-detail.tsx              # 스레드 아코디언 래퍼
      message-card.tsx             # 메일 1통 상세 뷰 (헤더+본문+첨부)
      compose-view.tsx             # 메일 작성 (보내기 취소, 예약발송 포함)
      recipient-input.tsx          # 작성창 To/CC/BCC chip 입력
    cleanup/
      auto-rules-view.tsx          # 자동분류 규칙 편집
    snoozed/
      snooze-mute-rules-panel.tsx  # 스누즈/뮤트 자동 규칙 패널
    attachments/
      attachments-view.tsx         # 통합 첨부함 화면
    scheduled/
      scheduled-view.tsx           # 예약발송 목록/취소
    auto-reply/
      auto-reply-view.tsx          # 자동응답 규칙 CRUD
```

### 백엔드
```
backend/src/
  lib/
    mailOrg.ts          # MailOrgState KV blob (레이스 패턴 주의 — CLAUDE.md 참고)
    mailOrgOps.ts       # MailOrgOp union 타입 + applyMailOrgOp (auto-reply ops 포함)
    scheduledMail.ts    # KV 기반 예약발송 CRUD + sendDueScheduledMails
    autoReply.ts        # 자동응답 트리거 로직 (시간 윈도우, 루프 방지)
    rules.ts            # 자동분류 규칙 매칭
    gmail.ts / imap.ts  # 계정별 메일 가져오기
  routes/
    mail.ts             # 메인 메일 라우트 (classifyIfNew, waitUntil 피기백 포함)
    scheduled-mail.ts   # GET/POST/DELETE /api/scheduled-mails
    auto-reply.ts       # GET/POST/PATCH/DELETE /api/auto-reply-rules
    rules.ts            # /rules/:id/apply
    attachments.ts      # GET /api/attachments
```

---

## 드롭다운/chip 입력 패턴 (반복 적용됨)

깜빡임 버그 방지를 위해 아래 패턴을 사용한다. `document mousedown` + `onFocus` 조합은 쓰지 않는다.

```tsx
<div
  ref={rootRef}
  onBlur={(e) => {
    if (!rootRef.current?.contains(e.relatedTarget as Node)) setOpen(false)
  }}
>
  <input onFocus={() => setOpen(true)} ... />
  {open && (
    <div>
      <button
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => { /* 선택 처리 */ }}
      />
    </div>
  )}
</div>
```

chip 추가 후 드롭다운은 `setOpen(true)`로 유지해야 연속 선택이 된다 (`setOpen(false)` 금지).

---

## 알려진 미해결 이슈

없음.

---

## 다음 작업 목록

Gmail·네이버 대비 기능 비교 + 기술 부채 기준으로 우선순위를 분류했다.

### 🔴 높음 — 기본 메일 사용에 영향

| # | 항목 | 상태 | 설명 |
|---|------|------|------|
| H1 | **메일 서명** | ✅ 완료 `fea2064` | 계정별 고정 서명, 설정 UI + 작성창 자동 삽입 |
| H2 | **폴더 간 메일 이동** | ✅ 완료 `99afb32` | 분류 메일함 뷰에서 단독 이동, 백엔드 버그도 수정 |
| H3 | **예약발송 실패 재시도** | ✅ 완료 | 실패 항목에 "다시 시도" 버튼. `POST /api/scheduled-mails/:id/retry` |
| H4 | **브라우저 탭 배지** | ✅ 완료 | `(N) MailRoost` 탭 타이틀 + SVG 파비콘 배지 (`use-tab-badge.ts`) |

### 🟡 중간 — 자주 쓰는 기능이지만 없어도 동작은 함

| # | 항목 | 설명 |
|---|------|------|
| M1 | **임시저장 자동 저장** | ✅ 이미 구현됨 — `compose-view.tsx`의 `DRAFT_SAVE_DEBOUNCE_MS = 1500` + `useEffect` 디바운스. 핸드오버 오기재였음 |
| M2 | **첨부파일 인라인 미리보기** | 이미지·PDF 클릭 시 새 탭 대신 오버레이 미리보기 |
| M3 | **고급 검색 필터** | ✅ 완료 — 저장 필터에 날짜 범위(`dateFrom`/`dateTo`) 추가 |
| M4 | **메일 인쇄** | 브라우저 인쇄 최적화 (`@media print`) + 인쇄 버튼 |
| M5 | **단축키 확장** | ✅ 완료 — `c`/`a`/`e`/`#` 추가 (`!` 스팸은 기능 없어 제외) |
| M6 | **외부 링크 삽입** | ✅ 이미 구현됨 — `rich-text-editor.tsx:25` Link 버튼 + `window.prompt` URL 입력 |
| M7 | **스레드 단위 뮤트** | 지금은 발신자 이메일 기준 뮤트만 가능. 특정 스레드만 조용히 하는 기능 |

### 🟢 낮음 — 있으면 좋지만 후순위

| # | 항목 | 설명 |
|---|------|------|
| L1 | **브라우저 Push 알림** | ✅ 이미 구현됨 — `lib/push.ts` VAPID 구독·알림 전송 완비 |
| L2 | **메일 라벨/태그** | 폴더와 별개로 복수 태그 부착 (Gmail Labels 유사). 현재 폴더는 단일 배정 |
| L3 | **모바일 스와이프 제스처** | 좌스와이프 = 삭제, 우스와이프 = 스누즈 (네이버 앱 스타일) |
| L4 | **검색 결과 하이라이팅** | ✅ 완료 — `Highlight` 컴포넌트, fromName·subject·snippet에 `<mark>` 강조 |
| L5 | **빠른 인라인 답장** | ✅ 완료 — 목록 아이템 호버 시 답장 버튼, 클릭 시 compose 패널 바로 오픈 |
| L6 | **연락처 자동완성 개선** | ✅ 이미 구현됨 — `recipientOptions`에 `source:"recent"` 수신자 이미 포함 |

### 🔧 기술 부채

| # | 항목 | 설명 |
|---|------|------|
| T1 | **계획 파일 체크박스 업데이트** | ✅ 완료 — `thread-view.md`, `attachment-library.md` 전체 체크박스 완료 처리 |
| T2 | **`assignmentKey` 코드 주석** | ✅ 완료 — `mailOrg.ts:10-18`에 이미 상세 경고 주석 존재 |

---

## 배포 / 디버깅 메모

- **배포**: `git push origin main` → Cloudflare Workers Builds 자동 빌드+배포. `wrangler deploy` 직접 사용 금지 (auto-mode 승인 정책).
- **배포 확인**: `npx wrangler deployments list` (backend 디렉터리)
- **실시간 로그**: `npx wrangler tail --format json` (backend 디렉터리)
- **로컬 개발**: backend → `npx wrangler dev`, frontend → `npx vite`
- **타입체크**: backend → `npx tsc --noEmit`, frontend → `npx tsc -b`
- **테스트**: backend → `npx vitest run`, frontend → `npx vitest run`

이 앱의 실패 모드는 대부분 **에러 없이 조용히 빈 배열 반환** (계정 매핑 실패, 파싱 실패를 `if (!x) return []`로 처리). 증상만 보고 원인 못 찾으면 wrangler tail로 실제 요청 확인.
