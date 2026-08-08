import type { Draft, Env } from "../types"

export async function getUserDrafts(env: Env, userId: string): Promise<Draft[]> {
  const raw = await env.TOKENS.get(`user:draft:${userId}`)
  if (!raw) return []
  return (JSON.parse(raw) as { drafts: Draft[] }).drafts
}

export async function saveUserDrafts(env: Env, userId: string, drafts: Draft[]): Promise<void> {
  await env.TOKENS.put(`user:draft:${userId}`, JSON.stringify({ drafts }))
}
