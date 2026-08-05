import type { Env, GmailTokenRecord, Mail, MailCategory } from "../types"

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
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

export async function ensureFreshToken(env: Env, record: GmailTokenRecord): Promise<GmailTokenRecord> {
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

function parseFromHeader(from: string): { name: string; email: string } {
  const match = from.match(/^(.*?)\s*<(.+)>$/)
  if (match) {
    return { name: match[1].replace(/"/g, "").trim() || match[2], email: match[2] }
  }
  return { name: from, email: from }
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
    subject: getHeader(headers, "Subject") || "(제목 없음)",
    snippet: msg.snippet ?? "",
    body: msg.snippet ?? "",
    category: deriveCategory(labelIds),
    receivedAt: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : new Date().toISOString(),
    isRead: !labelIds.includes("UNREAD"),
    isStarred: labelIds.includes("STARRED"),
  }
}

export async function listInboxMails(accessToken: string, accountId: string, maxResults = 20): Promise<Mail[]> {
  const listRes = await fetch(`${GMAIL_API_BASE}/messages?maxResults=${maxResults}&labelIds=INBOX`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status}`)
  const listJson = (await listRes.json()) as { messages?: { id: string }[] }
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

  return messages.map((m) => mapMessageToMail(m, accountId))
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/")
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder("utf-8").decode(bytes)
}

function stripHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// 이메일 HTML은 sandboxed iframe(스크립트 실행 자체가 차단됨) 안에서만 렌더링하지만,
// 방어 심층화 차원에서 스크립트/이벤트 핸들러/javascript: URL/자동 리다이렉트는 미리 제거한다.
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<base\b[^>]*>/gi, "")
    .replace(/<meta\s+[^>]*http-equiv=["']?refresh["']?[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, `$1=$2#$2`)
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
