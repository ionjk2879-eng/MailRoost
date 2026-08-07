import type { Env, MemoItem } from "../types"

export async function getUserMemos(env: Env, userId: string): Promise<MemoItem[]> {
  const raw = await env.TOKENS.get(`user:memo:${userId}`)
  if (!raw) return []
  return (JSON.parse(raw) as { memos: MemoItem[] }).memos
}

export async function saveUserMemos(env: Env, userId: string, memos: MemoItem[]): Promise<void> {
  await env.TOKENS.put(`user:memo:${userId}`, JSON.stringify({ memos }))
}
