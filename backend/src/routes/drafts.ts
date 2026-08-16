import { Hono } from "hono"
import type { Draft, Env, ForwardedAttachmentRef, StoredSession } from "../types"
import { readRawCookie } from "../lib/cookies"
import { getUserDrafts, saveUserDrafts } from "../lib/drafts"
import { readSession, SESSION_COOKIE, writeSession } from "../lib/session"

const drafts = new Hono<{ Bindings: Env }>()

async function resolveDrafts(env: Env, session: StoredSession): Promise<Draft[]> {
  if (session.userId) return getUserDrafts(env, session.userId)
  return session.drafts ?? []
}

async function persistDrafts(
  env: Env,
  sessionId: string,
  session: StoredSession,
  items: Draft[],
): Promise<void> {
  if (session.userId) {
    await saveUserDrafts(env, session.userId, items)
  } else {
    session.drafts = items
    await writeSession(env, sessionId, session)
  }
}

// ── 임시보관함 ──────────────────────────────────────────────────────────────────

drafts.get("/drafts", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ drafts: [] })
  const session = await readSession(c.env, sessionId)
  const items = await resolveDrafts(c.env, session)
  return c.json({ drafts: [...items].sort((a, b) => b.updatedAt - a.updatedAt) })
})

interface DraftFields {
  accountId?: string
  to?: string
  cc?: string
  bcc?: string
  subject?: string
  body?: string
  forwardedAttachments?: ForwardedAttachmentRef[]
}

drafts.post("/drafts", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const fields = (await c.req.json<DraftFields>().catch(() => ({}))) ?? {}
  const session = await readSession(c.env, sessionId)
  const items = await resolveDrafts(c.env, session)

  const now = Date.now()
  const draft: Draft = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, ...fields }
  items.unshift(draft)
  await persistDrafts(c.env, sessionId, session, items)
  return c.json({ draft })
})

drafts.patch("/drafts/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const id = c.req.param("id")
  const fields = (await c.req.json<DraftFields>().catch(() => ({}))) ?? {}

  const session = await readSession(c.env, sessionId)
  const items = await resolveDrafts(c.env, session)
  const draft = items.find((d) => d.id === id)
  if (!draft) return c.json({ error: "임시보관 메일을 찾을 수 없습니다." }, 404)

  Object.assign(draft, fields, { updatedAt: Date.now() })
  await persistDrafts(c.env, sessionId, session, items)
  return c.json({ draft })
})

drafts.delete("/drafts/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const id = c.req.param("id")
  const session = await readSession(c.env, sessionId)
  const items = await resolveDrafts(c.env, session)
  const next = items.filter((d) => d.id !== id)
  await persistDrafts(c.env, sessionId, session, next)
  return c.json({ ok: true })
})

export default drafts
