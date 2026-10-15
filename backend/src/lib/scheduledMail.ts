import type { ConnectedAccountRecord, Env, ScheduledMail, StoredSession } from "../types"
import { sendViaRecord } from "./mailSend"

const KV_PREFIX = "user:scheduled_mails:"

export async function getScheduledMails(env: Env, userId: string): Promise<ScheduledMail[]> {
  const raw = await env.TOKENS.get(`${KV_PREFIX}${userId}`)
  if (!raw) return []
  try { return JSON.parse(raw) as ScheduledMail[] } catch { return [] }
}

async function putScheduledMails(env: Env, userId: string, mails: ScheduledMail[]): Promise<void> {
  await env.TOKENS.put(`${KV_PREFIX}${userId}`, JSON.stringify(mails))
}

export async function addScheduledMail(
  env: Env,
  userId: string,
  mail: Omit<ScheduledMail, "id" | "createdAt" | "status">,
): Promise<ScheduledMail> {
  const mails = await getScheduledMails(env, userId)
  const item: ScheduledMail = { ...mail, id: crypto.randomUUID(), createdAt: Date.now(), status: "pending" }
  mails.push(item)
  await putScheduledMails(env, userId, mails)
  return item
}

export async function cancelScheduledMail(env: Env, userId: string, id: string): Promise<boolean> {
  const mails = await getScheduledMails(env, userId)
  const idx = mails.findIndex((m) => m.id === id)
  if (idx === -1) return false
  mails.splice(idx, 1)
  await putScheduledMails(env, userId, mails)
  return true
}

export async function sendDueScheduledMails(
  env: Env,
  session: StoredSession,
  accountMap: Record<string, ConnectedAccountRecord>,
): Promise<void> {
  if (!session.userId) return
  const mails = await getScheduledMails(env, session.userId)
  const now = Date.now()
  const due = mails.filter((m) => m.status === "pending" && m.scheduledAt <= now)
  if (due.length === 0) return

  const updated = [...mails]

  for (const mail of due) {
    const idx = updated.findIndex((m) => m.id === mail.id)
    const record = accountMap[mail.accountId]
    if (!record) {
      updated[idx] = { ...mail, status: "failed", error: "계정을 찾을 수 없습니다." }
      continue
    }
    try {
      await sendViaRecord(env, record, mail.to, mail.subject, mail.body, mail.cc, mail.bcc, undefined, mail.htmlBody, mail.fromName)
      updated[idx] = { ...mail, status: "sent" }
    } catch (err) {
      updated[idx] = { ...mail, status: "failed", error: err instanceof Error ? err.message : "전송 실패" }
    }
  }

  // 30일 지난 전송 완료/실패 건은 정리
  const cutoff = now - 30 * 24 * 60 * 60 * 1000
  const toKeep = updated.filter((m) => m.status === "pending" || m.createdAt > cutoff)
  await putScheduledMails(env, session.userId, toKeep)
}
