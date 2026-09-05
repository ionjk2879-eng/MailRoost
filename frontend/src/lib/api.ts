import type { Account, AppNotification, AttachmentListItem, AutoClassifyRule, Contact, Draft, ForwardedAttachmentRef, Mail, MailAttachment, MailCategory, MailFolder, MemoItem, MemoLinkedMail, QuickReply, SavedFilter } from "@/types/mail"

const AUTH_BASE = import.meta.env.DEV ? "http://localhost:8787" : ""

export const gmailLoginUrl = `${AUTH_BASE}/auth/gmail/login`

async function fetchWithTransientRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const delays = [250, 750]
  let lastError: unknown

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const res = await fetch(input, init)
      if (res.ok || res.status < 500 || attempt === delays.length) return res
    } catch (error) {
      lastError = error
      if (attempt === delays.length) throw error
    }
    await new Promise((resolve) => window.setTimeout(resolve, delays[attempt]))
  }

  throw lastError instanceof Error ? lastError : new Error("요청에 실패했습니다.")
}

async function requireOk(res: Response, fallbackMessage: string): Promise<Response> {
  if (res.ok) return res
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  throw new Error(data.error ?? `${fallbackMessage} (${res.status})`)
}

export async function fetchContacts(): Promise<Contact[]> {
  const res = await fetch("/api/contacts")
  if (!res.ok) return []
  return ((await res.json()) as { contacts: Contact[] }).contacts
}

export async function createContact(name: string, email: string): Promise<{ ok: true; contact: Contact } | { ok: false; error: string }> {
  const res = await fetch("/api/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email }) })
  const data = (await res.json().catch(() => ({}))) as { contact?: Contact; error?: string }
  return res.ok && data.contact ? { ok: true, contact: data.contact } : { ok: false, error: data.error ?? "주소 저장에 실패했습니다." }
}

export async function updateContact(
  id: string,
  patch: Partial<Pick<Contact, "name" | "email">>,
): Promise<{ ok: true; contact: Contact } | { ok: false; error: string }> {
  const res = await fetch(`/api/contacts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })
  const data = (await res.json().catch(() => ({}))) as { contact?: Contact; error?: string }
  return res.ok && data.contact ? { ok: true, contact: data.contact } : { ok: false, error: data.error ?? "주소 수정에 실패했습니다." }
}

export async function deleteContact(id: string): Promise<boolean> {
  return (await fetch(`/api/contacts/${encodeURIComponent(id)}`, { method: "DELETE" })).ok
}

export async function fetchAccounts(): Promise<Account[]> {
  const res = await requireOk(await fetchWithTransientRetry("/api/accounts"), "계정 목록을 불러오지 못했습니다.")
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
  const res = await requireOk(await fetchWithTransientRetry(url), "메일 목록을 불러오지 못했습니다.")
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

// 백업 파일 내용은 프런트가 구조를 알 필요 없이 그대로 내려받거나 업로드만 하면 되므로 unknown으로 둔다.
export async function exportMailOrgBackup(): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const res = await fetch("/api/backup/export")
  if (!res.ok) return { ok: false, error: "백업 내보내기에 실패했습니다." }
  return { ok: true, data: await res.json() }
}

export async function importMailOrgBackup(backup: unknown): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/backup/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(backup),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: data.error ?? "백업 가져오기에 실패했습니다." }
  }
  return { ok: true }
}

export async function fetchRules(): Promise<AutoClassifyRule[]> {
  const res = await fetch("/api/rules")
  if (!res.ok) return []
  const data = (await res.json()) as { rules: AutoClassifyRule[] }
  return data.rules
}

export interface RuleConditions {
  from: string
  subject: string
  excludeFrom: string
  excludeSubject: string
}

export async function createRule(
  conditions: RuleConditions,
  targetFolderId: string | null,
  category: MailCategory | null,
  name?: string,
): Promise<{ ok: true; rule: AutoClassifyRule } | { ok: false; error: string }> {
  const res = await fetch("/api/rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...conditions, targetFolderId, category, name }),
  })
  const data = (await res.json().catch(() => ({}))) as { rule?: AutoClassifyRule; error?: string }
  if (!res.ok || !data.rule) return { ok: false, error: data.error ?? "규칙 생성에 실패했습니다." }
  return { ok: true, rule: data.rule }
}

export async function updateRule(
  id: string,
  patch: Partial<Omit<AutoClassifyRule, "id" | "createdAt">>,
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

export async function applyRuleToExisting(id: string): Promise<{ ok: true; count: number; alreadyClassified: number } | { ok: false; error: string }> {
  const res = await fetch(`/api/rules/${encodeURIComponent(id)}/apply`, { method: "POST" })
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; count?: number; alreadyClassified?: number; error?: string }
  if (!res.ok || !data.ok) return { ok: false, error: data.error ?? "적용에 실패했습니다." }
  return { ok: true, count: data.count ?? 0, alreadyClassified: data.alreadyClassified ?? 0 }
}

export async function fetchSavedFilters(): Promise<SavedFilter[]> {
  const res = await fetch("/api/saved-filters")
  if (!res.ok) return []
  const data = (await res.json()) as { filters: SavedFilter[] }
  return data.filters
}

export async function createSavedFilter(
  input: Omit<SavedFilter, "id" | "createdAt">,
): Promise<{ ok: true; filter: SavedFilter } | { ok: false; error: string }> {
  const res = await fetch("/api/saved-filters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  const data = (await res.json().catch(() => ({}))) as { filter?: SavedFilter; error?: string }
  if (!res.ok || !data.filter) return { ok: false, error: data.error ?? "필터 저장에 실패했습니다." }
  return { ok: true, filter: data.filter }
}

export async function deleteSavedFilter(id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/saved-filters/${encodeURIComponent(id)}`, { method: "DELETE" })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: data.error ?? "필터 삭제에 실패했습니다." }
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
  fromFolderId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (items.length === 0) return { ok: true }
  const res = await fetch("/api/mail/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, folderId, fromFolderId }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: data.error ?? "메일 이동에 실패했습니다." }
  }
  return { ok: true }
}

// 메일 하나에 대해 특정 분류 메일함 배정을 추가/제거한다 (다른 배정에는 영향 없음).
export async function toggleMailFolder(
  accountId: string,
  mailId: string,
  folderId: string,
  assign: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/mail/folders/toggle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, mailId, folderId, assign }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: data.error ?? "분류 메일함 배정 변경에 실패했습니다." }
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

export async function fetchAttachments(): Promise<{ attachments: AttachmentListItem[]; failedAccountIds: string[] }> {
  const res = await fetch("/api/attachments")
  if (!res.ok) return { attachments: [], failedAccountIds: [] }
  const data = (await res.json()) as { attachments: AttachmentListItem[]; failedAccountIds: string[] }
  return data
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

export function inlineAttachmentUrl(mailId: string, accountId: string, attachment: MailAttachment): string {
  return `${attachmentDownloadUrl(mailId, accountId, attachment)}&inline=1`
}

export function emlDownloadUrl(mailId: string, accountId: string, subject: string): string {
  const params = new URLSearchParams({ accountId, subject })
  return `/api/mail/${encodeURIComponent(mailId)}/eml?${params}`
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

export async function markAllMailsRead(accountId: string): Promise<void> {
  await fetch("/api/mail/mark-all-read", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId }),
  })
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
  htmlBody?: string,
  attachments?: Array<{ filename: string; mimeType: string; size: number; dataBase64: string }>,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/mail/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, to, cc, bcc, subject, body, htmlBody, forwardedAttachments, attachments }),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) return { ok: false, error: data.error ?? "메일 전송에 실패했습니다." }
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

export async function createMemo(
  content: string,
  init?: { title?: string; linkedMail?: MemoLinkedMail },
): Promise<{ ok: true; memo: MemoItem } | { ok: false; error: string }> {
  const res = await fetch("/api/memos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, ...init }),
  })
  const data = (await res.json().catch(() => ({}))) as { memo?: MemoItem; error?: string }
  if (!res.ok || !data.memo) return { ok: false, error: data.error ?? "메모 생성에 실패했습니다." }
  return { ok: true, memo: data.memo }
}

export interface MemoPatch {
  content?: string
  title?: string
  color?: string | null
  pinned?: boolean
  linkedMail?: MemoLinkedMail | null
}

export async function updateMemo(id: string, patch: MemoPatch): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/memos/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
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

// ── 스누즈 ────────────────────────────────────────────────────────────────────

export function snoozeKey(accountId: string, mailId: string): string {
  return `${accountId}||${mailId}`
}

export async function fetchSnoozed(): Promise<Record<string, number>> {
  const res = await fetch("/api/snooze")
  if (!res.ok) return {}
  const data = (await res.json().catch(() => ({}))) as { snoozed?: Record<string, number> }
  return data.snoozed ?? {}
}

export async function snoozeMail(accountId: string, mailId: string, until: number): Promise<boolean> {
  const res = await fetch("/api/snooze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, mailId, until }),
  })
  return res.ok
}

export async function unsnoozeMail(accountId: string, mailId: string): Promise<boolean> {
  const res = await fetch("/api/snooze", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, mailId }),
  })
  return res.ok
}

export async function fetchMuted(): Promise<string[]> {
  const res = await fetch("/api/muted")
  if (!res.ok) return []
  const data = (await res.json()) as { muted: string[] }
  return data.muted
}

export async function muteSender(email: string): Promise<boolean> {
  const res = await fetch("/api/muted", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  })
  return res.ok
}

export async function unmuteSender(email: string): Promise<boolean> {
  const res = await fetch("/api/muted", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  })
  return res.ok
}

