import { Hono } from "hono"
import type { Account, ConnectedAccountRecord, DaumAccountRecord, Env, ImapAccountRecord, Mail, StoredSession } from "../types"
import { getUserAccounts, getUserById, saveUserAccounts } from "../lib/auth"
import { readRawCookie } from "../lib/cookies"
import {
  ensureFreshToken,
  getMailDetail,
  listInboxMails,
  markAsRead as gmailMarkAsRead,
  toggleStar as gmailToggleStar,
} from "../lib/gmail"
import {
  daumGetMailDetail,
  daumListInbox,
  daumMarkAsRead,
  daumToggleStar,
  imapGetMailDetail,
  imapListInbox,
  imapMarkAsRead,
  imapToggleStar,
  naverGetMailDetail,
  naverListInbox,
  naverMarkAsRead,
  naverToggleStar,
} from "../lib/imap"
import { readSession, SESSION_COOKIE, writeSession } from "../lib/session"

const api = new Hono<{ Bindings: Env }>()

const GMAIL_COLOR_PALETTE = ["bg-red-500", "bg-orange-500", "bg-pink-500", "bg-purple-500", "bg-amber-500", "bg-rose-500"]
const NAVER_COLOR_PALETTE = ["bg-green-500", "bg-emerald-500", "bg-lime-500", "bg-teal-500"]
const DAUM_COLOR_PALETTE = ["bg-blue-500", "bg-sky-500", "bg-cyan-500", "bg-indigo-500"]
const IMAP_COLOR_PALETTE = ["bg-slate-500", "bg-zinc-500", "bg-stone-500", "bg-neutral-500"]

// ── Cursor-based pagination helpers ──────────────────────────────────────────

type CursorState = { pageToken?: string; offset?: number }
type CursorMap = Record<string, CursorState>

function encodeCursor(map: CursorMap): string {
  return btoa(JSON.stringify(map))
}

function decodeCursor(cursor: string): CursorMap {
  try { return JSON.parse(atob(cursor)) as CursorMap } catch { return {} }
}

// ── Session helpers ───────────────────────────────────────────────────────────

async function resolveAccounts(
  env: Env,
  session: StoredSession,
): Promise<Record<string, ConnectedAccountRecord>> {
  if (session.userId) return getUserAccounts(env, session.userId)
  return session.accounts
}

async function persistAccounts(
  env: Env,
  sessionId: string,
  session: StoredSession,
  accounts: Record<string, ConnectedAccountRecord>,
): Promise<void> {
  if (session.userId) {
    await saveUserAccounts(env, session.userId, accounts)
  } else {
    session.accounts = accounts
    await writeSession(env, sessionId, session)
  }
}

// ── IMAP helpers ──────────────────────────────────────────────────────────────

function isDaum(r: ConnectedAccountRecord): r is DaumAccountRecord { return r.provider === "daum" }

async function fetchImapMails(
  accountId: string,
  record: DaumAccountRecord | ImapAccountRecord,
  maxResults: number,
  offset: number,
): Promise<{ mails: Mail[]; hasMore: boolean }> {
  if (isDaum(record)) return daumListInbox(record.email, record.password, accountId, maxResults, offset)
  return imapListInbox({ host: record.host, port: record.port, email: record.email, password: record.password }, accountId, maxResults, offset)
}

// ── Routes ────────────────────────────────────────────────────────────────────

api.get("/me", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json(null)
  const session = await readSession(c.env, sessionId)
  if (!session.userId) return c.json(null)
  const user = await getUserById(c.env, session.userId)
  if (!user) return c.json(null)
  return c.json({ id: user.id, email: user.email })
})

api.get("/accounts", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json<Account[]>([])

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)

  let gmailIdx = 0, naverIdx = 0, daumIdx = 0, imapIdx = 0
  const accounts: Account[] = Object.entries(accountMap).map(([id, record]) => {
    if (record.provider === "naver") {
      return { id, email: record.email, provider: "naver" as const, label: "네이버", color: NAVER_COLOR_PALETTE[naverIdx++ % NAVER_COLOR_PALETTE.length] }
    }
    if (record.provider === "daum") {
      return { id, email: record.email, provider: "daum" as const, label: "다음", color: DAUM_COLOR_PALETTE[daumIdx++ % DAUM_COLOR_PALETTE.length] }
    }
    if (record.provider === "imap") {
      return { id, email: record.email, provider: "imap" as const, label: record.label, color: IMAP_COLOR_PALETTE[imapIdx++ % IMAP_COLOR_PALETTE.length] }
    }
    return { id, email: record.email, provider: "gmail" as const, label: "Gmail", color: GMAIL_COLOR_PALETTE[gmailIdx++ % GMAIL_COLOR_PALETTE.length] }
  })
  return c.json(accounts)
})

api.delete("/accounts/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const accountId = c.req.param("id")
  const session = await readSession(c.env, sessionId)
  const accounts = await resolveAccounts(c.env, session)

  if (!accounts[accountId]) return c.json({ error: "not found" }, 404)
  delete accounts[accountId]
  await persistAccounts(c.env, sessionId, session, accounts)
  return c.json({ ok: true })
})

api.get("/mail", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ mails: [], nextCursor: null })

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  const accountIdParam = c.req.query("accountId")
  const cursorParam = c.req.query("cursor")

  const cursorMap: CursorMap = cursorParam ? decodeCursor(cursorParam) : {}
  const nextCursorMap: CursorMap = {}
  const accountIds = accountIdParam ? [accountIdParam] : Object.keys(accountMap)

  const results: Mail[] = []
  let accountsChanged = false

  for (const accountId of accountIds) {
    const record = accountMap[accountId]
    if (!record) continue

    const cursorState = cursorMap[accountId] ?? {}

    if (record.provider === "naver") {
      const offset = cursorState.offset ?? 0
      const { mails, hasMore } = await naverListInbox(record.email, record.appPassword, accountId, 20, offset)
      results.push(...mails)
      if (hasMore) nextCursorMap[accountId] = { offset: offset + 20 }
      continue
    }

    if (record.provider === "daum" || record.provider === "imap") {
      const offset = cursorState.offset ?? 0
      const { mails, hasMore } = await fetchImapMails(accountId, record, 20, offset)
      results.push(...mails)
      if (hasMore) nextCursorMap[accountId] = { offset: offset + 20 }
      continue
    }

    const fresh = await ensureFreshToken(c.env, record)
    if (fresh.accessToken !== record.accessToken) {
      accountMap[accountId] = fresh
      accountsChanged = true
    }
    const pageToken = cursorState.pageToken
    const { mails, nextPageToken } = await listInboxMails(fresh.accessToken, accountId, 20, pageToken)
    results.push(...mails)
    if (nextPageToken) nextCursorMap[accountId] = { pageToken: nextPageToken }
  }

  if (accountsChanged) await persistAccounts(c.env, sessionId, session, accountMap)

  results.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
  const nextCursor = Object.keys(nextCursorMap).length > 0 ? encodeCursor(nextCursorMap) : null
  return c.json({ mails: results, nextCursor })
})

api.patch("/mail/:id/read", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  const accountId = c.req.query("accountId")
  const mailId = c.req.param("id")
  if (!sessionId || !accountId) return c.json({ error: "bad request" }, 400)

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  const record = accountMap[accountId]
  if (!record) return c.json({ error: "not found" }, 404)

  if (record.provider === "naver") {
    await naverMarkAsRead(record.email, record.appPassword, mailId)
    return c.json({ ok: true })
  }
  if (record.provider === "daum") {
    await daumMarkAsRead(record.email, record.password, mailId)
    return c.json({ ok: true })
  }
  if (record.provider === "imap") {
    await imapMarkAsRead({ host: record.host, port: record.port, email: record.email, password: record.password }, mailId)
    return c.json({ ok: true })
  }

  const fresh = await ensureFreshToken(c.env, record)
  if (fresh.accessToken !== record.accessToken) {
    accountMap[accountId] = fresh
    await persistAccounts(c.env, sessionId, session, accountMap)
  }
  await gmailMarkAsRead(fresh.accessToken, mailId)
  return c.json({ ok: true })
})

api.patch("/mail/:id/star", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  const accountId = c.req.query("accountId")
  const mailId = c.req.param("id")
  if (!sessionId || !accountId) return c.json({ error: "bad request" }, 400)

  const body = await c.req.json<{ starred?: boolean }>().catch(() => null)
  const starred = body?.starred ?? true

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  const record = accountMap[accountId]
  if (!record) return c.json({ error: "not found" }, 404)

  if (record.provider === "naver") {
    await naverToggleStar(record.email, record.appPassword, mailId, starred)
    return c.json({ ok: true })
  }
  if (record.provider === "daum") {
    await daumToggleStar(record.email, record.password, mailId, starred)
    return c.json({ ok: true })
  }
  if (record.provider === "imap") {
    await imapToggleStar({ host: record.host, port: record.port, email: record.email, password: record.password }, mailId, starred)
    return c.json({ ok: true })
  }

  const fresh = await ensureFreshToken(c.env, record)
  if (fresh.accessToken !== record.accessToken) {
    accountMap[accountId] = fresh
    await persistAccounts(c.env, sessionId, session, accountMap)
  }
  await gmailToggleStar(fresh.accessToken, mailId, starred)
  return c.json({ ok: true })
})

api.get("/mail/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  const accountId = c.req.query("accountId")
  const mailId = c.req.param("id")
  if (!sessionId || !accountId) return c.json({ error: "not found" }, 404)

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  const record = accountMap[accountId]
  if (!record) return c.json({ error: "not found" }, 404)

  if (record.provider === "naver") {
    return c.json(await naverGetMailDetail(record.email, record.appPassword, accountId, mailId))
  }
  if (record.provider === "daum") {
    return c.json(await daumGetMailDetail(record.email, record.password, accountId, mailId))
  }
  if (record.provider === "imap") {
    return c.json(await imapGetMailDetail(
      { host: record.host, port: record.port, email: record.email, password: record.password },
      accountId,
      mailId,
    ))
  }

  const fresh = await ensureFreshToken(c.env, record)
  if (fresh.accessToken !== record.accessToken) {
    accountMap[accountId] = fresh
    await persistAccounts(c.env, sessionId, session, accountMap)
  }
  return c.json(await getMailDetail(fresh.accessToken, accountId, mailId))
})

export default api
