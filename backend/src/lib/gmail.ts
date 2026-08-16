import type { Env, GmailAccountRecord, Mail, MailAttachment, MailCategory } from "../types"
import { buildMimeMessage, decodeRfc2047, parseAddressList, parseFromHeader, sanitizeHtml, stripHtml } from "./mime"
import type { OutgoingAttachment } from "./mime"
import { fetchWithRetry } from "./httpRetry"

// gmail.modify로는 라벨 변경/휴지통 이동까지만 되고 영구 삭제(batchDelete)는 403이 난다.
// 휴지통 비우기/선택 영구삭제를 지원하려면 전체 계정 접근 스코프가 필요하다.
const GMAIL_SCOPE = "https://mail.google.com/"
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"

export function buildAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  url.searchParams.set("client_id", clientId)
  url.searchParams.set("redirect_uri", redirectUri)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", GMAIL_SCOPE)
  url.searchParams.set("access_type", "offline")
  url.searchParams.set("prompt", "select_account consent")
  url.searchParams.set("state", state)
  return url.toString()
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  scope: string
}

export async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const res = await fetchWithRetry("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  })
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`)
  }
  return res.json()
}

async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{ access_token: string; expires_in: number; refresh_token?: string }> {
  const res = await fetchWithRetry("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  })
  if (!res.ok) {
    throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`)
  }
  return res.json()
}

export async function ensureFreshToken(env: Env, record: GmailAccountRecord): Promise<GmailAccountRecord> {
  if (record.expiresAt > Date.now() + 60_000) return record
  const refreshed = await refreshAccessToken(record.refreshToken, env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET)
  return {
    ...record,
    accessToken: refreshed.access_token,
    // Google은 보통 refresh 응답에 refresh_token을 다시 안 주지만(같은 걸 계속 씀), 드물게
    // 새 값을 줄 수도 있다는 게 공식 문서상 명시돼 있다 — 오면 반드시 갈아끼워야 한다. 옛 값을
    // 계속 쓰면 그게 무효화됐을 때(로테이션된 경우) 이후 refresh가 전부 실패하게 된다.
    refreshToken: refreshed.refresh_token ?? record.refreshToken,
    expiresAt: Date.now() + refreshed.expires_in * 1000,
  }
}

export async function fetchProfile(accessToken: string): Promise<{ emailAddress: string }> {
  const res = await fetchWithRetry(`${GMAIL_API_BASE}/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Gmail profile fetch failed: ${res.status} ${await res.text()}`)
  return res.json()
}

// Pub/Sub push notification을 받기 위해 이 메일함(INBOX)을 지정한 토픽에 watch 등록한다.
// Gmail watch는 최대 7일(expiration)까지만 유효해서 주기적으로 다시 걸어야 한다
// (lib/gmailWatch.ts의 renewExpiringWatches 참고).
export async function watchMailbox(accessToken: string, topicName: string): Promise<{ historyId: string; expiration: number }> {
  const res = await fetchWithRetry(`${GMAIL_API_BASE}/watch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ topicName, labelIds: ["INBOX"] }),
  })
  if (!res.ok) throw new Error(`Gmail watch 등록 실패: ${res.status} ${await res.text()}`)
  const json = (await res.json()) as { historyId: string; expiration: string }
  return { historyId: json.historyId, expiration: Number(json.expiration) }
}

interface GmailHistoryRecord {
  id: string
  messagesAdded?: { message: { id: string } }[]
}

// startHistoryId 이후로 새로 추가된 메시지 id를 전부 모아온다 (INBOX에 국한하지 않고 새로
// messagesAdded된 것 전부를 대상으로 하되, 실제로 관심 있는 건 새 메일 도착이므로 그걸로 충분하다).
// startHistoryId가 너무 오래돼 서버가 더는 못 돌려주면(404) null을 반환한다 — 호출부가 이를
// "히스토리 유실, 다음 정기 동기화가 자연히 커버함"으로 취급하고 조용히 넘어가야 한다.
export async function listHistory(
  accessToken: string,
  startHistoryId: string,
): Promise<{ messageIds: string[]; newHistoryId: string } | null> {
  const messageIds = new Set<string>()
  let newHistoryId = startHistoryId
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({ startHistoryId, historyTypes: "messageAdded" })
    if (pageToken) params.set("pageToken", pageToken)

    const res = await fetchWithRetry(`${GMAIL_API_BASE}/history?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Gmail history 조회 실패: ${res.status} ${await res.text()}`)

    const json = (await res.json()) as { history?: GmailHistoryRecord[]; historyId?: string; nextPageToken?: string }
    for (const record of json.history ?? []) {
      for (const added of record.messagesAdded ?? []) {
        if (added.message?.id) messageIds.add(added.message.id)
      }
    }
    if (json.historyId) newHistoryId = json.historyId
    pageToken = json.nextPageToken
  } while (pageToken)

  return { messageIds: [...messageIds], newHistoryId }
}

interface GmailHeader {
  name: string
  value: string
}

interface GmailMessagePart {
  mimeType?: string
  filename?: string
  headers?: GmailHeader[]
  body?: { data?: string; size?: number; attachmentId?: string }
  parts?: GmailMessagePart[]
}

interface GmailMessage {
  id: string
  snippet?: string
  internalDate?: string
  labelIds?: string[]
  payload?: { headers?: GmailHeader[] } & GmailMessagePart
}

function getHeader(headers: GmailHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ""
}

const CATEGORY_LABEL_MAP: Record<string, MailCategory> = {
  CATEGORY_PERSONAL: "primary",
  CATEGORY_SOCIAL: "social",
  CATEGORY_PROMOTIONS: "promotions",
  CATEGORY_UPDATES: "updates",
  CATEGORY_FORUMS: "forums",
}

function deriveCategory(labelIds: string[]): MailCategory {
  for (const labelId of labelIds) {
    const category = CATEGORY_LABEL_MAP[labelId]
    if (category) return category
  }
  return "primary"
}

function mapMessageToMail(msg: GmailMessage, accountId: string): Mail {
  const headers = msg.payload?.headers
  const { name: fromName, email: fromEmail } = parseFromHeader(getHeader(headers, "From"))
  const labelIds = msg.labelIds ?? []
  return {
    id: msg.id,
    accountId,
    fromName,
    fromEmail,
    subject: decodeRfc2047(getHeader(headers, "Subject")) || "(제목 없음)",
    snippet: msg.snippet ?? "",
    body: msg.snippet ?? "",
    category: deriveCategory(labelIds),
    receivedAt: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : new Date().toISOString(),
    isRead: !labelIds.includes("UNREAD"),
    isStarred: labelIds.includes("STARRED"),
  }
}

// Gmail의 batch API로 여러 메시지를 "한 번의 HTTP 요청"으로 조회한다.
// 메시지 개수만큼 fetch()를 날리면 Cloudflare Workers의 "요청당 서브리퀘스트 개수" 한도를
// 쉽게 넘어버려서 (계정이 여러 개거나 페이지가 크면) 전체 요청이 그냥 500으로 죽는다.
const GMAIL_BATCH_CHUNK_SIZE = 90 // Gmail batch API 자체 한도(100)에 여유를 두고 나눈다

async function batchGetMessages(accessToken: string, ids: string[]): Promise<GmailMessage[]> {
  if (ids.length === 0) return []
  if (ids.length > GMAIL_BATCH_CHUNK_SIZE) {
    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += GMAIL_BATCH_CHUNK_SIZE) chunks.push(ids.slice(i, i + GMAIL_BATCH_CHUNK_SIZE))
    const results = await Promise.all(chunks.map((chunk) => batchGetMessages(accessToken, chunk)))
    return results.flat()
  }

  const boundary = `batch_${crypto.randomUUID()}`
  const body =
    ids
      .map((id, i) => {
        const path = `/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`
        return `--${boundary}\r\nContent-Type: application/http\r\nContent-ID: <item${i}>\r\n\r\nGET ${path}\r\n\r\n`
      })
      .join("") + `--${boundary}--`

  const res = await fetchWithRetry("https://gmail.googleapis.com/batch/gmail/v1", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/mixed; boundary=${boundary}`,
    },
    body,
  })
  if (!res.ok) throw new Error(`Gmail batch fetch failed: ${res.status}`)
  const text = await res.text()

  const responseBoundaryMatch = (res.headers.get("Content-Type") ?? "").match(/boundary=(?:"([^"]+)"|([^;]+))/)
  const responseBoundary = responseBoundaryMatch ? (responseBoundaryMatch[1] ?? responseBoundaryMatch[2]) : boundary

  const messages: GmailMessage[] = []
  for (const section of text.split(`--${responseBoundary}`)) {
    const jsonStart = section.indexOf("{")
    const jsonEnd = section.lastIndexOf("}")
    if (jsonStart === -1 || jsonEnd === -1) continue
    try {
      const parsed = JSON.parse(section.slice(jsonStart, jsonEnd + 1)) as GmailMessage
      if (parsed.id) messages.push(parsed)
    } catch {
      // 파싱 실패한 파트는 건너뛴다 (한 메시지가 개별적으로 404 등을 반환한 경우 등)
    }
  }
  return messages
}

async function listMailsByLabel(
  accessToken: string,
  accountId: string,
  labelId: string,
  maxResults: number,
  pageToken?: string,
): Promise<{ mails: Mail[]; nextPageToken?: string }> {
  const params = new URLSearchParams({ maxResults: String(maxResults), labelIds: labelId })
  if (pageToken) params.set("pageToken", pageToken)

  const listRes = await fetchWithRetry(`${GMAIL_API_BASE}/messages?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status}`)
  const listJson = (await listRes.json()) as { messages?: { id: string }[]; nextPageToken?: string }
  const ids = listJson.messages?.map((m) => m.id) ?? []

  const messages = await batchGetMessages(accessToken, ids)

  return { mails: messages.map((m) => mapMessageToMail(m, accountId)), nextPageToken: listJson.nextPageToken }
}

export async function listInboxMails(
  accessToken: string,
  accountId: string,
  maxResults = 20,
  pageToken?: string,
): Promise<{ mails: Mail[]; nextPageToken?: string }> {
  return listMailsByLabel(accessToken, accountId, "INBOX", maxResults, pageToken)
}

// Gmail 자체 검색(q 파라미터)으로 받은편지함 안에서 검색한다.
export async function searchMails(
  accessToken: string,
  accountId: string,
  query: string,
  maxResults = 30,
): Promise<Mail[]> {
  const params = new URLSearchParams({ maxResults: String(maxResults), q: `in:inbox ${query}` })
  const listRes = await fetchWithRetry(`${GMAIL_API_BASE}/messages?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!listRes.ok) throw new Error(`Gmail 검색 실패: ${listRes.status}`)
  const listJson = (await listRes.json()) as { messages?: { id: string }[] }
  const ids = listJson.messages?.map((m) => m.id) ?? []
  const messages = await batchGetMessages(accessToken, ids)
  return messages.map((m) => mapMessageToMail(m, accountId))
}

// 특정 메시지 ID 목록의 메타데이터를 조회 (사용자 정의 분류 조회용).
// 서버에서 이미 삭제된 메시지는 조용히 건너뛴다 (표류한 배정 항목).
export async function fetchMailsByIds(accessToken: string, accountId: string, ids: string[]): Promise<Mail[]> {
  const messages = await batchGetMessages(accessToken, ids)
  return messages.map((m) => mapMessageToMail(m, accountId))
}

export async function listTrashMails(
  accessToken: string,
  accountId: string,
  maxResults = 20,
  pageToken?: string,
): Promise<{ mails: Mail[]; nextPageToken?: string }> {
  return listMailsByLabel(accessToken, accountId, "TRASH", maxResults, pageToken)
}

export async function toggleStar(accessToken: string, messageId: string, starred: boolean): Promise<void> {
  const body = starred ? { addLabelIds: ["STARRED"] } : { removeLabelIds: ["STARRED"] }
  const res = await fetchWithRetry(`${GMAIL_API_BASE}/messages/${encodeURIComponent(messageId)}/modify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Gmail 별표 처리 실패: ${res.status}`)
}

function decodeBase64UrlToBytes(data: string): Uint8Array {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/")
  const binary = atob(base64)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

function decodeBase64Url(data: string): string {
  return new TextDecoder("utf-8").decode(decodeBase64UrlToBytes(data))
}

function findPart(part: GmailMessagePart, mimeType: string): GmailMessagePart | undefined {
  if (part.mimeType === mimeType && part.body?.data) return part
  if (part.parts) {
    for (const child of part.parts) {
      const found = findPart(child, mimeType)
      if (found) return found
    }
  }
  return undefined
}

// 파일명이 있고 attachmentId가 붙은 파트만 첨부파일로 취급한다 (본문 text/html 파트는 filename이 없다).
function collectAttachments(part: GmailMessagePart | undefined, out: MailAttachment[]): void {
  if (!part) return
  const contentId = getHeader(part.headers, "Content-ID").replace(/^<|>$/g, "") || undefined
  if (part.body?.attachmentId && (part.filename || contentId)) {
    out.push({
      id: part.body.attachmentId,
      filename: part.filename ? decodeRfc2047(part.filename) : "인라인 이미지",
      mimeType: part.mimeType || "application/octet-stream",
      size: part.body.size ?? 0,
      contentId,
    })
  }
  if (part.parts) for (const child of part.parts) collectAttachments(child, out)
}

function extractBody(payload: GmailMessagePart | undefined): { text?: string; html?: string } {
  if (!payload) return {}
  const plainPart = findPart(payload, "text/plain")
  const htmlPart = findPart(payload, "text/html")
  const text = plainPart?.body?.data ? decodeBase64Url(plainPart.body.data) : undefined
  const html = htmlPart?.body?.data ? decodeBase64Url(htmlPart.body.data) : undefined
  if (text || html) return { text, html }
  if (payload.body?.data) {
    const raw = decodeBase64Url(payload.body.data)
    return payload.mimeType === "text/html" ? { html: raw } : { text: raw }
  }
  return {}
}

async function modifyLabels(accessToken: string, messageId: string, body: object): Promise<void> {
  const res = await fetchWithRetry(`${GMAIL_API_BASE}/messages/${encodeURIComponent(messageId)}/modify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Gmail 라벨 변경 실패: ${res.status}`)
}

export async function markAsRead(accessToken: string, messageId: string): Promise<void> {
  await modifyLabels(accessToken, messageId, { removeLabelIds: ["UNREAD"] })
}

export async function markAsUnread(accessToken: string, messageId: string): Promise<void> {
  await modifyLabels(accessToken, messageId, { addLabelIds: ["UNREAD"] })
}

export async function trashMail(accessToken: string, messageId: string): Promise<void> {
  const res = await fetchWithRetry(`${GMAIL_API_BASE}/messages/${encodeURIComponent(messageId)}/trash`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Gmail 삭제 실패: ${res.status}`)
}

export async function batchModifyMessages(
  accessToken: string,
  ids: string[],
  body: { addLabelIds?: string[]; removeLabelIds?: string[] },
): Promise<void> {
  if (ids.length === 0) return
  const res = await fetchWithRetry(`${GMAIL_API_BASE}/messages/batchModify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ids, ...body }),
  })
  if (!res.ok) throw new Error(`Gmail 일괄 처리 실패: ${res.status}`)
}

export async function trashMailBulk(accessToken: string, ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => trashMail(accessToken, id)))
}

// 휴지통(TRASH 라벨)에서 완전히 삭제
export async function batchDeleteMessages(accessToken: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const res = await fetchWithRetry(`${GMAIL_API_BASE}/messages/batchDelete`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) throw new Error(`Gmail 영구 삭제 실패: ${res.status}`)
}

// 휴지통에서 받은편지함으로 복구 (TRASH 라벨 제거 + INBOX 라벨 추가)
export async function restoreFromTrashBulk(accessToken: string, ids: string[]): Promise<void> {
  await batchModifyMessages(accessToken, ids, { addLabelIds: ["INBOX"], removeLabelIds: ["TRASH"] })
}

export async function markAllInboxUnreadAsRead(accessToken: string): Promise<void> {
  let pageToken: string | undefined
  const allIds: string[] = []
  do {
    const params = new URLSearchParams({ maxResults: "500", q: "is:unread in:inbox" })
    if (pageToken) params.set("pageToken", pageToken)
    const res = await fetchWithRetry(`${GMAIL_API_BASE}/messages?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) break
    const json = (await res.json()) as { messages?: { id: string }[]; nextPageToken?: string }
    for (const m of json.messages ?? []) allIds.push(m.id)
    pageToken = json.nextPageToken
  } while (pageToken)

  for (let i = 0; i < allIds.length; i += 1000) {
    await batchModifyMessages(accessToken, allIds.slice(i, i + 1000), { removeLabelIds: ["UNREAD"] })
  }
}

export async function emptyTrash(accessToken: string): Promise<void> {
  let pageToken: string | undefined
  const allIds: string[] = []
  do {
    const params = new URLSearchParams({ maxResults: "500", labelIds: "TRASH" })
    if (pageToken) params.set("pageToken", pageToken)
    const res = await fetchWithRetry(`${GMAIL_API_BASE}/messages?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) throw new Error(`Gmail 휴지통 조회 실패: ${res.status}`)
    const json = (await res.json()) as { messages?: { id: string }[]; nextPageToken?: string }
    for (const m of json.messages ?? []) allIds.push(m.id)
    pageToken = json.nextPageToken
  } while (pageToken)

  for (let i = 0; i < allIds.length; i += 500) {
    await batchDeleteMessages(accessToken, allIds.slice(i, i + 500))
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

export async function sendGmailMessage(
  accessToken: string,
  from: string,
  to: string,
  subject: string,
  body: string,
  cc?: string,
  bcc?: string,
  attachments?: OutgoingAttachment[],
): Promise<void> {
  const raw = buildMimeMessage({ from, to, cc, bcc, subject, textBody: body, attachments })
  const encoded = bytesToBase64Url(new TextEncoder().encode(raw))

  const res = await fetchWithRetry(`${GMAIL_API_BASE}/messages/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encoded }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Gmail 전송 실패: ${res.status} ${text}`)
  }
}

export async function getMailDetail(accessToken: string, accountId: string, messageId: string): Promise<Mail> {
  const res = await fetchWithRetry(`${GMAIL_API_BASE}/messages/${encodeURIComponent(messageId)}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Gmail message fetch failed: ${res.status}`)
  const msg = (await res.json()) as GmailMessage
  const mail = mapMessageToMail(msg, accountId)
  const { text, html } = extractBody(msg.payload)
  mail.bodyHtml = html ? sanitizeHtml(html) : undefined
  mail.body = text || (html ? stripHtml(html) : "") || mail.snippet
  const attachments: MailAttachment[] = []
  collectAttachments(msg.payload, attachments)
  if (attachments.length > 0) mail.attachments = attachments
  const toHeader = getHeader(msg.payload?.headers, "To")
  const ccHeader = getHeader(msg.payload?.headers, "Cc")
  if (toHeader) mail.toRecipients = parseAddressList(toHeader)
  if (ccHeader) mail.ccRecipients = parseAddressList(ccHeader)
  return mail
}

export async function getAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string,
): Promise<{ bytes: Uint8Array } | null> {
  const res = await fetchWithRetry(`${GMAIL_API_BASE}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Gmail 첨부파일 조회 실패: ${res.status}`)
  const json = (await res.json()) as { data?: string }
  if (!json.data) return null
  return { bytes: decodeBase64UrlToBytes(json.data) }
}
