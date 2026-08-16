import { Hono } from "hono"
import type { Env } from "../types"
import { resolveAccounts } from "../lib/auth"
import { readRawCookie } from "../lib/cookies"
import { mutateMailOrg, parseAssignmentKey, resolveMailOrg } from "../lib/mailOrg"
import { readSession, SESSION_COOKIE } from "../lib/session"

const snooze = new Hono<{ Bindings: Env }>()

// ── 스누즈 ───────────────────────────────────────────────────────────────────
// 외부 API 키: "accountId||mailId" (||는 accountId/mailId에 절대 등장하지 않음)
// 내부 KV 키: assignmentKey(accountId, mailId) (구분자 없이 이어붙임 — lib/mailOrg.ts 참고)

function toApiSnoozeKey(accountId: string, mailId: string): string {
  return `${accountId}||${mailId}`
}

snooze.get("/snooze", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ snoozed: {} })
  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)

  // 만료된 항목이 있을 때만 KV에 write한다
  const now = Date.now()
  const org = await resolveMailOrg(c.env, session)
  const snoozed = org.snoozed ?? {}
  const hasExpired = Object.values(snoozed).some((until) => until <= now)

  let active: Record<string, number>
  if (hasExpired) {
    active = await mutateMailOrg<Record<string, number>>(c.env, sessionId, session, { type: "pruneExpiredSnoozes", now })
  } else {
    active = snoozed
  }

  // 내부 키 → API 키 변환
  const result: Record<string, number> = {}
  for (const [k, until] of Object.entries(active)) {
    const parsed = parseAssignmentKey(k, Object.keys(accountMap))
    if (parsed) result[toApiSnoozeKey(parsed.accountId, parsed.mailId)] = until
  }
  return c.json({ snoozed: result })
})

snooze.post("/snooze", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)
  const session = await readSession(c.env, sessionId)
  const body = await c.req.json<{ accountId: string; mailId: string; until: number }>()
  if (!body.accountId || !body.mailId || !body.until) return c.json({ error: "invalid" }, 400)

  await mutateMailOrg(c.env, sessionId, session, { type: "snoozeMail", accountId: body.accountId, mailId: body.mailId, until: body.until })
  return c.json({ ok: true })
})

snooze.delete("/snooze", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)
  const session = await readSession(c.env, sessionId)
  const body = await c.req.json<{ accountId: string; mailId: string }>()
  if (!body.accountId || !body.mailId) return c.json({ error: "invalid" }, 400)

  await mutateMailOrg(c.env, sessionId, session, { type: "unsnooze", accountId: body.accountId, mailId: body.mailId })
  return c.json({ ok: true })
})

// ── Muted senders ────────────────────────────────────────────────────────────

snooze.get("/muted", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ muted: [] })
  const session = await readSession(c.env, sessionId)
  const org = await resolveMailOrg(c.env, session)
  return c.json({ muted: org.muted ?? [] })
})

snooze.post("/muted", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)
  const session = await readSession(c.env, sessionId)
  const body = await c.req.json<{ email: string }>().catch(() => null)
  if (!body?.email) return c.json({ error: "invalid" }, 400)

  await mutateMailOrg(c.env, sessionId, session, { type: "muteSender", email: body.email })
  return c.json({ ok: true })
})

snooze.delete("/muted", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)
  const session = await readSession(c.env, sessionId)
  const body = await c.req.json<{ email: string }>().catch(() => null)
  if (!body?.email) return c.json({ error: "invalid" }, 400)

  await mutateMailOrg(c.env, sessionId, session, { type: "unmuteSender", email: body.email })
  return c.json({ ok: true })
})

export default snooze
