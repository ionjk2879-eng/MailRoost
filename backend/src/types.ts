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

export type ConnectedAccountRecord = GmailAccountRecord | NaverAccountRecord

export interface StoredSession {
  accounts: Record<string, ConnectedAccountRecord>
}
