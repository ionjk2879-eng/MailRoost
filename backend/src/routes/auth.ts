import { Hono } from "hono"
import { deleteCookie, setCookie } from "hono/cookie"
import type { Env } from "../types"
import { isHttps, readRawCookie } from "../lib/cookies"
import { getUserAccounts, getUserByEmail, saveUser, saveUserAccounts } from "../lib/auth"
import { buildAuthUrl, exchangeCodeForTokens, fetchProfile } from "../lib/gmail"
import { registerOrRenewWatch } from "../lib/gmailWatch"
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

  let userId: string
  if (session.userId) {
    // 이미 로그인된 상태 → 기존 유저에 Gmail 계정 추가
    userId = session.userId
  } else {
    // 첫 로그인 → 유저 조회 또는 신규 생성
    let user = await getUserByEmail(c.env, profile.emailAddress)
    if (!user) {
      user = { id: crypto.randomUUID(), email: profile.emailAddress }
      await saveUser(c.env, user)
    }
    userId = user.id

    // 기존 게스트 세션에 연동 계정이 있으면 유저 계정으로 이전
    if (Object.keys(session.accounts).length > 0) {
      const existing = await getUserAccounts(c.env, userId)
      await saveUserAccounts(c.env, userId, { ...existing, ...session.accounts })
    }

    await writeSession(c.env, sessionId, { userId, accounts: {} })
  }

  const accounts = await getUserAccounts(c.env, userId)
  accounts[accountId] = gmailRecord
  await saveUserAccounts(c.env, userId, accounts)

  // Gmail push notification 구독 등록. GMAIL_PUBSUB_TOPIC이 아직 설정 안 됐거나 Google 쪽
  // 설정이 안 끝났으면 내부에서 조용히 로그만 남기고 넘어간다 — 로그인 흐름을 절대 깨지 않는다.
  await registerOrRenewWatch(c.env, userId, accountId, gmailRecord)

  setCookie(c, SESSION_COOKIE, sessionId, sessionCookieOptions(c.req.url))
  return c.redirect("/")
})

auth.post("/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" })
  return c.json({ ok: true })
})

export default auth
