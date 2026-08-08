import type { Env, QuickReply } from "../types"

export async function getUserQuickReplies(env: Env, userId: string): Promise<QuickReply[]> {
  const raw = await env.TOKENS.get(`user:quickreply:${userId}`)
  if (!raw) return []
  return (JSON.parse(raw) as { quickReplies: QuickReply[] }).quickReplies
}

export async function saveUserQuickReplies(env: Env, userId: string, quickReplies: QuickReply[]): Promise<void> {
  await env.TOKENS.put(`user:quickreply:${userId}`, JSON.stringify({ quickReplies }))
}
