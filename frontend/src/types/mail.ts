export type Provider = "gmail" | "naver" | "daum" | "imap"

export type MailCategory = "primary" | "social" | "promotions" | "updates" | "forums"

export interface Account {
  id: string
  email: string
  provider: Provider
  label: string
  color: string
}

export interface MailFolder {
  id: string
  name: string
  color: string
  createdAt: number
}

// 보관함은 사용자 정의 메일함과 동일한 배정 메커니즘을 쓰는 예약된 가상 폴더 ID
export const ARCHIVE_FOLDER_ID = "archive"

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
