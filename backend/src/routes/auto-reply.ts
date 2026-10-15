import { Hono } from "hono"
import type { AutoReplyRule, Env } from "../types"
import { readRawCookie } from "../lib/cookies"
import { resolveMailOrg, mutateMailOrg } from "../lib/mailOrg"
import { readSession, SESSION_COOKIE } from "../lib/session"
import type { CreateAutoReplyRuleResult, UpdateAutoReplyRuleResult } from "../lib/mailOrgOps"

const router = new Hono<{ Bindings: Env }>()

router.get("/auto-reply-rules", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)
  const session = await readSession(c.env, sessionId)
  const org = await resolveMailOrg(c.env, session)
  return c.json({ rules: org.autoReplies ?? [] })
})

router.post("/auto-reply-rules", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)
  const session = await readSession(c.env, sessionId)

  const body = await c
    .req.json<{
      name?: string
      enabled?: boolean
      fromFilter?: string
      rangeType?: string
      startDate?: string
      endDate?: string
      daysOfWeek?: number[]
      startTime?: string
      endTime?: string
      replySubject?: string
      replyBody?: string
    }>()
    .catch(() => null)

  if (!body?.replySubject || !body.replyBody || !body.rangeType) {
    return c.json({ error: "필수 항목이 누락되었습니다." }, 400)
  }
  if (!["date", "recurring", "both"].includes(body.rangeType)) {
    return c.json({ error: "rangeType이 올바르지 않습니다." }, 400)
  }

  const rule: AutoReplyRule = {
    id: crypto.randomUUID(),
    name: body.name?.trim() || "자동 응답",
    enabled: body.enabled !== false,
    fromFilter: body.fromFilter?.trim() ?? "",
    rangeType: body.rangeType as AutoReplyRule["rangeType"],
    startDate: body.startDate,
    endDate: body.endDate,
    daysOfWeek: body.daysOfWeek,
    startTime: body.startTime,
    endTime: body.endTime,
    replySubject: body.replySubject.trim(),
    replyBody: body.replyBody.trim(),
    createdAt: Date.now(),
  }

  const result = await mutateMailOrg<CreateAutoReplyRuleResult>(c.env, sessionId, session, {
    type: "createAutoReplyRule",
    rule,
  })
  if (!result.ok) return c.json({ error: result.error }, 400)
  return c.json({ rule: result.rule })
})

router.patch("/auto-reply-rules/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)
  const session = await readSession(c.env, sessionId)

  const patch = await c
    .req.json<Partial<Omit<AutoReplyRule, "id" | "createdAt">>>()
    .catch(() => null)
  if (!patch) return c.json({ error: "bad request" }, 400)

  const result = await mutateMailOrg<UpdateAutoReplyRuleResult>(c.env, sessionId, session, {
    type: "updateAutoReplyRule",
    ruleId: c.req.param("id"),
    patch,
  })
  if (!result.ok) return c.json({ error: result.error }, result.status ?? 400)
  return c.json({ rule: result.rule })
})

router.delete("/auto-reply-rules/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)
  const session = await readSession(c.env, sessionId)
  await mutateMailOrg(c.env, sessionId, session, { type: "deleteAutoReplyRule", ruleId: c.req.param("id") })
  return c.json({ ok: true })
})

export default router
