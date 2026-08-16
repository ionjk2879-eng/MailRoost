import { Hono } from "hono"
import type { Env, StoredPushSubscription } from "../types"
import { readRawCookie } from "../lib/cookies"
import { sendEmptyPush } from "../lib/webpush"
import { readSession, SESSION_COOKIE } from "../lib/session"

const push = new Hono<{ Bindings: Env }>()

// ── Web Push ─────────────────────────────────────────────────────────────────

const PUSH_SUBS_PREFIX = "push_subs:"
const USER_PUSH_SESSIONS_PREFIX = "user:pushsessions:"

function pushSubsKey(sessionId: string): string {
  return `${PUSH_SUBS_PREFIX}${sessionId}`
}

// 로그인 사용자 -> 그 사용자가 구독을 등록해둔 sessionId 목록. Gmail 웹훅(routes/webhooks.ts)이
// 새 메일 도착 시 이 사용자의 모든 세션에 빈 푸시를 보내야 하는데, 웹훅에는 브라우저 쿠키가 없어
// 세션id를 알 방법이 없으므로 userId로 역으로 찾을 수 있는 이 인덱스가 필요하다.
async function addPushSessionIndex(env: Env, userId: string, sessionId: string): Promise<void> {
  const key = `${USER_PUSH_SESSIONS_PREFIX}${userId}`
  const raw = await env.TOKENS.get(key)
  const sessionIds: string[] = raw ? (JSON.parse(raw) as string[]) : []
  if (!sessionIds.includes(sessionId)) {
    sessionIds.push(sessionId)
    await env.TOKENS.put(key, JSON.stringify(sessionIds))
  }
}

async function readPushSubs(env: Env, sessionId: string): Promise<StoredPushSubscription[]> {
  const raw = await env.TOKENS.get(pushSubsKey(sessionId))
  if (!raw) return []
  try { return JSON.parse(raw) as StoredPushSubscription[] } catch { return [] }
}

async function savePushSubs(env: Env, sessionId: string, subs: StoredPushSubscription[]): Promise<void> {
  if (subs.length === 0) {
    await env.TOKENS.delete(pushSubsKey(sessionId))
  } else {
    await env.TOKENS.put(pushSubsKey(sessionId), JSON.stringify(subs))
  }
}

push.get("/push/vapid-public-key", (c) => {
  return c.json({ publicKey: c.env.VAPID_PUBLIC_KEY || "" })
})

push.post("/push/subscribe", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const body = await c.req.json<{ subscription: { endpoint: string; keys: { p256dh: string; auth: string } }; deviceId: string }>()
  if (!body.subscription?.endpoint || !body.deviceId) return c.json({ error: "invalid" }, 400)

  const subs = await readPushSubs(c.env, sessionId)
  // 같은 디바이스 갱신 or 새 구독 추가
  const idx = subs.findIndex((s) => s.deviceId === body.deviceId)
  const entry: StoredPushSubscription = {
    endpoint: body.subscription.endpoint,
    keys: body.subscription.keys,
    deviceId: body.deviceId,
    subscribedAt: Date.now(),
  }
  if (idx >= 0) subs[idx] = entry
  else subs.push(entry)

  await savePushSubs(c.env, sessionId, subs)

  const session = await readSession(c.env, sessionId)
  if (session.userId) await addPushSessionIndex(c.env, session.userId, sessionId)

  return c.json({ ok: true })
})

push.delete("/push/subscribe", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const body = await c.req.json<{ deviceId: string }>()
  if (!body.deviceId) return c.json({ error: "invalid" }, 400)

  const subs = await readPushSubs(c.env, sessionId)
  await savePushSubs(c.env, sessionId, subs.filter((s) => s.deviceId !== body.deviceId))
  return c.json({ ok: true })
})

push.post("/push/notify", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const body = await c.req.json<{ deviceId: string }>()
  const subs = await readPushSubs(c.env, sessionId)
  if (subs.length === 0) return c.json({ ok: true, sent: 0 })

  const cfg = {
    publicKey: c.env.VAPID_PUBLIC_KEY ?? "",
    privateJwk: c.env.VAPID_PRIVATE_JWK ?? "",
    subject: c.env.VAPID_SUBJECT ?? "mailto:noreply@mailroost.app",
  }

  if (!cfg.publicKey || !cfg.privateJwk) return c.json({ ok: true, sent: 0 })

  const targets = subs.filter((s) => s.deviceId !== body.deviceId)
  const goneSubs: string[] = []
  let sent = 0

  await Promise.all(
    targets.map(async (sub) => {
      const result = await sendEmptyPush({ endpoint: sub.endpoint, keys: sub.keys }, cfg)
      if (result === "ok") sent++
      else if (result === "gone") goneSubs.push(sub.deviceId)
    }),
  )

  // 만료된 구독 정리
  if (goneSubs.length > 0) {
    const cleaned = subs.filter((s) => !goneSubs.includes(s.deviceId))
    await savePushSubs(c.env, sessionId, cleaned)
  }

  return c.json({ ok: true, sent })
})

export default push
