import type { ConnectedAccountRecord, Env, UserRecord } from "../types"

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

function fromHex(hex: string): Uint8Array {
  return new Uint8Array((hex.match(/.{2}/g) ?? []).map((b) => parseInt(b, 16)))
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"])
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    key,
    256,
  )
  return { hash: toHex(new Uint8Array(bits)), salt: toHex(salt) }
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"])
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromHex(salt), iterations: 100_000, hash: "SHA-256" },
    key,
    256,
  )
  return toHex(new Uint8Array(bits)) === hash
}

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
  return (JSON.parse(raw) as { accounts: Record<string, ConnectedAccountRecord> }).accounts
}

export async function saveUserAccounts(
  env: Env,
  userId: string,
  accounts: Record<string, ConnectedAccountRecord>,
): Promise<void> {
  await env.TOKENS.put(`user:accounts:${userId}`, JSON.stringify({ accounts }))
}
