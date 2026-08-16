import type { ConnectedAccountRecord, Env, StoredSession, UserRecord } from "../types"
import { decryptAccountsMap, encryptAccountsMap } from "./crypto"
import { writeSession } from "./session"

export async function getUserByEmail(env: Env, email: string): Promise<UserRecord | null> {
  const ref = await env.TOKENS.get(`user:email:${email.trim().toLowerCase()}`)
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
    env.TOKENS.put(`user:email:${user.email.trim().toLowerCase()}`, JSON.stringify({ userId: user.id })),
  ])
}

// OAuth로 소유권을 확인한 연결 Gmail 주소를 같은 MailRoost 사용자에 로그인 별칭으로 묶는다.
export async function linkUserEmail(env: Env, userId: string, email: string): Promise<void> {
  await env.TOKENS.put(`user:email:${email.trim().toLowerCase()}`, JSON.stringify({ userId }))
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

export async function resolveAccounts(
  env: Env,
  session: StoredSession,
): Promise<Record<string, ConnectedAccountRecord>> {
  if (session.userId) return getUserAccounts(env, session.userId)
  return session.accounts
}

export async function persistAccounts(
  env: Env,
  sessionId: string,
  session: StoredSession,
  accounts: Record<string, ConnectedAccountRecord>,
): Promise<void> {
  if (session.userId) {
    await saveUserAccounts(env, session.userId, accounts)
  } else {
    session.accounts = accounts
    await writeSession(env, sessionId, session)
  }
}
