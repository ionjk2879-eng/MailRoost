import { Hono } from "hono"
import type { Env, StoredPushSubscription } from "../types"
import { getWatchIndex } from "../lib/gmailWatch"
import { ensureFreshToken, fetchMailsByIds, listHistory } from "../lib/gmail"
import { getUserAccounts, saveUserAccounts } from "../lib/auth"
import { mutateMailOrg } from "../lib/mailOrg"
import type { ClassifyMailsResult } from "../lib/mailOrgOps"
import { sendEmptyPush } from "../lib/webpush"

const webhooks = new Hono<{ Bindings: Env }>()

interface PubSubPushBody {
  message?: { data?: string; messageId?: string; publishTime?: string }
  subscription?: string
}

// Gmail이 새 메일 도착 시 Google Cloud Pub/Sub을 통해 이 endpoint로 push한다
// (?token=GMAIL_PUBSUB_TOKEN 쿼리로 인증 — Pub/Sub push 구독 설정 시 endpoint URL에 붙여둔다).
webhooks.post("/gmail", async (c) => {
  if (!c.env.GMAIL_PUBSUB_TOKEN || c.req.query("token") !== c.env.GMAIL_PUBSUB_TOKEN) {
    return c.text("unauthorized", 401)
  }

  const body = await c.req.json<PubSubPushBody>().catch(() => null)
  const dataB64 = body?.message?.data
  if (!dataB64) return c.json({ ok: true }) // 형식이 이상해도 Pub/Sub 재시도만 유발하니 200으로 흡수

  let parsed: { emailAddress?: string; historyId?: string | number } | null = null
  try {
    parsed = JSON.parse(atob(dataB64)) as { emailAddress?: string; historyId?: string | number }
  } catch {
    // 잘못된 payload는 무시 (Pub/Sub 재시도 유발 방지를 위해 200으로 흡수)
  }

  if (parsed?.emailAddress && parsed.historyId !== undefined) {
    const email = parsed.emailAddress
    const historyId = String(parsed.historyId)
    c.executionCtx.waitUntil(
      processGmailPush(c.env, email, historyId).catch((err) => {
        console.error("[webhooks/gmail] processing failed:", err)
      }),
    )
  }

  return c.json({ ok: true })
})

async function processGmailPush(env: Env, email: string, pushedHistoryId: string): Promise<void> {
  const index = await getWatchIndex(env, email)
  if (!index) return
  const { userId, accountId } = index

  const accounts = await getUserAccounts(env, userId)
  const record = accounts[accountId]
  if (!record || record.provider !== "gmail") return

  const fresh = await ensureFreshToken(env, record)
  if (fresh.accessToken !== record.accessToken) {
    accounts[accountId] = fresh
    await saveUserAccounts(env, userId, accounts)
  }

  const startHistoryId = fresh.historyId ?? pushedHistoryId
  const history = await listHistory(fresh.accessToken, startHistoryId)
  if (!history || history.messageIds.length === 0) return

  const mails = await fetchMailsByIds(fresh.accessToken, accountId, history.messageIds)
  if (mails.length > 0) {
    const classifyItems = mails.map((m) => ({
      accountId,
      mailId: m.id,
      fromName: m.fromName,
      fromEmail: m.fromEmail,
      subject: m.subject,
      category: m.category,
    }))
    // 웹훅에는 브라우저 세션이 없다. mutateMailOrg는 session.userId가 있으면 sessionId 인자를
    // 전혀 쓰지 않고 MailOrgStore DO의 applyOp RPC로 곧장 위임한다(durable/MailOrgStore.ts의
    // applyOp(userId, op)도 userId만 쓴다) — 그래서 sessionId에 빈 문자열, session에는
    // { userId, accounts: {} }만 채운 최소 객체를 넘겨도 안전하다.
    await mutateMailOrg<ClassifyMailsResult>(env, "", { userId, accounts: {} }, { type: "classifyMails", items: classifyItems })
  }

  const latestAccounts = await getUserAccounts(env, userId)
  const latestRecord = latestAccounts[accountId]
  if (latestRecord && latestRecord.provider === "gmail") {
    latestAccounts[accountId] = { ...latestRecord, historyId: history.newHistoryId }
    await saveUserAccounts(env, userId, latestAccounts)
  }

  await fanOutPush(env, userId)
}

async function fanOutPush(env: Env, userId: string): Promise<void> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_JWK) return

  const cfg = {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateJwk: env.VAPID_PRIVATE_JWK,
    subject: env.VAPID_SUBJECT || "mailto:noreply@mailroost.app",
  }

  const raw = await env.TOKENS.get(`user:pushsessions:${userId}`)
  const sessionIds: string[] = raw ? (JSON.parse(raw) as string[]) : []

  for (const sessionId of sessionIds) {
    const subsRaw = await env.TOKENS.get(`push_subs:${sessionId}`)
    if (!subsRaw) continue
    let subs: StoredPushSubscription[]
    try {
      subs = JSON.parse(subsRaw) as StoredPushSubscription[]
    } catch {
      continue
    }
    if (subs.length === 0) continue

    const goneDeviceIds: string[] = []
    await Promise.all(
      subs.map(async (sub) => {
        const result = await sendEmptyPush({ endpoint: sub.endpoint, keys: sub.keys }, cfg)
        if (result === "gone") goneDeviceIds.push(sub.deviceId)
      }),
    )

    if (goneDeviceIds.length > 0) {
      const cleaned = subs.filter((s) => !goneDeviceIds.includes(s.deviceId))
      if (cleaned.length > 0) await env.TOKENS.put(`push_subs:${sessionId}`, JSON.stringify(cleaned))
      else await env.TOKENS.delete(`push_subs:${sessionId}`)
    }
  }
}

export default webhooks
