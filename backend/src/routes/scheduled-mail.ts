import { Hono } from "hono"
import type { Env } from "../types"
import { readRawCookie } from "../lib/cookies"
import { readSession, SESSION_COOKIE } from "../lib/session"
import { addScheduledMail, cancelScheduledMail, getScheduledMails, retryScheduledMail } from "../lib/scheduledMail"
import { resolveAccounts } from "../lib/auth"

const router = new Hono<{ Bindings: Env }>()

router.get("/scheduled-mails", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)
  const session = await readSession(c.env, sessionId)
  if (!session.userId) return c.json({ error: "unauthorized" }, 401)
  const mails = await getScheduledMails(c.env, session.userId)
  return c.json({ mails })
})

router.post("/scheduled-mails", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)
  const session = await readSession(c.env, sessionId)
  if (!session.userId) return c.json({ error: "unauthorized" }, 401)

  const body = await c
    .req.json<{
      accountId?: string
      fromName?: string
      to?: string
      cc?: string
      bcc?: string
      subject?: string
      body?: string
      htmlBody?: string
      scheduledAt?: number
    }>()
    .catch(() => null)

  if (!body?.accountId || !body.to || !body.subject || !body.body || !body.scheduledAt) {
    return c.json({ error: "필수 항목이 누락되었습니다." }, 400)
  }
  if (body.scheduledAt <= Date.now()) {
    return c.json({ error: "예약 시간은 현재 시각 이후여야 합니다." }, 400)
  }

  const mail = await addScheduledMail(c.env, session.userId, {
    accountId: body.accountId,
    fromName: body.fromName,
    to: body.to,
    cc: body.cc,
    bcc: body.bcc,
    subject: body.subject,
    body: body.body,
    htmlBody: body.htmlBody,
    scheduledAt: body.scheduledAt,
  })
  return c.json({ mail })
})

router.delete("/scheduled-mails/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)
  const session = await readSession(c.env, sessionId)
  if (!session.userId) return c.json({ error: "unauthorized" }, 401)
  const ok = await cancelScheduledMail(c.env, session.userId, c.req.param("id"))
  if (!ok) return c.json({ error: "찾을 수 없습니다." }, 404)
  return c.json({ ok: true })
})

router.post("/scheduled-mails/:id/retry", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)
  const session = await readSession(c.env, sessionId)
  if (!session.userId) return c.json({ error: "unauthorized" }, 401)
  const accountMap = await resolveAccounts(c.env, session)
  const result = await retryScheduledMail(c.env, session.userId, c.req.param("id"), accountMap)
  if (!result.ok) return c.json({ error: result.error }, result.error === "찾을 수 없습니다." ? 404 : 400)
  return c.json({ ok: true })
})

export default router
