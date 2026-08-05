import type { Env, StoredSession } from "../types"

export const SESSION_COOKIE = "roost_session"

export function createSessionId(): string {
  return crypto.randomUUID()
}

export async function readSession(env: Env, sessionId: string): Promise<StoredSession> {
  const raw = await env.TOKENS.get(`session:${sessionId}`)
  if (!raw) return { accounts: {} }
  return JSON.parse(raw) as StoredSession
}

export async function writeSession(env: Env, sessionId: string, session: StoredSession): Promise<void> {
  await env.TOKENS.put(`session:${sessionId}`, JSON.stringify(session))
}
