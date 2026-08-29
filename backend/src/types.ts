import type { MailOrgStore } from "./durable/MailOrgStore"

export interface Env {
  TOKENS: KVNamespace
  ASSETS: Fetcher
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_JWK: string
  VAPID_SUBJECT: string
  // 저장된 계정 자격증명(비밀번호/토큰) 암호화용 AES-GCM 키 (32바이트, base64). lib/crypto.ts 참고.
  ACCOUNT_ENCRYPTION_KEY: string
  // 로그인한 사용자당 하나씩 뜨는 MailOrgState 저장용 Durable Object. lib/mailOrgStore.ts,
  // durable/MailOrgStore.ts, lib/mailOrg.ts의 resolveMailOrg/mutateMailOrg 참고.
  MAIL_ORG: DurableObjectNamespace<MailOrgStore>
  // Gmail Pub/Sub push notification 대상 토픽 (예: "projects/xxx/topics/gmail-push"). GCP 쪽
  // 설정(토픽/구독 생성)이 사용자가 별도로 할 일이라, 아직 안 채워졌을 수 있다 — 비어있으면
  // lib/gmailWatch.ts의 registerOrRenewWatch가 조용히 아무것도 안 하고 넘어간다.
  GMAIL_PUBSUB_TOPIC: string
  // Pub/Sub push 웹훅(routes/webhooks.ts)을 인증하기 위한 공유 비밀. 구독 push 설정의
  // endpoint URL에 ?token=<this> 쿼리로 붙여서 검증한다.
  GMAIL_PUBSUB_TOKEN: string
}

export interface StoredPushSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
  deviceId: string
  subscribedAt: number
}

export type Provider = "gmail" | "naver" | "daum" | "imap"

export type MailCategory = "primary" | "social" | "promotions" | "updates" | "forums"

export interface Account {
  id: string
  email: string
  provider: Provider
  label: string
  color: string
  signature?: string
}

export interface MailAttachment {
  id: string
  filename: string
  mimeType: string
  size: number
  contentId?: string
}

export interface Mail {
  id: string
  accountId: string
  fromName: string
  fromEmail: string
  subject: string
  snippet: string
  body: string
  bodyHtml?: string
  category: MailCategory
  receivedAt: string
  isRead: boolean
  isStarred: boolean
  attachments?: MailAttachment[]
  // 목록 조회에서는 비어있고, 상세 조회에서만 채워진다 (전체회신용)
  toRecipients?: string[]
  ccRecipients?: string[]
  // 배정된 사용자 정의 분류 메일함 id 목록 (메일 하나가 여러 개에 동시에 속할 수 있다). 보관함은 포함되지
  // 않는다 — 보관 여부는 별도 관리된다. /mail 목록 조회에서만 채워진다.
  folderIds?: string[]
  // 스레드 그룹핑용 — Gmail은 threadId만, IMAP(네이버/다음/범용)은 messageId/references/inReplyTo만 채워진다.
  threadId?: string
  messageId?: string
  references?: string[]
  inReplyTo?: string
}

export interface GmailAccountRecord {
  provider: "gmail"
  email: string
  accessToken: string
  refreshToken: string
  expiresAt: number
  // Gmail watch로 마지막으로 동기화한 historyId. 웹훅이 이 값부터 history.list를 이어서 조회한다.
  // 기존에 저장된 레코드에는 없을 수 있으므로 optional — 없으면 웹훅이 Pub/Sub 메시지가 실어온
  // historyId를 그대로 시작점으로 쓴다 (lib/gmailWatch.ts, routes/webhooks.ts 참고).
  historyId?: string
  // watch가 만료되는 시각(Unix ms). Gmail watch는 최대 7일이라 주기적으로 갱신해야 한다
  // (lib/gmailWatch.ts의 renewExpiringWatches, scheduled 크론 참고).
  watchExpiration?: number
}

export interface NaverAccountRecord {
  provider: "naver"
  email: string
  appPassword: string
}

export interface DaumAccountRecord {
  provider: "daum"
  email: string
  password: string
}

export interface ImapAccountRecord {
  provider: "imap"
  host: string
  port: number
  email: string
  password: string
  label: string
  smtpHost: string
  smtpPort: number
}

export type ConnectedAccountRecord = GmailAccountRecord | NaverAccountRecord | DaumAccountRecord | ImapAccountRecord

export interface UserRecord {
  id: string
  email: string
}

// 사용자 정의 분류 (앱 내부 전용 — 실제 메일 서버에는 반영되지 않음)
export interface MailFolder {
  id: string
  name: string
  color: string
  createdAt: number
}

// 자동분류 규칙: 보낸사람/제목에 키워드가 포함되면
// - targetFolderId가 있으면 지정한 분류(또는 보관함)으로 이동 (새로 도착한 메일에만, 소급 적용 안 됨)
// - category가 있으면 카테고리 탭으로 분류 (매번 다시 계산되는 값이라 기존 메일에도 바로 적용됨)
// 최소 하나는 있어야 한다.
// 조건은 전부 AND로 결합된다 (OR이 필요하면 규칙을 여러 개 만든다). 비어있는 문자열("")은 그
// 조건을 따지지 않는다는 뜻 — from/subject 중 최소 하나는 비어있지 않아야 한다(라우트에서 검증).
export interface AutoClassifyRule {
  id: string
  name?: string
  from: string
  subject: string
  excludeFrom: string
  excludeSubject: string
  targetFolderId: string | null
  category: MailCategory | null
  enabled: boolean
  createdAt: number
}

// 저장된 검색/스마트 필터: 구조화된 조건에 이름을 붙여 저장해두고 사이드바에서 재사용한다.
// 각 조건은 비어있으면(null/"") 그 조건을 따지지 않는다.
export interface SavedFilter {
  id: string
  name: string
  accountId: string | null
  from: string
  subject: string
  isUnread: boolean | null
  isStarred: boolean | null
  hasAttachment: boolean | null
  folderId: string | null
  createdAt: number
}

// 사이트 자체 메모 (앱 내부 전용 — 메일 서버와 무관)
export interface MemoItem {
  id: string
  content: string
  createdAt: number
  updatedAt: number
}

// 빠른 답장(자주 쓰는 문구) 템플릿. 앱 내부 전용, 계정과 무관하게 공용.
export interface QuickReply {
  id: string
  title: string
  body: string
  createdAt: number
}

export interface MailOrgState {
  folders: MailFolder[]
  // key: assignmentKey(accountId, mailId) in lib/mailOrg.ts -> 배정된 분류 메일함 id 목록.
  // 메일 하나가 여러 분류 메일함에 동시에 속할 수 있다 (라벨처럼 동작). 보관함은 여기 포함되지 않는다.
  assignments: Record<string, string[]>
  // key: assignmentKey(accountId, mailId) -> 보관 여부. 분류 메일함 배정과 독립적이라 보관 중에도
  // 분류 메일함에 배정될 수 있고, 반대도 가능하다.
  archived: Record<string, true>
  rules: AutoClassifyRule[]
  // 규칙 평가를 한 번이라도 거친 메일 (재평가/무한 재분류 방지용)
  classified: Record<string, true>
  // 사이드바에 표시할 계정 순서 (드래그로 조정). 여기 없는 계정은 뒤에 자연 순서대로 붙는다.
  accountOrder: string[]
  // key: accountId -> 서명 본문
  signatures: Record<string, string>
  // key: assignmentKey(accountId, mailId) -> 스누즈 해제 시각(Unix ms). 그 시각이 지나면 자동 표시.
  snoozed: Record<string, number>
  // 뮤트된 발신자 이메일 목록. 해당 발신자의 메일은 받은편지함에 표시되지 않는다.
  muted: string[]
  savedFilters: SavedFilter[]
}

// 전달(forward)로 보낼 때 원본 첨부를 다시 첨부하기 위한 참조. filename/mimeType은
// 조회 실패 시 폴백으로 쓰인다.
export interface ForwardedAttachmentRef {
  accountId: string
  mailId: string
  attachmentId: string
  filename: string
  mimeType: string
}

// 사이트 내부 알림함 전용
export interface AppNotification {
  id: string
  userId?: string
  sessionId?: string
  type: string
  message: string
  createdAt: number
  read: boolean
}

// 임시보관함. 작성 중인 메일을 주기적으로 자동저장해두고, 발송에 성공하면 지운다.
export interface Draft {
  id: string
  accountId?: string
  to?: string
  cc?: string
  bcc?: string
  subject?: string
  body?: string
  forwardedAttachments?: ForwardedAttachmentRef[]
  createdAt: number
  updatedAt: number
}

export interface Contact {
  id: string
  name: string
  email: string
  createdAt: number
}

export interface StoredSession {
  userId?: string
  loginEmail?: string
  accounts: Record<string, ConnectedAccountRecord>
  mailOrg?: MailOrgState
  memos?: MemoItem[]
  quickReplies?: QuickReply[]
  drafts?: Draft[]
  contacts?: Contact[]
}
