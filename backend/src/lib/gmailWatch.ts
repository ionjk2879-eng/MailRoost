import type { Env, GmailAccountRecord } from "../types"
import { watchMailbox } from "./gmail"
import { getUserAccounts, saveUserAccounts } from "./auth"

const WATCH_INDEX_PREFIX = "gmail:watch:"

// 이메일 주소 -> {userId, accountId} 역인덱스. 웹훅이 Pub/Sub 메시지의 emailAddress만 가지고
// 어느 사용자/계정인지 찾아야 하므로 필요하다.
async function setWatchIndex(env: Env, email: string, userId: string, accountId: string): Promise<void> {
  await env.TOKENS.put(`${WATCH_INDEX_PREFIX}${email}`, JSON.stringify({ userId, accountId }))
}

export async function getWatchIndex(env: Env, email: string): Promise<{ userId: string; accountId: string } | null> {
  const raw = await env.TOKENS.get(`${WATCH_INDEX_PREFIX}${email}`)
  return raw ? (JSON.parse(raw) as { userId: string; accountId: string }) : null
}

// watch를 새로 걸거나(처음 연결) 갱신한다(만료 임박). 절대 throw하지 않는다 — 로그인/크론이 이것
// 때문에 깨지면 안 된다(GMAIL_PUBSUB_TOPIC이 아직 설정 안 됐거나 Google 쪽 설정이 안 끝난 경우가
// 흔히 있을 것이므로, 실패는 콘솔 로그만 남기고 조용히 넘어간다).
export async function registerOrRenewWatch(env: Env, userId: string, accountId: string, record: GmailAccountRecord): Promise<void> {
  if (!env.GMAIL_PUBSUB_TOPIC) return
  try {
    const { historyId, expiration } = await watchMailbox(record.accessToken, env.GMAIL_PUBSUB_TOPIC)
    const accounts = await getUserAccounts(env, userId)
    const current = accounts[accountId]
    if (current && current.provider === "gmail") {
      accounts[accountId] = { ...current, historyId, watchExpiration: expiration }
      await saveUserAccounts(env, userId, accounts)
    }
    await setWatchIndex(env, record.email, userId, accountId)
  } catch (err) {
    console.error(`[gmail-watch] failed to register/renew watch for ${accountId}:`, err)
  }
}

const RENEW_THRESHOLD_MS = 24 * 60 * 60 * 1000 // 만료 24시간 이내면 갱신
const ACCOUNTS_PREFIX = "user:accounts:"

function isExpiringSoon(record: GmailAccountRecord): boolean {
  return (record.watchExpiration ?? 0) - Date.now() < RENEW_THRESHOLD_MS
}

// Cloudflare 무료 플랜은 계정 전체에서 크론 트리거를 5개까지만 허용하는데, 이 계정은 이미 다른
// 프로젝트들의 크론으로 한도가 차 있어 전용 크론을 못 걸었다(2026-08-16 배포 실패 참고). 그래서
// 대신 이미 20초마다 자연스럽게 오는 GET /api/mail 폴링 요청에 편승해서 만료 임박한 계정만
// 갱신한다 — 별도 크론 없이 완전히 무료로 해결된다. 응답을 늦추지 않도록 호출부에서
// executionCtx.waitUntil로 감싸서 fire-and-forget으로 부를 것.
export async function renewIfExpiringSoon(env: Env, userId: string, accountId: string, record: GmailAccountRecord): Promise<void> {
  if (isExpiringSoon(record)) await registerOrRenewWatch(env, userId, accountId, record)
}

// 전체 Gmail 계정을 순회하며 만료 임박한 것만 갱신한다. 크론 트리거 없이도 안전망으로 남겨둔다 —
// 필요해지면(예: 크론 슬롯이 다시 확보되면) 다시 스케줄링해서 쓸 수 있다.
export async function renewExpiringWatches(env: Env): Promise<void> {
  if (!env.GMAIL_PUBSUB_TOPIC) return
  let cursor: string | undefined
  do {
    const page = await env.TOKENS.list({ prefix: ACCOUNTS_PREFIX, cursor })
    for (const key of page.keys) {
      const userId = key.name.slice(ACCOUNTS_PREFIX.length)
      try {
        const accounts = await getUserAccounts(env, userId)
        for (const [accountId, record] of Object.entries(accounts)) {
          if (record.provider !== "gmail") continue
          await renewIfExpiringSoon(env, userId, accountId, record)
        }
      } catch (err) {
        console.error(`[gmail-watch] failed to process accounts for user ${userId}:`, err)
      }
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
}
