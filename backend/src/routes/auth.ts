import { Hono } from "hono"
import { deleteCookie, setCookie } from "hono/cookie"
import type { Env, UserRecord } from "../types"
import { isHttps, readRawCookie } from "../lib/cookies"
import { getUserAccounts, getUserByEmail, hashPassword, saveUser, saveUserAccounts, verifyPassword } from "../lib/auth"
import { buildAuthUrl, exchangeCodeForTokens, fetchProfile } from "../lib/gmail"
import { createSessionId, readSession, SESSION_COOKIE, writeSession } from "../lib/session"

const STATE_COOKIE = "roost_oauth_state"

const auth = new Hono<{ Bindings: Env }>()

function sessionCookieOptions(url: string) {
  return {
    httpOnly: true,
    secure: isHttps(url),
    sameSite: "Lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  }
}

auth.post("/signup", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>().catch(() => null)
  const email = body?.email?.trim().toLowerCase()
  const password = body?.password

  if (!email || !password) return c.json({ error: "이메일과 비밀번호를 입력해주세요." }, 400)
  if (!email.includes("@")) return c.json({ error: "올바른 이메일 주소를 입력해주세요." }, 400)
  if (password.length < 8) return c.json({ error: "비밀번호는 8자 이상이어야 합니다." }, 400)

  const existing = await getUserByEmail(c.env, email)
  if (existing) return c.json({ error: "이미 사용 중인 이메일입니다." }, 409)

  const { hash, salt } = await hashPassword(password)
  const userId = crypto.randomUUID()
  const user: UserRecord = { id: userId, email, passwordHash: hash, salt }
  await saveUser(c.env, user)

  // 기존 게스트 세션의 연동 계정이 있으면 유저 계정으로 이전
  let sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (sessionId) {
    const session = await readSession(c.env, sessionId)
    if (Object.keys(session.accounts).length > 0 && !session.userId) {
      await saveUserAccounts(c.env, userId, session.accounts)
    }
  } else {
    sessionId = createSessionId()
  }
  await writeSession(c.env, sessionId, { userId, accounts: {} })
  setCookie(c, SESSION_COOKIE, sessionId, sessionCookieOptions(c.req.url))

  return c.json({ ok: true, user: { id: userId, email } })
})

auth.post("/login", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>().catch(() => null)
  const email = body?.email?.trim().toLowerCase()
  const password = body?.password

  if (!email || !password) return c.json({ error: "이메일과 비밀번호를 입력해주세요." }, 400)

  const user = await getUserByEmail(c.env, email)
  if (!user) return c.json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." }, 401)

  const valid = await verifyPassword(password, user.passwordHash, user.salt)
  if (!valid) return c.json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." }, 401)

  // 기존 게스트 세션 계정이 있으면 유저 계정에 병합
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (sessionId) {
    const session = await readSession(c.env, sessionId)
    if (Object.keys(session.accounts).length > 0 && !session.userId) {
      const existing = await getUserAccounts(c.env, user.id)
      await saveUserAccounts(c.env, user.id, { ...existing, ...session.accounts })
    }
  }

  const newSessionId = createSessionId()
  await writeSession(c.env, newSessionId, { userId: user.id, accounts: {} })
  setCookie(c, SESSION_COOKIE, newSessionId, sessionCookieOptions(c.req.url))

  return c.json({ ok: true, user: { id: user.id, email: user.email } })
})

auth.post("/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" })
  return c.json({ ok: true })
})

auth.get("/gmail/login", (c) => {
  const state = crypto.randomUUID()
  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true,
    secure: isHttps(c.req.url),
    sameSite: "Lax",
    path: "/",
    maxAge: 600,
  })
  const redirectUri = new URL("/auth/gmail/callback", c.req.url).toString()
  const authUrl = buildAuthUrl(c.env.GOOGLE_CLIENT_ID, redirectUri, state)
  return c.redirect(authUrl)
})

auth.get("/gmail/callback", async (c) => {
  const code = c.req.query("code")
  const state = c.req.query("state")
  const expectedState = readRawCookie(c.req.header("Cookie"), STATE_COOKIE)
  deleteCookie(c, STATE_COOKIE, { path: "/" })

  if (!code || !state || !expectedState || state !== expectedState) {
    return c.text("OAuth 상태 검증에 실패했습니다. 다시 시도해주세요.", 400)
  }

  const redirectUri = new URL("/auth/gmail/callback", c.req.url).toString()
  const tokens = await exchangeCodeForTokens(code, c.env.GOOGLE_CLIENT_ID, c.env.GOOGLE_CLIENT_SECRET, redirectUri)

  if (!tokens.refresh_token) {
    return c.text(
      "Google에서 refresh token을 받지 못했습니다. Google 계정 > 보안 > 타사 앱 액세스에서 MailRoost 연결을 해제한 뒤 다시 시도해주세요.",
      400,
    )
  }

  const profile = await fetchProfile(tokens.access_token)
  const accountId = `gmail:${profile.emailAddress}`
  const gmailRecord = {
    provider: "gmail" as const,
    email: profile.emailAddress,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  }

  let sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) sessionId = createSessionId()

  const session = await readSession(c.env, sessionId)
  if (session.userId) {
    const accounts = await getUserAccounts(c.env, session.userId)
    accounts[accountId] = gmailRecord
    await saveUserAccounts(c.env, session.userId, accounts)
  } else {
    session.accounts[accountId] = gmailRecord
    await writeSession(c.env, sessionId, session)
  }

  setCookie(c, SESSION_COOKIE, sessionId, sessionCookieOptions(c.req.url))
  return c.redirect("/")
})

export default auth
