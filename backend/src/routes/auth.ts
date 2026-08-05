import { Hono } from "hono"
import { deleteCookie, setCookie } from "hono/cookie"
import type { Env } from "../types"
import { readRawCookie } from "../lib/cookies"
import { buildAuthUrl, exchangeCodeForTokens, fetchProfile } from "../lib/gmail"
import { createSessionId, readSession, SESSION_COOKIE, writeSession } from "../lib/session"

const STATE_COOKIE = "roost_oauth_state"

const auth = new Hono<{ Bindings: Env }>()

function isHttps(url: string): boolean {
  return new URL(url).protocol === "https:"
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

  let sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) sessionId = createSessionId()

  const session = await readSession(c.env, sessionId)
  const accountId = `gmail:${profile.emailAddress}`
  session.accounts[accountId] = {
    email: profile.emailAddress,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  }
  await writeSession(c.env, sessionId, session)

  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: isHttps(c.req.url),
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })

  return c.redirect("/")
})

auth.post("/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" })
  return c.json({ ok: true })
})

export default auth
