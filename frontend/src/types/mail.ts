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

export interface MailFolder {
  id: string
  name: string
  color: string
  createdAt: number
}

// 보관함은 사용자 정의 분류와 동일한 배정 메커니즘을 쓰는 예약된 가상 폴더 ID
export const ARCHIVE_FOLDER_ID = "archive"

export interface AutoClassifyRule {
  id: string
  name?: string
  field: "from" | "subject"
  keyword: string
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

export interface MemoItem {
  id: string
  content: string
  createdAt: number
  updatedAt: number
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
  // 배정된 사용자 정의 분류 메일함 id 목록 (여러 개에 동시에 속할 수 있다)
  folderIds?: string[]
}

export interface QuickReply {
  id: string
  title: string
  body: string
  createdAt: number
}

export interface ForwardedAttachmentRef {
  accountId: string
  mailId: string
  attachmentId: string
  filename: string
  mimeType: string
  size: number
}

// 사이트 내부 알림함 전용
export interface AppNotification {
  id: string
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
