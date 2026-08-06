import { Hono } from "hono"
import type { Account, ConnectedAccountRecord, Env, Mail, StoredSession } from "../types"
import { getUserAccounts, getUserById, saveUserAccounts } from "../lib/auth"
import { readRawCookie } from "../lib/cookies"
import { ensureFreshToken, getMailDetail, listInboxMails } from "../lib/gmail"
import { naverGetMailDetail, naverListInbox } from "../lib/imap"
import { readSession, SESSION_COOKIE, writeSession } from "../lib/session"

const api = new Hono<{ Bindings: Env }>()

const GMAIL_COLOR_PALETTE = [
  "bg-red-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-purple-500",
  "bg-amber-500",
  "bg-rose-500",
]
const NAVER_COLOR_PALETTE = ["bg-green-500", "bg-emerald-500", "bg-lime-500", "bg-teal-500"]

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

  let gmailIndex = 0
  let naverIndex = 0
  const accounts: Account[] = Object.entries(accountMap).map(([id, record]) => {
    if (record.provider === "naver") {
      return {
        id,
        email: record.email,
        provider: "naver" as const,
        label: "네이버",
        color: NAVER_COLOR_PALETTE[naverIndex++ % NAVER_COLOR_PALETTE.length],
      }
    }
    return {
      id,
      email: record.email,
      provider: "gmail" as const,
      label: "Gmail",
      color: GMAIL_COLOR_PALETTE[gmailIndex++ % GMAIL_COLOR_PALETTE.length],
    }
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
  if (!sessionId) return c.json<Mail[]>([])

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  const accountIdParam = c.req.query("accountId")
  const accountIds = accountIdParam ? [accountIdParam] : Object.keys(accountMap)

  const results: Mail[] = []
  let accountsChanged = false

  for (const accountId of accountIds) {
    const record = accountMap[accountId]
    if (!record) continue

    if (record.provider === "naver") {
      const mails = await naverListInbox(record.email, record.appPassword, accountId)
      results.push(...mails)
      continue
    }

    const fresh = await ensureFreshToken(c.env, record)
    if (fresh.accessToken !== record.accessToken) {
      accountMap[accountId] = fresh
      accountsChanged = true
    }
    const mails = await listInboxMails(fresh.accessToken, accountId)
    results.push(...mails)
  }

  if (accountsChanged) await persistAccounts(c.env, sessionId, session, accountMap)

  results.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
  return c.json(results)
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
    const mail = await naverGetMailDetail(record.email, record.appPassword, accountId, mailId)
    return c.json(mail)
  }

  const fresh = await ensureFreshToken(c.env, record)
  if (fresh.accessToken !== record.accessToken) {
    accountMap[accountId] = fresh
    await persistAccounts(c.env, sessionId, session, accountMap)
  }

  const mail = await getMailDetail(fresh.accessToken, accountId, mailId)
  return c.json(mail)
})

export default api
