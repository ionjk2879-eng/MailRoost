import { Hono } from "hono"
import { setCookie } from "hono/cookie"
import type { Env } from "../types"
import { getUserAccounts, saveUserAccounts } from "../lib/auth"
import { isHttps, readRawCookie } from "../lib/cookies"
import { verifyDaumCredentials } from "../lib/imap"
import { createSessionId, readSession, SESSION_COOKIE, writeSession } from "../lib/session"

const daum = new Hono<{ Bindings: Env }>()

daum.post("/connect", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>().catch(() => null)
  const email = body?.email?.trim()
  const password = body?.password?.trim()
  if (!email || !password) {
    return c.json({ error: "이메일과 비밀번호를 모두 입력해주세요." }, 400)
  }

  try {
    await verifyDaumCredentials(email, password)
  } catch (err) {
    const message = err instanceof Error ? err.message : "다음 계정 연결에 실패했습니다."
    return c.json({ error: message }, 400)
  }

  let sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) sessionId = createSessionId()

  const session = await readSession(c.env, sessionId)
  const accountId = `daum:${email}`
  const daumRecord = { provider: "daum" as const, email, password }

  if (session.userId) {
    const accounts = await getUserAccounts(c.env, session.userId)
    accounts[accountId] = daumRecord
    await saveUserAccounts(c.env, session.userId, accounts)
  } else {
    session.accounts[accountId] = daumRecord
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

export default daum
