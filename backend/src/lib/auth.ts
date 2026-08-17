import type { ConnectedAccountRecord, Env, GmailAccountRecord, StoredSession, UserRecord } from "../types"
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

export interface GmailTokenPatch {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

// ensureFreshToken이 돌려주는 전체 레코드에서 토큰 필드만 뽑아낸다. 호출부마다
// `{ accessToken: fresh.accessToken, refreshToken: fresh.refreshToken, expiresAt: fresh.expiresAt }`를
// 직접 나열하면 GmailTokenPatch에 필드가 추가될 때 어느 한 곳에서 빠뜨리기 쉽다.
export function gmailTokenPatchOf(record: GmailAccountRecord): GmailTokenPatch {
  return { accessToken: record.accessToken, refreshToken: record.refreshToken, expiresAt: record.expiresAt }
}

// user:accounts:<userId> 블롭을 통째로 덮어쓰는 대신, 지금 이 순간의 최신 상태를 다시 읽어와
// 이 호출이 실제로 갱신한 계정들의 토큰 필드(accessToken/refreshToken/expiresAt)만 얹어서 쓴다
// — 계정의 다른 필드(historyId/watchExpiration 등)는 건드리지 않는다. 여러 요청/백그라운드
// 작업(예: gmailWatch.ts의 watch 갱신)이 같은 블롭을 동시에 건드릴 수 있는데, 요청 시작 시점의
// 스냅샷을 통째로 다시 쓰면(예전 persistAccounts 방식) 나중에 끝난 쪽이 먼저 쓴 쪽의 변경을
// 조용히 덮어써버린다 — 필드 단위로만 병합하므로 이 레이스가 생기지 않는다.
export async function patchGmailTokens(
  env: Env,
  userId: string,
  patch: Record<string, GmailTokenPatch>,
): Promise<void> {
  const fresh = await getUserAccounts(env, userId)
  for (const [accountId, tokenPatch] of Object.entries(patch)) {
    const current = fresh[accountId]
    if (current && current.provider === "gmail") fresh[accountId] = { ...current, ...tokenPatch }
  }
  await saveUserAccounts(env, userId, fresh)
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

// Gmail 토큰이 갱신됐을 때 쓰는 공통 저장 경로. 로그인 사용자는 patchGmailTokens로 최신 상태
// 위에 토큰 필드만 얹고(레이스 방지), 게스트는 세션 blob 하나가 유일한 출처라 레이스 대상이
// 아니므로 기존처럼 accountMap 전체를 그대로 쓴다. accountMap은 같은 요청 안에서 계속 쓰일 수
// 있으니 호출부를 위해 patch를 그 자리에서도 반영해준다.
export async function persistAccountTokenRefresh(
  env: Env,
  sessionId: string,
  session: StoredSession,
  accountMap: Record<string, ConnectedAccountRecord>,
  patch: Record<string, GmailTokenPatch>,
): Promise<void> {
  for (const [accountId, tokenPatch] of Object.entries(patch)) {
    const current = accountMap[accountId]
    if (current && current.provider === "gmail") accountMap[accountId] = { ...current, ...tokenPatch }
  }
  if (session.userId) {
    await patchGmailTokens(env, session.userId, patch)
  } else {
    session.accounts = accountMap
    await writeSession(env, sessionId, session)
  }
}
