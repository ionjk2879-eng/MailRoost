export type Provider = "gmail" | "naver" | "daum" | "imap"

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
  receivedAt: string
  isRead: boolean
  isStarred: boolean
}
