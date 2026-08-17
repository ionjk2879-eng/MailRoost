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

// 쓰기 직전에 다시 읽은 최신 목록 위에 이 요청의 변경만 적용한다 — mailOrg에 썼던 것과 같은
// 레이스 회피 패턴(backend/CLAUDE.md 참고). 두 탭이 동시에 서로 다른 메모를 수정하면, 시작 시점
// 스냅샷을 통째로 다시 쓰는 방식은 나중에 끝난 쪽이 먼저 쓴 쪽의 변경을 조용히 덮어쓸 수 있다.
async function mutateMemos(
  env: Env,
  sessionId: string,
  session: StoredSession,
  mutate: (items: MemoItem[]) => MemoItem[],
): Promise<MemoItem[]> {
  const fresh = await resolveMemos(env, session)
  const next = mutate(fresh)
  // items를 in-place로 고치고 그대로 반환하는 mutate(PATCH)도 있어서, 배열 참조가 같은지로
  // "바뀌었는지"를 판단할 수 없다 — 항상 저장한다.
  await persistMemos(env, sessionId, session, next)
  return next
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

  const now = Date.now()
  const memo: MemoItem = { id: crypto.randomUUID(), content, createdAt: now, updatedAt: now }
  await mutateMemos(c.env, sessionId, session, (items) => [memo, ...items])
  return c.json({ memo })
})

memos.patch("/memos/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const memoId = c.req.param("id")
  const body = await c.req.json<{ content?: string }>().catch(() => null)
  if (body?.content === undefined) return c.json({ error: "bad request" }, 400)
  const session = await readSession(c.env, sessionId)

  let updated: MemoItem | null = null
  await mutateMemos(c.env, sessionId, session, (items) => {
    const memo = items.find((m) => m.id === memoId)
    if (!memo) return items
    memo.content = body.content!
    memo.updatedAt = Date.now()
    updated = memo
    return items
  })
  if (!updated) return c.json({ error: "메모를 찾을 수 없습니다." }, 404)
  return c.json({ memo: updated })
})

memos.delete("/memos/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const memoId = c.req.param("id")
  const session = await readSession(c.env, sessionId)
  await mutateMemos(c.env, sessionId, session, (items) => items.filter((m) => m.id !== memoId))
  return c.json({ ok: true })
})

export default memos
