import type { Env, StoredSession } from "../types"

export const SESSION_COOKIE = "roost_session"

// 세션 쿠키(routes/auth.ts 등의 sessionCookieOptions)의 maxAge와 맞춘다 — 쿠키가 브라우저에서
// 없어진 뒤에도 KV에 세션 blob이 무기한 남아있지 않도록.
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30

export function createSessionId(): string {
  return crypto.randomUUID()
}

export async function readSession(env: Env, sessionId: string): Promise<StoredSession> {
  const raw = await env.TOKENS.get(`session:${sessionId}`)
  if (!raw) return { accounts: {} }
  return JSON.parse(raw) as StoredSession
}

export async function writeSession(env: Env, sessionId: string, session: StoredSession): Promise<void> {
  await env.TOKENS.put(`session:${sessionId}`, JSON.stringify(session), { expirationTtl: SESSION_TTL_SECONDS })
}

// 로그아웃 시 쿠키만 지우는 게 아니라 KV의 세션 blob 자체를 지운다 — 안 지우면 그 sessionId 값이
// 어떤 경로로든(예: 유출된 쿠키) 다시 쓰였을 때 "로그아웃 이후에도 여전히 유효한 세션"이 되어버린다.
export async function deleteSession(env: Env, sessionId: string): Promise<void> {
  await env.TOKENS.delete(`session:${sessionId}`)
}
