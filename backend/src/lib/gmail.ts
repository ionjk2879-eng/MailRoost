import type { Env, GmailTokenRecord, Mail } from "../types"

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"

export function buildAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  url.searchParams.set("client_id", clientId)
  url.searchParams.set("redirect_uri", redirectUri)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", GMAIL_SCOPE)
  url.searchParams.set("access_type", "offline")
  url.searchParams.set("prompt", "consent")
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
  if (!res.ok) throw new Error(`Gmail profile fetch failed: ${res.status}`)
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
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
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

function extractBody(payload: GmailMessagePart | undefined): string {
  if (!payload) return ""
  const plain = findPart(payload, "text/plain")
  if (plain?.body?.data) return decodeBase64Url(plain.body.data)
  const html = findPart(payload, "text/html")
  if (html?.body?.data) return stripHtml(decodeBase64Url(html.body.data))
  if (payload.body?.data) return decodeBase64Url(payload.body.data)
  return ""
}

export async function getMailDetail(accessToken: string, accountId: string, messageId: string): Promise<Mail> {
  const res = await fetch(`${GMAIL_API_BASE}/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Gmail message fetch failed: ${res.status}`)
  const msg = (await res.json()) as GmailMessage
  const mail = mapMessageToMail(msg, accountId)
  const body = extractBody(msg.payload)
  mail.body = body || mail.snippet
  return mail
}
