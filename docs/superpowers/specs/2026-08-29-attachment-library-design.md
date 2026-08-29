# 통합 첨부함 설계

날짜: 2026-08-29

## 배경 / 문제

지금은 첨부파일을 찾으려면 "누가 언제 보냈더라"부터 기억해내서 메일을 뒤져야 한다. 계정/메일함 구분
없이 첨부파일만 한곳에서 검색·다운로드할 수 있는 화면이 없다.

## 목표

Gmail, 네이버, 다음, 범용 IMAP 전 계정에서 첨부파일이 있는 메일을 모아, 파일명으로 검색하고
바로 다운로드할 수 있는 화면("첨부함")을 만든다.

## 범위

**포함**
- 사이드바에 "첨부함" 항목 추가 (휴지통/보관함과 같은 급의 화면)
- 화면을 열 때마다 계정별로 최근 메일 일부를 훑어 첨부파일 목록을 새로 만든다 (색인 저장 안 함)
- 파일명 클라이언트 검색 + 계정별 필터
- 기존 첨부파일 다운로드 엔드포인트(`/mail/:id/attachment/:attachmentId`) 그대로 재사용

**제외 (out of scope)**
- 첨부파일 인덱스를 별도로 저장/유지하는 것 (최신성 관리 부담이 검색 몇 초 절약보다 크다고 판단)
- 계정 유형(Gmail/IMAP)을 사용자가 직접 고르게 하는 것 — 백엔드가 계정마다 알아서 적절한 조회
  방식을 쓰고, 사용자에게는 하나로 합쳐진 목록만 보인다 (`/mail` 폴링이 이미 이 패턴)
- 무제한 전체 메일함 스캔 — 계정당 최근 100통으로 범위를 제한한다
- 인라인 이미지(서명 로고 등)와 실첨부파일 구분 — 지금 `message-card.tsx`도 이 둘을 구분 안 하고
  전부 첨부파일 칩으로 보여주므로, 첨부함도 기존 동작과 똑같이 구분하지 않는다

## 아키텍처 결정

### 1. 색인 없이 매번 새로 훑기

화면을 열 때마다 계정별로 최근 100통을 훑어서 첨부파일만 추려 응답한다. 별도 저장소 스키마나
최신성 관리(색인이 실제 메일함과 어긋나는 문제) 없이, 화면 열 때 몇 초 기다리는 것으로 단순하게
간다. 나중에 느리다고 판명되면 그때 인덱싱을 고려한다 (YAGNI).

### 2. 계정 유형별로 백엔드가 알아서 다르게 조회 (사용자에게는 안 보임)

- **Gmail**: `has:attachment` 검색으로 후보를 서버에서 미리 좁힌 뒤, `format=full`로 배치
  조회한다. Gmail API는 `format=full`에서도 첨부파일의 실제 바이트는 안 주고 `size`/`filename`/
  `mimeType`/`attachmentId` 메타데이터만 주므로, 정확한 크기를 얻는 데 추가 디코딩이 필요 없다.
- **네이버/다음/범용 IMAP**: "첨부파일 있음" 검색이 표준 IMAP에 없으므로, 최근 100통의 원본
  전체(`BODY.PEEK[]`)를 한 번의 연결로 범위 조회한 뒤, 이미 있는 `listMimeAttachments`(mime.ts)로
  첨부파일을 추출한다. 이 함수가 정확한 크기까지 계산해주므로 이것도 추가 작업이 필요 없다.

**메모 (설계 중 재검토):** 브레인스토밍 초반에는 "크기 계산 때문에 원본 디코딩이 무거우니
근사치만 보여주자"고 생각했으나, 실제로 무거운 부분은 디코딩(CPU)이 아니라 원본 자체를
네트워크로 받아오는 것(I/O)이고, 이미 메일 상세보기가 매번 하는 일과 같다. 진짜 비용 통제는
"계정당 100통 제한"이 하고 있으므로, 별도의 "가벼운 크기 근사치" 로직은 만들지 않는다 — 만들면
오히려 코드 경로가 두 개(정확한 크기 vs 근사치)로 늘어나 복잡도만 는다.

### 3. 화면 레이아웃: 리스트형

브라우저 목업으로 리스트형과 그리드형을 비교했고, 리스트형으로 결정했다 — 지금 앱의 메일함/
휴지통이 전부 리스트 형태라 통일감이 있다. 한 행 = 파일 하나: 아이콘/확장자 뱃지, 파일명,
발신자·계정·날짜, 용량, 다운로드.

## 데이터 모델

새 공용 타입 (backend `types.ts`):

```ts
export interface AttachmentListItem {
  accountId: string
  mailId: string
  attachmentId: string
  filename: string
  mimeType: string
  size: number
  fromName: string
  fromEmail: string
  subject: string
  receivedAt: string
}
```

프런트 `types/mail.ts`에도 동일하게 미러링한다.

## 백엔드 변경

### Gmail (`backend/src/lib/gmail.ts`)
- `batchGetMessages`가 지금 `format=metadata`로 하드코딩되어 있는데, `format` 매개변수를
  받도록 확장한다 (기본값 `"metadata"`, 첨부함 조회 시 `"full"`로 호출) — 청크 분할/파싱 로직은
  그대로 재사용.
- 새 함수 `listAttachmentsForAccount(accessToken, accountId, maxResults = 100)`:
  1. `q=has:attachment`로 후보 메시지 ID 검색 (`GET /messages?q=has:attachment&maxResults=100`)
  2. `batchGetMessages(accessToken, ids, "full")`로 배치 조회
  3. 각 메시지에 기존 `collectAttachments(msg.payload, attachments)` + `mapMessageToMail`을
     적용해 `AttachmentListItem[]`으로 변환

### IMAP (`backend/src/lib/imap.ts`)
- 새 함수 `imapListAttachments(config, accountId, maxResults = 100)`:
  1. `SELECT INBOX` → `EXISTS` 개수 확인 (기존 `fetchMailPageFromSelected`와 동일한 방식)
  2. 최근 `maxResults`통 범위로 `FETCH <range> (UID BODY.PEEK[])` (기존 `imapFetchRawByUid`가
     쓰는 것과 같은 원본 전체 조회, 범위만 여러 통)
  3. 각 메시지에 기존 `listMimeAttachments(raw)` + `parseHeaderBlock`/`parseFromHeader`/
     `decodeRfc2047`/`parseInternalDate`(전부 기존 함수, `imap-parse.ts`/`mime.ts`)를 적용해
     `AttachmentListItem[]`으로 변환, 첨부파일 없는 메시지는 건너뜀
- `naverListAttachments`/`daumListAttachments`: 기존 `naverGetMailDetail`류와 같은 얇은
  래퍼 (`imapListAttachments(naverConfig(...), ...)`)

### 새 라우트 (`backend/src/routes/attachments.ts` 신설)
- `GET /api/attachments` — 로그인 세션의 연결된 계정 전부에 대해(`resolveAccounts` 재사용)
  provider별로 분기(`accounts/rules.ts`의 apply-to-existing 라우트와 같은 `Promise.all` +
  계정별 try/catch 패턴 — 한 계정이 실패해도 나머지는 정상 응답), 결과를 평탄화해서
  `{ attachments: AttachmentListItem[] }`로 반환
- `routes/api.ts`에 새 라우터 마운트

## 프런트 변경

### `frontend/src/lib/api.ts`
- `fetchAttachments(): Promise<AttachmentListItem[]>` — `GET /api/attachments`

### `frontend/src/components/attachments/attachments-view.tsx` (신설)
- 화면 진입 시 `fetchAttachments()` 한 번 호출, 로딩 스켈레톤
- 상단: 파일명 검색 입력(클라이언트 필터) + 계정 필터 드롭다운(`accounts` prop 기반)
- 목록: 한 행 = 파일 하나 — 확장자/타입 뱃지, 파일명, `발신자 · 계정 라벨 · 날짜`, 용량,
  다운로드 버튼(`attachmentDownloadUrl(item.mailId, item.accountId, { id: item.attachmentId, filename: item.filename, mimeType: item.mimeType, size: item.size })`
  — `AttachmentListItem`의 필드를 그대로 `MailAttachment` 모양으로 넘기는 것뿐, 다운로드 자체는
  기존 라우트를 그대로 쓰므로 새 백엔드 변경 없음)
- 빈 상태: "첨부파일이 있는 메일이 없습니다" (기존 다른 목록 화면들의 빈 상태 문구 톤과 통일)

### 네비게이션 연결
- `frontend/src/hooks/use-mail-workspace.ts`의 `AppView` 유니언에 `"attachments"` 추가
- `frontend/src/components/mail/account-sidebar.tsx`에 "첨부함" 항목 추가 (휴지통/보관함과
  같은 자리, 같은 패턴 — `onGoAttachments`/`isAttachmentsView` prop)
- `App.tsx`에 `goToAttachments` 핸들러 + `view === "attachments"` 분기 렌더링 추가

## 에러 처리 / 엣지 케이스

- 계정 하나가 조회 중 실패(토큰 만료, 서버 오류 등)해도 나머지 계정 결과는 정상 반환 — 실패한
  계정은 조용히 스킵하고 콘솔에 로그만 남긴다 (기존 `[rules-apply] account X failed, skipping`
  패턴과 동일)
- 첨부파일이 아예 없는 계정/메일함은 빈 배열 — 에러 아님
- 계정당 100통 제한을 넘는 오래된 첨부파일은 이번 화면에 안 뜬다 — 명시적 제약으로 남겨둔다
  (검색창에 "더 오래된 파일은 안 나올 수 있어요" 같은 안내는 UI 구현 시 판단)

## 테스트

- `backend/src/lib/gmail.test.ts`: `batchGetMessages`의 `format` 파라미터가 실제 요청 URL에
  반영되는지 (또는 `listAttachmentsForAccount`가 `collectAttachments` 결과를 올바른 형태로
  변환하는지 — mapMessageToMail 테스트와 같은 방식)
- `backend/src/lib/mime.test.ts`(신설 또는 기존 파일에 추가): `listMimeAttachments`는 이미
  간접적으로 검증되어 있을 수 있음 — 신설이 필요하면 여러 첨부파일이 섞인 raw 메시지 픽스처로
  검증
- 수동 확인: 실제 로그인 계정으로 첨부함 화면 열어서 확인 (자동화 환경에서 로그인 불가 —
  배포 후 직접 확인 필요)
