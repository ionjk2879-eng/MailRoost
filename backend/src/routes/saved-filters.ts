import { Hono } from "hono"
import type { Env } from "../types"
import { readRawCookie } from "../lib/cookies"
import { mutateMailOrg, resolveMailOrg } from "../lib/mailOrg"
import type { CreateSavedFilterResult } from "../lib/mailOrgOps"
import { readSession, SESSION_COOKIE } from "../lib/session"

const savedFilters = new Hono<{ Bindings: Env }>()

// ── 저장된 검색/스마트 필터 ──────────────────────────────────────────────────

interface SavedFilterInput {
  name?: string
  accountId?: string | null
  from?: string | null
  subject?: string | null
  isUnread?: boolean | null
  isStarred?: boolean | null
  hasAttachment?: boolean | null
  folderId?: string | null
}

savedFilters.get("/saved-filters", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ filters: [] })
  const session = await readSession(c.env, sessionId)
  const org = await resolveMailOrg(c.env, session)
  return c.json({ filters: org.savedFilters })
})

savedFilters.post("/saved-filters", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const body = await c.req.json<SavedFilterInput>().catch(() => null)
  const name = body?.name?.trim()
  if (!name) return c.json({ error: "이름을 입력해주세요." }, 400)

  const session = await readSession(c.env, sessionId)
  const result = await mutateMailOrg<CreateSavedFilterResult>(c.env, sessionId, session, {
    type: "createSavedFilter",
    id: crypto.randomUUID(),
    name,
    accountId: body?.accountId ?? null,
    from: body?.from?.trim() ?? "",
    subject: body?.subject?.trim() ?? "",
    isUnread: body?.isUnread ?? null,
    isStarred: body?.isStarred ?? null,
    hasAttachment: body?.hasAttachment ?? null,
    folderId: body?.folderId ?? null,
    createdAt: Date.now(),
  })
  if (!result.ok) return c.json({ error: result.error }, 404)
  return c.json({ filter: result.filter })
})

savedFilters.delete("/saved-filters/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const filterId = c.req.param("id")
  const session = await readSession(c.env, sessionId)
  await mutateMailOrg(c.env, sessionId, session, { type: "deleteSavedFilter", filterId })
  return c.json({ ok: true })
})

export default savedFilters
