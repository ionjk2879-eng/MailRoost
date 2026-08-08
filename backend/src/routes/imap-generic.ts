import { Hono } from "hono"
import { setCookie } from "hono/cookie"
import type { Env } from "../types"
import { getUserAccounts, saveUserAccounts } from "../lib/auth"
import { isHttps, readRawCookie } from "../lib/cookies"
import { imapVerify } from "../lib/imap"
import { createSessionId, readSession, SESSION_COOKIE, writeSession } from "../lib/session"

const imapGeneric = new Hono<{ Bindings: Env }>()

// IMAP 서버 이름에서 SMTP 서버 이름을 추측한다 (imap.example.com -> smtp.example.com).
// 사용자가 직접 입력하지 않았을 때의 기본값일 뿐이며, 틀리면 나중에 분류 편집처럼 계정을 다시
// 연결해 고칠 수 있다.
function guessSmtpHost(imapHost: string): string {
  return imapHost.startsWith("imap.") ? imapHost.replace(/^imap\./, "smtp.") : `smtp.${imapHost}`
}

imapGeneric.post("/connect", async (c) => {
  const body = await c
    .req.json<{
      host?: string
      port?: number
      email?: string
      password?: string
      label?: string
      smtpHost?: string
      smtpPort?: number
    }>()
    .catch(() => null)
  const host = body?.host?.trim()
  const port = body?.port ?? 993
  const email = body?.email?.trim()
  const password = body?.password?.trim()
  const label = body?.label?.trim() || host || "IMAP"
  const smtpHost = body?.smtpHost?.trim() || (host ? guessSmtpHost(host) : "")
  const smtpPort = body?.smtpPort ?? 465

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
  const imapRecord = { provider: "imap" as const, host, port, email, password, label, smtpHost, smtpPort }

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
