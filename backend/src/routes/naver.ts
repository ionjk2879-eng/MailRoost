import { Hono } from "hono"
import { setCookie } from "hono/cookie"
import type { Env } from "../types"
import { getUserAccounts, saveUserAccounts } from "../lib/auth"
import { isHttps, readRawCookie } from "../lib/cookies"
import { verifyNaverCredentials } from "../lib/imap"
import { createSessionId, readSession, SESSION_COOKIE, writeSession } from "../lib/session"

const naver = new Hono<{ Bindings: Env }>()

naver.post("/connect", async (c) => {
  const body = await c.req.json<{ email?: string; appPassword?: string }>().catch(() => null)
  const email = body?.email?.trim()
  const appPassword = body?.appPassword?.trim()
  if (!email || !appPassword) {
    return c.json({ error: "이메일과 앱 비밀번호를 모두 입력해주세요." }, 400)
  }

  try {
    await verifyNaverCredentials(email, appPassword)
  } catch (err) {
    const message = err instanceof Error ? err.message : "네이버 계정 연결에 실패했습니다."
    return c.json({ error: message }, 400)
  }

  let sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) sessionId = createSessionId()

  const session = await readSession(c.env, sessionId)
  const accountId = `naver:${email}`
  const naverRecord = { provider: "naver" as const, email, appPassword }

  if (session.userId) {
    const accounts = await getUserAccounts(c.env, session.userId)
    accounts[accountId] = naverRecord
    await saveUserAccounts(c.env, session.userId, accounts)
  } else {
    session.accounts[accountId] = naverRecord
    await writeSession(c.env, sessionId, session)
  }

  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: isHttps(c.req.url),
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })

  return c.json({ ok: true, accountId, email })
})

export default naver
