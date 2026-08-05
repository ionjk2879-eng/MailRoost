import { Hono } from "hono"
import { getCookie } from "hono/cookie"
import type { Account, Env, Mail } from "../types"
import { ensureFreshToken, getMailDetail, listInboxMails } from "../lib/gmail"
import { readSession, SESSION_COOKIE, writeSession } from "../lib/session"

const api = new Hono<{ Bindings: Env }>()

api.get("/accounts", async (c) => {
  const sessionId = getCookie(c, SESSION_COOKIE)
  if (!sessionId) return c.json<Account[]>([])

  const session = await readSession(c.env, sessionId)
  const accounts: Account[] = Object.entries(session.accounts).map(([id, record]) => ({
    id,
    email: record.email,
    provider: "gmail",
    label: "Gmail",
    color: "bg-red-500",
  }))
  return c.json(accounts)
})

api.get("/mail", async (c) => {
  const sessionId = getCookie(c, SESSION_COOKIE)
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
  const sessionId = getCookie(c, SESSION_COOKIE)
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
