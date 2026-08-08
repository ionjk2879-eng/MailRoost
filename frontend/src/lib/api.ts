import type { Account, AppNotification, AutoClassifyRule, Draft, ForwardedAttachmentRef, Mail, MailAttachment, MailCategory, MailFolder, MemoItem, QuickReply, ScheduledMail } from "@/types/mail"

const AUTH_BASE = import.meta.env.DEV ? "http://localhost:8787" : ""

export const gmailLoginUrl = `${AUTH_BASE}/auth/gmail/login`

export async function fetchAccounts(): Promise<Account[]> {
  const res = await fetch("/api/accounts")
  if (!res.ok) return []
  return res.json()
}

export async function updateAccountSignature(
  id: string,
  signature: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/accounts/${encodeURIComponent(id)}/signature`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signature }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: data.error ?? "서명 저장에 실패했습니다." }
  }
  return { ok: true }
}

export async function fetchMails(cursor?: string): Promise<{ mails: Mail[]; nextCursor: string | null; failedAccountIds: string[] }> {
  const url = cursor ? `/api/mail?cursor=${encodeURIComponent(cursor)}` : "/api/mail"
  const res = await fetch(url)
  if (!res.ok) return { mails: [], nextCursor: null, failedAccountIds: [] }
  return res.json()
}

export async function fetchFolders(): Promise<MailFolder[]> {
  const res = await fetch("/api/folders")
  if (!res.ok) return []
  const data = (await res.json()) as { folders: MailFolder[] }
  return data.folders
}

export async function createFolder(name: string): Promise<{ ok: true; folder: MailFolder } | { ok: false; error: string }> {
  const res = await fetch("/api/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  })
  const data = (await res.json().catch(() => ({}))) as { folder?: MailFolder; error?: string }
  if (!res.ok || !data.folder) return { ok: false, error: data.error ?? "분류 메일함 생성에 실패했습니다." }
  return { ok: true, folder: data.folder }
}

export async function renameFolder(
  id: string,
  name: string,
  color?: string,
): Promise<{ ok: true; folder: MailFolder } | { ok: false; error: string }> {
  const res = await fetch(`/api/folders/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(color !== undefined ? { name, color } : { name }),
  })
  const data = (await res.json().catch(() => ({}))) as { folder?: MailFolder; error?: string }
  if (!res.ok || !data.folder) return { ok: false, error: data.error ?? "분류 메일함 변경에 실패했습니다." }
  return { ok: true, folder: data.folder }
}

export async function deleteFolder(id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/folders/${encodeURIComponent(id)}`, { method: "DELETE" })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: data.error ?? "분류 메일함 삭제에 실패했습니다." }
  }
  return { ok: true }
}

export async function reorderFolders(order: string[]): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/folders/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: data.error ?? "분류 메일함 순서 변경에 실패했습니다." }
  }
  return { ok: true }
}

export async function fetchRules(): Promise<AutoClassifyRule[]> {
  const res = await fetch("/api/rules")
  if (!res.ok) return []
  const data = (await res.json()) as { rules: AutoClassifyRule[] }
  return data.rules
}

export async function createRule(
  field: "from" | "subject",
  keyword: string,
  targetFolderId: string | null,
  category: MailCategory | null,
): Promise<{ ok: true; rule: AutoClassifyRule } | { ok: false; error: string }> {
  const res = await fetch("/api/rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ field, keyword, targetFolderId, category }),
  })
  const data = (await res.json().catch(() => ({}))) as { rule?: AutoClassifyRule; error?: string }
  if (!res.ok || !data.rule) return { ok: false, error: data.error ?? "규칙 생성에 실패했습니다." }
  return { ok: true, rule: data.rule }
}

export async function updateRule(
  id: string,
  patch: Partial<Pick<AutoClassifyRule, "field" | "keyword" | "targetFolderId" | "category" | "enabled">>,
): Promise<{ ok: true; rule: AutoClassifyRule } | { ok: false; error: string }> {
  const res = await fetch(`/api/rules/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })
  const data = (await res.json().catch(() => ({}))) as { rule?: AutoClassifyRule; error?: string }
  if (!res.ok || !data.rule) return { ok: false, error: data.error ?? "규칙 수정에 실패했습니다." }
  return { ok: true, rule: data.rule }
}

export async function deleteRule(id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/rules/${encodeURIComponent(id)}`, { method: "DELETE" })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: data.error ?? "규칙 삭제에 실패했습니다." }
  }
  return { ok: true }
}

export async function fetchFolderMails(folderId: string): Promise<Mail[]> {
  const res = await fetch(`/api/folders/${encodeURIComponent(folderId)}/mail`)
  if (!res.ok) return []
  const data = (await res.json()) as { mails: Mail[] }
  return data.mails
}

export async function moveMails(
  items: { accountId: string; mailId: string }[],
  folderId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (items.length === 0) return { ok: true }
  const res = await fetch("/api/mail/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, folderId }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: data.error ?? "메일 이동에 실패했습니다." }
  }
  return { ok: true }
}

export async function fetchTrashMails(cursor?: string): Promise<{ mails: Mail[]; nextCursor: string | null }> {
  const url = cursor ? `/api/trash?cursor=${encodeURIComponent(cursor)}` : "/api/trash"
  const res = await fetch(url)
  if (!res.ok) return { mails: [], nextCursor: null }
  return res.json()
}

export async function permanentDeleteFromTrash(accountId: string, mailIds: string[]): Promise<{ ok: boolean; error?: string }> {
  if (mailIds.length === 0) return { ok: true }
  const res = await fetch("/api/trash/bulk-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, mailIds }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: data.error ?? "메일을 영구 삭제하지 못했습니다." }
  }
  return { ok: true }
}

export async function restoreFromTrash(accountId: string, mailIds: string[]): Promise<{ ok: boolean; error?: string }> {
  if (mailIds.length === 0) return { ok: true }
  const res = await fetch("/api/trash/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, mailIds }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: data.error ?? "메일을 복구하지 못했습니다." }
  }
  return { ok: true }
}

export async function emptyTrash(accountId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/trash/empty", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: data.error ?? "휴지통을 비우지 못했습니다." }
  }
  return { ok: true }
}

export async function emptyAllTrash(): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/trash/empty-all", { method: "POST" })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: data.error ?? "휴지통을 비우지 못했습니다." }
  }
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; failedAccountIds?: string[] }
  if (data.ok === false) {
    return { ok: false, error: `일부 계정 휴지통을 비우지 못했습니다 (${data.failedAccountIds?.length ?? 0}개).` }
  }
  return { ok: true }
}

export async function fetchMailDetail(id: string, accountId: string): Promise<Mail | null> {
  const res = await fetch(`/api/mail/${encodeURIComponent(id)}?accountId=${encodeURIComponent(accountId)}`)
  if (!res.ok) return null
  return res.json()
}

// Gmail 첨부는 filename/mimeType이 서버 응답에 없어 상세보기에서 이미 받아둔 값을 쿼리로 실어보낸다.
export function attachmentDownloadUrl(mailId: string, accountId: string, attachment: MailAttachment): string {
  const params = new URLSearchParams({
    accountId,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
  })
  return `/api/mail/${encodeURIComponent(mailId)}/attachment/${encodeURIComponent(attachment.id)}?${params}`
}

export async function fetchCurrentUser(): Promise<{ id: string; email: string } | null> {
  const res = await fetch("/api/me")
  if (!res.ok) return null
  return res.json()
}

export async function markAsRead(id: string, accountId: string): Promise<void> {
  await fetch(
    `/api/mail/${encodeURIComponent(id)}/read?accountId=${encodeURIComponent(accountId)}`,
    { method: "PATCH" },
  )
}

export async function toggleStar(id: string, accountId: string, starred: boolean): Promise<void> {
  await fetch(
    `/api/mail/${encodeURIComponent(id)}/star?accountId=${encodeURIComponent(accountId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ starred }),
    },
  )
}

export async function markAsUnread(id: string, accountId: string): Promise<void> {
  await fetch(
    `/api/mail/${encodeURIComponent(id)}/read?accountId=${encodeURIComponent(accountId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read: false }),
    },
  )
}

export async function deleteMail(id: string, accountId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(
    `/api/mail/${encodeURIComponent(id)}?accountId=${encodeURIComponent(accountId)}`,
    { method: "DELETE" },
  )
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: data.error ?? "메일 삭제에 실패했습니다." }
  }
  return { ok: true }
}

export async function bulkMarkRead(accountId: string, mailIds: string[], read: boolean): Promise<void> {
  if (mailIds.length === 0) return
  await fetch("/api/mail/bulk/read", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, mailIds, read }),
  })
}

export async function bulkToggleStar(accountId: string, mailIds: string[], starred: boolean): Promise<void> {
  if (mailIds.length === 0) return
  await fetch("/api/mail/bulk/star", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, mailIds, starred }),
  })
}

export async function bulkDeleteMails(accountId: string, mailIds: string[]): Promise<{ ok: boolean; error?: string }> {
  if (mailIds.length === 0) return { ok: true }
  const res = await fetch("/api/mail/bulk-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, mailIds }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: data.error ?? "메일 삭제에 실패했습니다." }
  }
  return { ok: true }
}

export async function sendMail(
  accountId: string,
  to: string,
  subject: string,
  body: string,
  cc?: string,
  bcc?: string,
  forwardedAttachments?: ForwardedAttachmentRef[],
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/mail/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, to, cc, bcc, subject, body, forwardedAttachments }),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) return { ok: false, error: data.error ?? "메일 전송에 실패했습니다." }
  return { ok: true }
}

export async function fetchScheduledMails(): Promise<ScheduledMail[]> {
  const res = await fetch("/api/scheduled-mails")
  if (!res.ok) return []
  const data = (await res.json()) as { scheduledMails: ScheduledMail[] }
  return data.scheduledMails
}

export async function scheduleMail(
  accountId: string,
  to: string,
  subject: string,
  body: string,
  sendAt: number,
  cc?: string,
  bcc?: string,
  forwardedAttachments?: ForwardedAttachmentRef[],
): Promise<{ ok: true; scheduledMail: ScheduledMail } | { ok: false; error: string }> {
  const res = await fetch("/api/scheduled-mails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, to, cc, bcc, subject, body, sendAt, forwardedAttachments }),
  })
  const data = (await res.json().catch(() => ({}))) as { scheduledMail?: ScheduledMail; error?: string }
  if (!res.ok || !data.scheduledMail) return { ok: false, error: data.error ?? "예약발송 등록에 실패했습니다." }
  return { ok: true, scheduledMail: data.scheduledMail }
}

export async function cancelScheduledMail(id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/scheduled-mails/${encodeURIComponent(id)}`, { method: "DELETE" })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: data.error ?? "예약발송 취소에 실패했습니다." }
  }
  return { ok: true }
}

export async function fetchNotifications(): Promise<AppNotification[]> {
  const res = await fetch("/api/notifications")
  if (!res.ok) return []
  const data = (await res.json()) as { notifications: AppNotification[] }
  return data.notifications
}

export async function markNotificationRead(id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: data.error ?? "알림 확인 처리에 실패했습니다." }
  }
  return { ok: true }
}

export async function markAllNotificationsRead(): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/notifications/read-all", { method: "POST" })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: data.error ?? "알림 확인 처리에 실패했습니다." }
  }
  return { ok: true }
}

export async function dismissNotification(id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/notifications/${encodeURIComponent(id)}`, { method: "DELETE" })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: data.error ?? "알림 삭제에 실패했습니다." }
  }
  return { ok: true }
}

// 이미 불러온 메일 안에서만 훑는 게 아니라 서버(Gmail 검색 / IMAP SEARCH)에서 직접 검색한다.
export async function searchMails(query: string): Promise<{ mails: Mail[]; failedAccountIds: string[] }> {
  const res = await fetch(`/api/mail/search?q=${encodeURIComponent(query)}`)
  if (!res.ok) return { mails: [], failedAccountIds: [] }
  return res.json()
}

export async function fetchMemos(): Promise<MemoItem[]> {
  const res = await fetch("/api/memos")
  if (!res.ok) return []
  const data = (await res.json()) as { memos: MemoItem[] }
  return data.memos
}

export async function createMemo(content: string): Promise<{ ok: true; memo: MemoItem } | { ok: false; error: string }> {
  const res = await fetch("/api/memos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  })
  const data = (await res.json().catch(() => ({}))) as { memo?: MemoItem; error?: string }
  if (!res.ok || !data.memo) return { ok: false, error: data.error ?? "메모 생성에 실패했습니다." }
  return { ok: true, memo: data.memo }
}

export async function updateMemo(id: string, content: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/memos/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: data.error ?? "메모 저장에 실패했습니다." }
  }
  return { ok: true }
}

export async function deleteMemo(id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/memos/${encodeURIComponent(id)}`, { method: "DELETE" })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: data.error ?? "메모 삭제에 실패했습니다." }
  }
  return { ok: true }
}

export async function fetchQuickReplies(): Promise<QuickReply[]> {
  const res = await fetch("/api/quick-replies")
  if (!res.ok) return []
  const data = (await res.json()) as { quickReplies: QuickReply[] }
  return data.quickReplies
}

export async function createQuickReply(
  title: string,
  body: string,
): Promise<{ ok: true; quickReply: QuickReply } | { ok: false; error: string }> {
  const res = await fetch("/api/quick-replies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, body }),
  })
  const data = (await res.json().catch(() => ({}))) as { quickReply?: QuickReply; error?: string }
  if (!res.ok || !data.quickReply) return { ok: false, error: data.error ?? "빠른 답장 생성에 실패했습니다." }
  return { ok: true, quickReply: data.quickReply }
}

export async function updateQuickReply(
  id: string,
  patch: Partial<Pick<QuickReply, "title" | "body">>,
): Promise<{ ok: true; quickReply: QuickReply } | { ok: false; error: string }> {
  const res = await fetch(`/api/quick-replies/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })
  const data = (await res.json().catch(() => ({}))) as { quickReply?: QuickReply; error?: string }
  if (!res.ok || !data.quickReply) return { ok: false, error: data.error ?? "빠른 답장 수정에 실패했습니다." }
  return { ok: true, quickReply: data.quickReply }
}

export async function deleteQuickReply(id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/quick-replies/${encodeURIComponent(id)}`, { method: "DELETE" })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: data.error ?? "빠른 답장 삭제에 실패했습니다." }
  }
  return { ok: true }
}

interface DraftFields {
  accountId?: string
  to?: string
  cc?: string
  bcc?: string
  subject?: string
  body?: string
  forwardedAttachments?: ForwardedAttachmentRef[]
}

export async function fetchDrafts(): Promise<Draft[]> {
  const res = await fetch("/api/drafts")
  if (!res.ok) return []
  const data = (await res.json()) as { drafts: Draft[] }
  return data.drafts
}

export async function createDraft(fields: DraftFields): Promise<{ ok: true; draft: Draft } | { ok: false; error: string }> {
  const res = await fetch("/api/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  })
  const data = (await res.json().catch(() => ({}))) as { draft?: Draft; error?: string }
  if (!res.ok || !data.draft) return { ok: false, error: data.error ?? "임시보관 저장에 실패했습니다." }
  return { ok: true, draft: data.draft }
}

export async function updateDraft(
  id: string,
  fields: DraftFields,
): Promise<{ ok: true; draft: Draft } | { ok: false; error: string }> {
  const res = await fetch(`/api/drafts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  })
  const data = (await res.json().catch(() => ({}))) as { draft?: Draft; error?: string }
  if (!res.ok || !data.draft) return { ok: false, error: data.error ?? "임시보관 저장에 실패했습니다." }
  return { ok: true, draft: data.draft }
}

export async function deleteDraft(id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/drafts/${encodeURIComponent(id)}`, { method: "DELETE" })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: data.error ?? "임시보관 삭제에 실패했습니다." }
  }
  return { ok: true }
}

export async function logout(): Promise<void> {
  await fetch("/auth/logout", { method: "POST" })
}

export async function deleteAccount(id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/accounts/${encodeURIComponent(id)}`, { method: "DELETE" })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: data.error ?? "계정 삭제에 실패했습니다." }
  }
  return { ok: true }
}

export async function reorderAccounts(order: string[]): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/accounts/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: data.error ?? "계정 순서 변경에 실패했습니다." }
  }
  return { ok: true }
}

export async function connectNaverAccount(
  email: string,
  appPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/auth/naver/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, appPassword }),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) return { ok: false, error: data.error ?? "네이버 계정 연결에 실패했습니다." }
  return { ok: true }
}

export async function connectDaumAccount(
  email: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/auth/daum/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) return { ok: false, error: data.error ?? "다음 계정 연결에 실패했습니다." }
  return { ok: true }
}

export async function connectImapAccount(params: {
  host: string
  port: number
  email: string
  password: string
  label: string
  smtpHost?: string
  smtpPort?: number
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/auth/imap/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) return { ok: false, error: data.error ?? "IMAP 계정 연결에 실패했습니다." }
  return { ok: true }
}
