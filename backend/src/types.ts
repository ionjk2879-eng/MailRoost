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
}

export type ConnectedAccountRecord = GmailAccountRecord | NaverAccountRecord | DaumAccountRecord | ImapAccountRecord

export interface UserRecord {
  id: string
  email: string
}

// 사용자 정의 메일함 (앱 내부 전용 — 실제 메일 서버에는 반영되지 않음)
export interface MailFolder {
  id: string
  name: string
  color: string
  createdAt: number
}

// 자동분류 규칙: 보낸사람/제목에 키워드가 포함되면 지정한 메일함(또는 보관함)으로 자동 이동.
// 새로 도착한(=한 번이라도 평가된 적 없는) 메일에만 적용되고, 기존 메일에는 소급 적용되지 않는다.
export interface AutoClassifyRule {
  id: string
  field: "from" | "subject"
  keyword: string
  targetFolderId: string
  enabled: boolean
  createdAt: number
}

export interface MailOrgState {
  folders: MailFolder[]
  // key: assignmentKey(accountId, mailId) in lib/mailOrg.ts -> folderId
  assignments: Record<string, string>
  rules: AutoClassifyRule[]
  // 규칙 평가를 한 번이라도 거친 메일 (재평가/무한 재분류 방지용)
  classified: Record<string, true>
  // 사이드바에 표시할 계정 순서 (드래그로 조정). 여기 없는 계정은 뒤에 자연 순서대로 붙는다.
  accountOrder: string[]
}

export interface StoredSession {
  userId?: string
  accounts: Record<string, ConnectedAccountRecord>
  mailOrg?: MailOrgState
}
