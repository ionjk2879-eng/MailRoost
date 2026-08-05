import { Hono } from "hono"
import type { Account, Env, Mail } from "../types"
import { readRawCookie } from "../lib/cookies"
import { ensureFreshToken, getMailDetail, listInboxMails } from "../lib/gmail"
import { readSession, SESSION_COOKIE, writeSession } from "../lib/session"

const api = new Hono<{ Bindings: Env }>()

// 계정마다 다른 색으로 구분되도록 하는 팔레트. 네이버(초록)/회사메일(파랑) mock 계정과 겹치지 않는 색 위주로 구성.
const GMAIL_COLOR_PALETTE = [
  "bg-red-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-purple-500",
  "bg-amber-500",
  "bg-rose-500",
]

api.get("/accounts", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json<Account[]>([])

  const session = await readSession(c.env, sessionId)
  const accounts: Account[] = Object.entries(session.accounts).map(([id, record], index) => ({
    id,
    email: record.email,
    provider: "gmail",
    label: "Gmail",
    color: GMAIL_COLOR_PALETTE[index % GMAIL_COLOR_PALETTE.length],
  }))
  return c.json(accounts)
})

api.get("/mail", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json<Mail[]>([])

  const session = await readSession(c.env, sessionId)
  const accountIdParam = c.req.query("accountId")
  const accountIds = accountIdParam ? [accountIdParam] : Object.keys(session.accounts)

  const results: Mail[] = []
  let sessionChanged = false

  for (const accountId of accountIds) {
    const record = session.accounts[accountId]
    if (!record) continue

    const fresh = await ensureFreshToken(c.env, record)
    if (fresh.accessToken !== record.accessToken) {
      session.accounts[accountId] = fresh
      sessionChanged = true
    }

    const mails = await listInboxMails(fresh.accessToken, accountId)
    results.push(...mails)
  }

  if (sessionChanged) await writeSession(c.env, sessionId, session)

  results.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
  return c.json(results)
})

api.get("/mail/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  const accountId = c.req.query("accountId")
  const mailId = c.req.param("id")
  if (!sessionId || !accountId) return c.json({ error: "not found" }, 404)

  const session = await readSession(c.env, sessionId)
  const record = session.accounts[accountId]
  if (!record) return c.json({ error: "not found" }, 404)

  const fresh = await ensureFreshToken(c.env, record)
  if (fresh.accessToken !== record.accessToken) {
    session.accounts[accountId] = fresh
    await writeSession(c.env, sessionId, session)
  }

  const mail = await getMailDetail(fresh.accessToken, accountId, mailId)
  return c.json(mail)
})

export default api
