import { Hono } from "hono"
import type { Env, QuickReply, StoredSession } from "../types"
import { readRawCookie } from "../lib/cookies"
import { getUserQuickReplies, saveUserQuickReplies } from "../lib/quickReplies"
import { readSession, SESSION_COOKIE, writeSession } from "../lib/session"

const quickReplies = new Hono<{ Bindings: Env }>()

async function resolveQuickReplies(env: Env, session: StoredSession): Promise<QuickReply[]> {
  if (session.userId) return getUserQuickReplies(env, session.userId)
  return session.quickReplies ?? []
}

async function persistQuickReplies(
  env: Env,
  sessionId: string,
  session: StoredSession,
  items: QuickReply[],
): Promise<void> {
  if (session.userId) {
    await saveUserQuickReplies(env, session.userId, items)
  } else {
    session.quickReplies = items
    await writeSession(env, sessionId, session)
  }
}

// ── 빠른 답장 (자주 쓰는 문구, 앱 내부 전용) ──────────────────────────────────────

quickReplies.get("/quick-replies", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ quickReplies: [] })
  const session = await readSession(c.env, sessionId)
  const items = await resolveQuickReplies(c.env, session)
  return c.json({ quickReplies: items })
})

quickReplies.post("/quick-replies", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const body = await c.req.json<{ title?: string; body?: string }>().catch(() => null)
  const title = body?.title?.trim()
  const replyBody = body?.body ?? ""
  if (!title) return c.json({ error: "제목을 입력해주세요." }, 400)
  if (!replyBody.trim()) return c.json({ error: "내용을 입력해주세요." }, 400)

  const session = await readSession(c.env, sessionId)
  const items = await resolveQuickReplies(c.env, session)

  const quickReply: QuickReply = { id: crypto.randomUUID(), title, body: replyBody, createdAt: Date.now() }
  items.unshift(quickReply)
  await persistQuickReplies(c.env, sessionId, session, items)
  return c.json({ quickReply })
})

quickReplies.patch("/quick-replies/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const id = c.req.param("id")
  const body = await c.req.json<{ title?: string; body?: string }>().catch(() => null)

  const session = await readSession(c.env, sessionId)
  const items = await resolveQuickReplies(c.env, session)
  const quickReply = items.find((q) => q.id === id)
  if (!quickReply) return c.json({ error: "빠른 답장을 찾을 수 없습니다." }, 404)

  if (body?.title !== undefined) {
    const title = body.title.trim()
    if (!title) return c.json({ error: "제목을 입력해주세요." }, 400)
    quickReply.title = title
  }
  if (body?.body !== undefined) {
    if (!body.body.trim()) return c.json({ error: "내용을 입력해주세요." }, 400)
    quickReply.body = body.body
  }
  await persistQuickReplies(c.env, sessionId, session, items)
  return c.json({ quickReply })
})

quickReplies.delete("/quick-replies/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const id = c.req.param("id")
  const session = await readSession(c.env, sessionId)
  const items = await resolveQuickReplies(c.env, session)
  const next = items.filter((q) => q.id !== id)
  await persistQuickReplies(c.env, sessionId, session, next)
  return c.json({ ok: true })
})

export default quickReplies
