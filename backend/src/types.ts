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

export interface MailOrgState {
  folders: MailFolder[]
  // key: `${accountId}${mailId}` -> folderId
  assignments: Record<string, string>
}

export interface StoredSession {
  userId?: string
  accounts: Record<string, ConnectedAccountRecord>
  mailOrg?: MailOrgState
}
