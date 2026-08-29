# 스레드 뷰 설계

날짜: 2026-08-29

## 배경 / 문제

현재 메일 리스트는 대화(답장 주고받은 메일들)를 개별 메일로 뿔뿔이 흩어서 보여준다. 코드 전체에
`threadId` 개념이 없다 (`backend/src/types.ts`의 `Mail` 인터페이스에 없음, IMAP 쪽은
`Message-ID`/`References`/`In-Reply-To` 헤더 자체를 안 읽어옴).

## 목표

Gmail, 네이버, 다음, 범용 IMAP 계정 전부에서 답장 체인을 하나의 대화로 묶어서 보여준다.

## 범위

**포함**
- Gmail + 모든 IMAP 계정(네이버/다음/범용) 스레드 그룹핑
- 리스트에서 스레드 단위로 접힌 한 줄 표시 (발신자 옆 개수 배지)
- 상세 패널에서 스레드 내 메일이 세로로 쌓여 표시 (최신만 펼쳐짐)
- 리스트에서 스레드 행 체크 시 그 스레드의 모든 메일이 일괄작업(삭제/보관/이동) 대상

**제외 (out of scope)**
- 제목 기반 fallback 그룹핑 (헤더가 없으면 그냥 단독 스레드로 둔다 — 오탐 위험 회피)
- 계정을 넘나드는 스레드 병합 (회사 IMAP 계정과 개인 Gmail 계정 대화는 헤더가 우연히 겹쳐도 항상 분리)
- 스레드 단위 안읽음 카운트 (기존처럼 메일 단위 카운트 유지)
- 검색 서버사이드 스레드 그룹핑 (검색 결과는 지금처럼 개별 메일로 표시 — 검색 중엔 스레드 묶음이 오히려
  "왜 이 메일이 여기 있지"를 헷갈리게 할 수 있어서 1차 범위에서 제외)

## 아키텍처 결정: 그룹핑은 프런트에서

백엔드는 헤더 원본만 실어보내고, 스레드 그룹핑 계산 자체는 프런트가 `allMails` 위에서 한다.
이유:
- 이미 이 코드베이스의 확립된 패턴이다 — `App.tsx`의 `categoryCounts`, `unreadCountByFolder`,
  `unreadCountByAccount`가 전부 `allMails`로부터 `useMemo`로 파생된다.
- 백엔드에서 그룹핑하면 페이지네이션 경계를 넘나드는 스레드(1페이지에 원본, 2페이지에 답장)가
  깨지기 쉽다. 프런트는 지금까지 로드된 전체 `allMails`를 기준으로 계산하므로 이 문제가 없다.
- 일괄작업(삭제/보관/이동)은 기존 API를 그대로 재사용한다 — "스레드 선택"을 그 스레드에 속한
  개별 mail id 목록으로 펼쳐서 기존 bulk 엔드포인트에 그대로 넘기면 되므로 **백엔드 API 변경이
  전혀 필요 없다**.

## 데이터 모델 변경

`backend/src/types.ts`의 `Mail` 인터페이스에 필드 추가:

```ts
threadId?: string       // Gmail 전용 — API가 각 메시지마다 공짜로 주는 값 그대로
messageId?: string      // IMAP 전용 — Message-ID 헤더
references?: string[]   // IMAP 전용 — References 헤더 (공백으로 구분된 메시지ID 목록을 파싱)
inReplyTo?: string       // IMAP 전용 — In-Reply-To 헤더
```

Gmail 메일은 `threadId`만 채워지고, IMAP 메일은 `messageId`/`references`/`inReplyTo`만 채워진다
(서로 안 섞임 — provider별로 다른 필드를 쓰는 것 자체가 그룹핑 알고리즘에서 "이 메일이 Gmail인지
IMAP인지"를 따로 안 물어봐도 되게 해준다).

## 백엔드 변경

### Gmail (`backend/src/lib/gmail.ts`)
- `GmailMessage` 인터페이스에 `threadId: string` 추가 (API 응답에 이미 들어있음, 파싱만 하면 됨)
- `mapMessageToMail`에서 `threadId: msg.threadId` 매핑 추가

### IMAP (`backend/src/lib/imap.ts`)
- `HEADER.FIELDS (FROM SUBJECT)`를 쓰는 3곳(line ~350, ~445, ~476)을
  `HEADER.FIELDS (FROM SUBJECT MESSAGE-ID REFERENCES IN-REPLY-TO)`로 확장
- `parseHeaderFields`가 이미 범용 `parseHeaderBlock` 위에서 동작하므로, 반환 타입에
  `messageId`/`references`/`inReplyTo`만 추가하면 됨 (파싱 로직 자체는 재사용)
- `References` 헤더는 공백으로 구분된 `<id1> <id2> ...` 형식 — 공백 split 후 꺾쇠괄호 제거해서
  `string[]`로 저장
- `mapFetchLinesToMails`에서 위 필드들을 `Mail` 객체에 실어보냄

## 프런트 그룹핑 알고리즘

새 파일 `frontend/src/lib/threading.ts`:

```ts
export function groupIntoThreads(mails: Mail[]): Mail[][]
```

- Gmail 메일: `accountId + threadId`를 그룹 키로 바로 묶음
- IMAP 메일: **계정 안에서만** union-find — `messageId`를 노드로 삼고, 각 메일의
  `references`/`inReplyTo`가 가리키는 `messageId`와 union
- 매칭되는 게 없는 메일(헤더 없음, 또는 아무도 참조 안 함)은 자기 혼자만의 그룹
- 각 그룹은 `receivedAt` 오름차순으로 정렬해서 반환 (오래된 것 → 최신)
- 순수 함수라 유닛테스트가 쉬움 — `threading.test.ts`

## UI 변경

### `MailList` (`frontend/src/components/mail/mail-list.tsx`)
- `mails: Mail[]` prop은 그대로 두고(부모가 이미 필터링/정렬 다 해줌), 새 prop
  `groupThreads?: boolean`(기본 `true`)을 추가. 컴포넌트 내부에서 이 값이 `true`일 때만
  `groupIntoThreads`를 돌려 그룹 단위로 렌더링, `false`면 지금처럼 메일 하나당 한 행
- `App.tsx`가 검색 중일 때(`workspace.searchQuery` 비어있지 않을 때)는 `groupThreads={false}`로
  넘겨서, "검색 결과는 개별 메일로 표시"라는 범위 결정을 지킨다
- 한 그룹 = 한 행. 표시는 그룹의 최신 메일 기준(발신자/제목/스니펫/시각), 그룹 크기가 2 이상이면
  발신자 옆에 개수 배지(`3`)
- 체크박스(`checkedIds`/`onToggleCheck`)는 그룹의 **모든 mail id**를 대상으로 토글 — 체크 시
  `onToggleCheck`를 그룹 내 각 id에 대해 호출
- `onSelectMail`은 그룹의 최신 메일 id를 넘김 (상세 패널이 그 메일이 속한 스레드 전체를 안다)

### `MailDetail` (`frontend/src/components/mail/mail-detail.tsx`)
- prop을 `mail: Mail | null` 대신 `thread: Mail[] | null` (오래된→최신 순)로 변경
- 스레드 길이 1이면 지금과 완전히 동일한 렌더링 (기존 단일 메일 뷰와 시각적으로 차이 없음)
- 길이 2 이상이면: 마지막(최신) 메일만 펼쳐진 카드로, 나머지는 발신자/시각만 보이는 접힌 헤더 —
  클릭하면 그 메일만 펼쳐짐 (아코디언, 여러 개 동시 펼침 가능)
- 답장/전체답장/전달/별표/보관/삭제/이동/스누즈/뮤트 버튼은 **현재 펼쳐진 메일** 기준으로 동작
  (기본은 최신 메일이 펼쳐진 상태이므로 지금까지의 "최신 메일에 답장" 동작과 동일)

### `App.tsx`
- 새 로직 없음 — `MailList`/`MailDetail`이 자체적으로 그룹핑하므로 `visibleMails` 등 기존
  파생 상태는 그대로 둔다. `handleSelectMail`이 넘겨받는 mailId로 `workspace.folderMails`/
  `visibleMails`에서 같은 `accountId`를 가진 메일들 중 같은 그룹에 속한 것만 추려 `MailDetail`에
  `thread`로 넘기는 얇은 래퍼만 추가

## 에러 처리 / 엣지 케이스

- IMAP 서버가 `References`/`In-Reply-To` 헤더를 안 주는 경우(일부 오래된 메일) → 그냥 단독 스레드,
  에러 아님
- `References` 헤더가 비정상적으로 긴 경우(포워딩 체인이 길게 쌓인 스팸 등) → 특별 처리 없음,
  union-find는 개수에 상관없이 동작
- 트래시함/보관함처럼 부분 목록만 로드된 화면 → 그 화면에 로드된 메일들 안에서만 그룹핑 (다른
  화면의 메일과 섞이지 않음, 어차피 계정 스코프라 자연스럽게 맞음)

## 테스트

- `backend/src/lib/imap.test.ts` (신설 또는 기존 파일에 추가): 헤더 파싱이 `messageId`/
  `references`/`inReplyTo`를 올바르게 뽑아내는지
- `backend/src/lib/gmail.test.ts`: `mapMessageToMail`이 `threadId`를 매핑하는지 (기존 파일 있으면
  추가, 없으면 신설)
- `frontend/src/lib/threading.test.ts`: `groupIntoThreads` 유닛테스트 — Gmail threadId 그룹핑,
  IMAP references 체인 그룹핑, 계정 경계 안 넘는지, 헤더 없는 메일 단독 그룹 처리
- 수동 확인: 로컬 dev에서 실제 Gmail/네이버 계정으로 답장 체인 있는 메일함 열어서 확인 (자동화
  어려움 — OAuth 로그인 필요)
