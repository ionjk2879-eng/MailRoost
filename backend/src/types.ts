export interface Env {
  TOKENS: KVNamespace
  ASSETS: Fetcher
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
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
}

export interface GmailAccountRecord {
  provider: "gmail"
  email: string
  accessToken: string
  refreshToken: string
  expiresAt: number
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
export interface AutoClassifyRule {
  id: string
  field: "from" | "subject"
  keyword: string
  targetFolderId: string | null
  category: MailCategory | null
  enabled: boolean
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

// 예약발송. 도래 시각(sendAt)이 지나면 cron이 스캔해서 실제로 보내고 항목을 지운다.
// 로그인 사용자는 userId, 게스트는 sessionId만 채운다 — 계정 조회/소유권 확인 방식이 서로 다르기 때문.
export interface ScheduledMail {
  id: string
  userId?: string
  sessionId?: string
  accountId: string
  to: string
  cc?: string
  bcc?: string
  subject: string
  body: string
  forwardedAttachments?: ForwardedAttachmentRef[]
  sendAt: number
  createdAt: number
  // 발송 실패 후 재시도한 횟수. MAX_RETRIES(lib/scheduledSend.ts)에 도달하면 포기하고 실패 알림을 남긴다.
  retryCount?: number
}

// 사이트 내부 알림함 전용 — 일반 새 메일 도착은 여기 포함되지 않고, 예약발송
// 재시도/최종 실패처럼 사용자가 바로 확인하지 않으면 놓치기 쉬운 백그라운드 이벤트만 쌓인다.
export interface AppNotification {
  id: string
  userId?: string
  sessionId?: string
  type: "scheduled-retry" | "scheduled-failed"
  message: string
  scheduledMailId?: string
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

export interface StoredSession {
  userId?: string
  accounts: Record<string, ConnectedAccountRecord>
  mailOrg?: MailOrgState
  memos?: MemoItem[]
  quickReplies?: QuickReply[]
  drafts?: Draft[]
}
