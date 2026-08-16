import { Hono } from "hono"
import type { Env, MemoItem, StoredSession } from "../types"
import { readRawCookie } from "../lib/cookies"
import { getUserMemos, saveUserMemos } from "../lib/memo"
import { readSession, SESSION_COOKIE, writeSession } from "../lib/session"

const memos = new Hono<{ Bindings: Env }>()

async function resolveMemos(env: Env, session: StoredSession): Promise<MemoItem[]> {
  if (session.userId) return getUserMemos(env, session.userId)
  return session.memos ?? []
}

async function persistMemos(
  env: Env,
  sessionId: string,
  session: StoredSession,
  items: MemoItem[],
): Promise<void> {
  if (session.userId) {
    await saveUserMemos(env, session.userId, items)
  } else {
    session.memos = items
    await writeSession(env, sessionId, session)
  }
}

// ── 메모 (앱 내부 전용, 메일 서버와 무관) ────────────────────────────────────────

memos.get("/memos", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ memos: [] })
  const session = await readSession(c.env, sessionId)
  const items = await resolveMemos(c.env, session)
  return c.json({ memos: items })
})

memos.post("/memos", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const body = await c.req.json<{ content?: string }>().catch(() => null)
  const content = body?.content ?? ""

  const session = await readSession(c.env, sessionId)
  const items = await resolveMemos(c.env, session)

  const now = Date.now()
  const memo: MemoItem = { id: crypto.randomUUID(), content, createdAt: now, updatedAt: now }
  items.unshift(memo)
  await persistMemos(c.env, sessionId, session, items)
  return c.json({ memo })
})

memos.patch("/memos/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const memoId = c.req.param("id")
  const body = await c.req.json<{ content?: string }>().catch(() => null)
  if (body?.content === undefined) return c.json({ error: "bad request" }, 400)

  const session = await readSession(c.env, sessionId)
  const items = await resolveMemos(c.env, session)
  const memo = items.find((m) => m.id === memoId)
  if (!memo) return c.json({ error: "메모를 찾을 수 없습니다." }, 404)

  memo.content = body.content
  memo.updatedAt = Date.now()
  await persistMemos(c.env, sessionId, session, items)
  return c.json({ memo })
})

memos.delete("/memos/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const memoId = c.req.param("id")
  const session = await readSession(c.env, sessionId)
  const items = await resolveMemos(c.env, session)
  const next = items.filter((m) => m.id !== memoId)
  await persistMemos(c.env, sessionId, session, next)
  return c.json({ ok: true })
})

export default memos
