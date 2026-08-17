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

// 요청 시작 시점에 읽어둔 목록이 아니라, 쓰기 직전에 다시 읽은 최신 목록 위에 이 요청의 변경만
// 적용한다. 두 탭이 동시에 서로 다른 임시보관 메일을 수정/자동저장하면, 각자 자기 시작 시점
// 스냅샷을 통째로 다시 쓰는 방식(예전 방식)은 나중에 끝난 쪽이 먼저 쓴 쪽의 변경을 조용히
// 덮어쓸 수 있다 — mailOrg에 썼던 것과 같은 레이스 회피 패턴(backend/CLAUDE.md 참고).
async function mutateDrafts(
  env: Env,
  sessionId: string,
  session: StoredSession,
  mutate: (items: Draft[]) => Draft[],
): Promise<Draft[]> {
  const fresh = await resolveDrafts(env, session)
  const next = mutate(fresh)
  // items를 in-place로 고치고 그대로 반환하는 mutate(PATCH)도 있어서, 배열 참조가 같은지로
  // "바뀌었는지"를 판단할 수 없다 — 항상 저장한다.
  await persistDrafts(env, sessionId, session, next)
  return next
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

  const now = Date.now()
  const draft: Draft = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, ...fields }
  await mutateDrafts(c.env, sessionId, session, (items) => [draft, ...items])
  return c.json({ draft })
})

drafts.patch("/drafts/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const id = c.req.param("id")
  const fields = (await c.req.json<DraftFields>().catch(() => ({}))) ?? {}
  const session = await readSession(c.env, sessionId)

  let updated: Draft | null = null
  await mutateDrafts(c.env, sessionId, session, (items) => {
    const draft = items.find((d) => d.id === id)
    if (!draft) return items
    Object.assign(draft, fields, { updatedAt: Date.now() })
    updated = draft
    return items
  })
  if (!updated) return c.json({ error: "임시보관 메일을 찾을 수 없습니다." }, 404)
  return c.json({ draft: updated })
})

drafts.delete("/drafts/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const id = c.req.param("id")
  const session = await readSession(c.env, sessionId)
  await mutateDrafts(c.env, sessionId, session, (items) => items.filter((d) => d.id !== id))
  return c.json({ ok: true })
})

export default drafts
