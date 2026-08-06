import { Hono } from "hono"
import { setCookie } from "hono/cookie"
import type { Env } from "../types"
import { getUserAccounts, saveUserAccounts } from "../lib/auth"
import { isHttps, readRawCookie } from "../lib/cookies"
import { imapVerify } from "../lib/imap"
import { createSessionId, readSession, SESSION_COOKIE, writeSession } from "../lib/session"

const imapGeneric = new Hono<{ Bindings: Env }>()

imapGeneric.post("/connect", async (c) => {
  const body = await c
    .req.json<{ host?: string; port?: number; email?: string; password?: string; label?: string }>()
    .catch(() => null)
  const host = body?.host?.trim()
  const port = body?.port ?? 993
  const email = body?.email?.trim()
  const password = body?.password?.trim()
  const label = body?.label?.trim() || host || "IMAP"

  if (!host || !email || !password) {
    return c.json({ error: "서버 주소, 이메일, 비밀번호를 모두 입력해주세요." }, 400)
  }

  try {
    await imapVerify({ host, port, email, password })
  } catch (err) {
    const message = err instanceof Error ? err.message : "IMAP 계정 연결에 실패했습니다."
    return c.json({ error: message }, 400)
  }

  let sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) sessionId = createSessionId()

  const session = await readSession(c.env, sessionId)
  const accountId = `imap:${host}:${email}`
  const imapRecord = { provider: "imap" as const, host, port, email, password, label }

  if (session.userId) {
    const accounts = await getUserAccounts(c.env, session.userId)
    accounts[accountId] = imapRecord
    await saveUserAccounts(c.env, session.userId, accounts)
  } else {
    session.accounts[accountId] = imapRecord
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

export default imapGeneric
