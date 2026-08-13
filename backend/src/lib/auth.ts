import type { ConnectedAccountRecord, Env, UserRecord } from "../types"
import { decryptAccountsMap, encryptAccountsMap } from "./crypto"

export async function getUserByEmail(env: Env, email: string): Promise<UserRecord | null> {
  const ref = await env.TOKENS.get(`user:email:${email}`)
  if (!ref) return null
  const { userId } = JSON.parse(ref) as { userId: string }
  return getUserById(env, userId)
}

export async function getUserById(env: Env, userId: string): Promise<UserRecord | null> {
  const raw = await env.TOKENS.get(`user:id:${userId}`)
  if (!raw) return null
  return JSON.parse(raw) as UserRecord
}

export async function saveUser(env: Env, user: UserRecord): Promise<void> {
  await Promise.all([
    env.TOKENS.put(`user:id:${user.id}`, JSON.stringify(user)),
    env.TOKENS.put(`user:email:${user.email}`, JSON.stringify({ userId: user.id })),
  ])
}

export async function getUserAccounts(env: Env, userId: string): Promise<Record<string, ConnectedAccountRecord>> {
  const raw = await env.TOKENS.get(`user:accounts:${userId}`)
  if (!raw) return {}
  const { accounts } = JSON.parse(raw) as { accounts: Record<string, ConnectedAccountRecord> }
  return decryptAccountsMap(env, accounts)
}

export async function saveUserAccounts(
  env: Env,
  userId: string,
  accounts: Record<string, ConnectedAccountRecord>,
): Promise<void> {
  const encrypted = await encryptAccountsMap(env, accounts)
  await env.TOKENS.put(`user:accounts:${userId}`, JSON.stringify({ accounts: encrypted }))
}
