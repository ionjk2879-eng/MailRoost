import type { Env, GmailAccountRecord, Mail, MailCategory } from "../types"
import { decodeRfc2047, parseFromHeader, sanitizeHtml, stripHtml } from "./mime"

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify"
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
  const res = await fetch("https://oauth2.googleapis.com/token", {
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
): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
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
    expiresAt: Date.now() + refreshed.expires_in * 1000,
  }
}

export async function fetchProfile(accessToken: string): Promise<{ emailAddress: string }> {
  const res = await fetch(`${GMAIL_API_BASE}/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Gmail profile fetch failed: ${res.status} ${await res.text()}`)
  return res.json()
}

interface GmailHeader {
  name: string
  value: string
}

interface GmailMessagePart {
  mimeType?: string
  body?: { data?: string; size?: number }
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

async function listMailsByLabel(
  accessToken: string,
  accountId: string,
  labelId: string,
  maxResults: number,
  pageToken?: string,
): Promise<{ mails: Mail[]; nextPageToken?: string }> {
  const params = new URLSearchParams({ maxResults: String(maxResults), labelIds: labelId })
  if (pageToken) params.set("pageToken", pageToken)

  const listRes = await fetch(`${GMAIL_API_BASE}/messages?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status}`)
  const listJson = (await listRes.json()) as { messages?: { id: string }[]; nextPageToken?: string }
  const ids = listJson.messages?.map((m) => m.id) ?? []

  const messages = await Promise.all(
    ids.map(async (id) => {
      const res = await fetch(
        `${GMAIL_API_BASE}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      if (!res.ok) throw new Error(`Gmail message fetch failed: ${res.status}`)
      return (await res.json()) as GmailMessage
    }),
  )

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

// 특정 메시지 ID 목록의 메타데이터를 조회 (사용자 정의 메일함 조회용).
// 서버에서 이미 삭제된 메시지는 조용히 건너뛴다 (표류한 배정 항목).
export async function fetchMailsByIds(accessToken: string, accountId: string, ids: string[]): Promise<Mail[]> {
  if (ids.length === 0) return []
  const messages = await Promise.all(
    ids.map(async (id) => {
      const res = await fetch(
        `${GMAIL_API_BASE}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      if (!res.ok) return null
      return (await res.json()) as GmailMessage
    }),
  )
  return messages.filter((m): m is GmailMessage => m !== null).map((m) => mapMessageToMail(m, accountId))
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
  const res = await fetch(`${GMAIL_API_BASE}/messages/${messageId}/modify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Gmail 별표 처리 실패: ${res.status}`)
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/")
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder("utf-8").decode(bytes)
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
  const res = await fetch(`${GMAIL_API_BASE}/messages/${messageId}/modify`, {
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
  const res = await fetch(`${GMAIL_API_BASE}/messages/${messageId}/trash`, {
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
  const res = await fetch(`${GMAIL_API_BASE}/messages/batchModify`, {
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
  const res = await fetch(`${GMAIL_API_BASE}/messages/batchDelete`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) throw new Error(`Gmail 영구 삭제 실패: ${res.status}`)
}

export async function emptyTrash(accessToken: string): Promise<void> {
  let pageToken: string | undefined
  const allIds: string[] = []
  do {
    const params = new URLSearchParams({ maxResults: "500", labelIds: "TRASH" })
    if (pageToken) params.set("pageToken", pageToken)
    const res = await fetch(`${GMAIL_API_BASE}/messages?${params}`, {
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

function encodeRfc2047Gmail(str: string): string {
  if (!/[^\x00-\x7F]/.test(str)) return str
  const bytes = new TextEncoder().encode(str)
  return `=?UTF-8?B?${(() => { let b = ""; for (let i = 0; i < bytes.length; i++) b += String.fromCharCode(bytes[i]); return btoa(b) })()}?=`
}

export async function sendGmailMessage(
  accessToken: string,
  from: string,
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  const raw = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeRfc2047Gmail(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    body,
  ].join("\r\n")

  const encoded = bytesToBase64Url(new TextEncoder().encode(raw))

  const res = await fetch(`${GMAIL_API_BASE}/messages/send`, {
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
  const res = await fetch(`${GMAIL_API_BASE}/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Gmail message fetch failed: ${res.status}`)
  const msg = (await res.json()) as GmailMessage
  const mail = mapMessageToMail(msg, accountId)
  const { text, html } = extractBody(msg.payload)
  mail.bodyHtml = html ? sanitizeHtml(html) : undefined
  mail.body = text || (html ? stripHtml(html) : "") || mail.snippet
  return mail
}
