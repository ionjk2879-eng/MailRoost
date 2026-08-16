import { Hono } from "hono"
import type { Account, Env } from "../types"
import { getUserAccounts, getUserById, linkUserEmail, persistAccounts, resolveAccounts } from "../lib/auth"
import { readRawCookie } from "../lib/cookies"
import { applyOrder, mutateMailOrg, resolveMailOrg } from "../lib/mailOrg"
import { readSession, SESSION_COOKIE } from "../lib/session"

const accounts = new Hono<{ Bindings: Env }>()

const GMAIL_COLOR_PALETTE = ["bg-red-500", "bg-orange-500", "bg-pink-500", "bg-purple-500", "bg-amber-500", "bg-rose-500"]
const NAVER_COLOR_PALETTE = ["bg-green-500", "bg-emerald-500", "bg-lime-500", "bg-teal-500"]
const DAUM_COLOR_PALETTE = ["bg-blue-500", "bg-sky-500", "bg-cyan-500", "bg-indigo-500"]
const IMAP_COLOR_PALETTE = ["bg-slate-500", "bg-zinc-500", "bg-stone-500", "bg-neutral-500"]
// 분류 색상은 hex 값으로 저장해 사용자가 색상 선택기로 자유롭게 바꿀 수 있게 한다
// (Tailwind 클래스명은 빌드 타임에 알려진 값만 써야 해서 임의 색상을 표현할 수 없다).

accounts.get("/me", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json(null)
  const session = await readSession(c.env, sessionId)
  if (!session.userId) return c.json(null)
  const user = await getUserById(c.env, session.userId)
  if (!user) return c.json(null)
  const accountMap = await getUserAccounts(c.env, user.id)
  await Promise.all(
    Object.values(accountMap)
      .filter((account) => account.provider === "gmail")
      .map((account) => linkUserEmail(c.env, user.id, account.email)),
  )
  return c.json({ id: user.id, email: session.loginEmail ?? user.email })
})

accounts.get("/accounts", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json<Account[]>([])

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  const org = await resolveMailOrg(c.env, session)

  let gmailIdx = 0, naverIdx = 0, daumIdx = 0, imapIdx = 0
  let result: Account[] = Object.entries(accountMap).map(([id, record]) => {
    const signature = org.signatures[id] || undefined
    if (record.provider === "naver") {
      return { id, email: record.email, provider: "naver" as const, label: "네이버", color: NAVER_COLOR_PALETTE[naverIdx++ % NAVER_COLOR_PALETTE.length], signature }
    }
    if (record.provider === "daum") {
      return { id, email: record.email, provider: "daum" as const, label: "다음", color: DAUM_COLOR_PALETTE[daumIdx++ % DAUM_COLOR_PALETTE.length], signature }
    }
    if (record.provider === "imap") {
      return { id, email: record.email, provider: "imap" as const, label: record.label, color: IMAP_COLOR_PALETTE[imapIdx++ % IMAP_COLOR_PALETTE.length], signature }
    }
    return { id, email: record.email, provider: "gmail" as const, label: "Gmail", color: GMAIL_COLOR_PALETTE[gmailIdx++ % GMAIL_COLOR_PALETTE.length], signature }
  })
  result = applyOrder(result, org.accountOrder, (a) => a.id)
  return c.json(result)
})

accounts.patch("/accounts/:id/signature", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const accountId = c.req.param("id")
  const body = await c.req.json<{ signature?: string }>().catch(() => null)
  const signature = body?.signature ?? ""

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  if (!accountMap[accountId]) return c.json({ error: "계정을 찾을 수 없습니다." }, 404)

  await mutateMailOrg(c.env, sessionId, session, { type: "updateSignature", accountId, signature })
  return c.json({ ok: true, signature: signature.trim() ? signature : undefined })
})

accounts.post("/accounts/reorder", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const body = await c.req.json<{ order?: string[] }>().catch(() => null)
  const order = body?.order
  if (!Array.isArray(order)) return c.json({ error: "bad request" }, 400)

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  const validOrder = order.filter((id) => id in accountMap)

  await mutateMailOrg(c.env, sessionId, session, { type: "reorderAccounts", order: validOrder })
  return c.json({ ok: true })
})

accounts.delete("/accounts/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const accountId = c.req.param("id")
  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)

  if (!accountMap[accountId]) return c.json({ error: "not found" }, 404)
  delete accountMap[accountId]
  await persistAccounts(c.env, sessionId, session, accountMap)
  return c.json({ ok: true })
})

export default accounts
