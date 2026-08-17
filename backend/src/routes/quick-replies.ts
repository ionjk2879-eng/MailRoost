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

// 쓰기 직전에 다시 읽은 최신 목록 위에 이 요청의 변경만 적용한다 — mailOrg에 썼던 것과 같은
// 레이스 회피 패턴(backend/CLAUDE.md 참고).
async function mutateQuickReplies(
  env: Env,
  sessionId: string,
  session: StoredSession,
  mutate: (items: QuickReply[]) => QuickReply[],
): Promise<QuickReply[]> {
  const fresh = await resolveQuickReplies(env, session)
  const next = mutate(fresh)
  // items를 in-place로 고치고 그대로 반환하는 mutate(PATCH)도 있어서, 배열 참조가 같은지로
  // "바뀌었는지"를 판단할 수 없다 — 항상 저장한다.
  await persistQuickReplies(env, sessionId, session, next)
  return next
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

  const quickReply: QuickReply = { id: crypto.randomUUID(), title, body: replyBody, createdAt: Date.now() }
  await mutateQuickReplies(c.env, sessionId, session, (items) => [quickReply, ...items])
  return c.json({ quickReply })
})

quickReplies.patch("/quick-replies/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const id = c.req.param("id")
  const body = await c.req.json<{ title?: string; body?: string }>().catch(() => null)
  if (body?.title !== undefined && !body.title.trim()) return c.json({ error: "제목을 입력해주세요." }, 400)
  if (body?.body !== undefined && !body.body.trim()) return c.json({ error: "내용을 입력해주세요." }, 400)
  const session = await readSession(c.env, sessionId)

  let updated: QuickReply | null = null
  await mutateQuickReplies(c.env, sessionId, session, (items) => {
    const quickReply = items.find((q) => q.id === id)
    if (!quickReply) return items
    if (body?.title !== undefined) quickReply.title = body.title.trim()
    if (body?.body !== undefined) quickReply.body = body.body
    updated = quickReply
    return items
  })
  if (!updated) return c.json({ error: "빠른 답장을 찾을 수 없습니다." }, 404)
  return c.json({ quickReply: updated })
})

quickReplies.delete("/quick-replies/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const id = c.req.param("id")
  const session = await readSession(c.env, sessionId)
  await mutateQuickReplies(c.env, sessionId, session, (items) => items.filter((q) => q.id !== id))
  return c.json({ ok: true })
})

export default quickReplies
