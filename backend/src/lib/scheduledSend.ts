import type { AppNotification, ConnectedAccountRecord, Env, ScheduledMail } from "../types"
import { getUserAccounts, saveUserAccounts } from "./auth"
import { resolveForwardedAttachments, sendViaRecord } from "./mailSend"
import type { OutgoingAttachment } from "./mime"
import { saveNotification } from "./notifications"
import { deleteScheduledMail, listAllScheduledMails, saveScheduledMail } from "./scheduledMail"
import { readSession, writeSession } from "./session"

// 이 횟수만큼 실패하면 더 재시도하지 않고 예약을 포기한다 (cron이 매분 도니까 최대 5분 안에 결론남).
const MAX_RETRIES = 5

async function loadAccountsForMail(env: Env, mail: ScheduledMail): Promise<Record<string, ConnectedAccountRecord>> {
  if (mail.userId) return getUserAccounts(env, mail.userId)
  if (mail.sessionId) return (await readSession(env, mail.sessionId)).accounts
  return {}
}

async function saveAccountsForMail(
  env: Env,
  mail: ScheduledMail,
  accounts: Record<string, ConnectedAccountRecord>,
): Promise<void> {
  if (mail.userId) {
    await saveUserAccounts(env, mail.userId, accounts)
    return
  }
  if (mail.sessionId) {
    const session = await readSession(env, mail.sessionId)
    session.accounts = accounts
    await writeSession(env, mail.sessionId, session)
  }
}

function buildNotification(mail: ScheduledMail, type: AppNotification["type"], message: string): AppNotification {
  return {
    id: crypto.randomUUID(),
    userId: mail.userId,
    sessionId: mail.sessionId,
    type,
    message,
    scheduledMailId: mail.id,
    createdAt: Date.now(),
    read: false,
  }
}

// 재시도 한도에 도달하지 않았으면 retryCount를 올리고 재시도 알림을 남긴다.
// 도달했으면 예약을 지우고 최종 실패 알림을 남긴다.
async function handleFailure(env: Env, mail: ScheduledMail, reason: string): Promise<void> {
  const retryCount = (mail.retryCount ?? 0) + 1
  const label = mail.subject || "(제목 없음)"

  if (retryCount >= MAX_RETRIES) {
    await deleteScheduledMail(env, mail.id)
    await saveNotification(
      env,
      buildNotification(mail, "scheduled-failed", `"${label}" 예약발송이 ${MAX_RETRIES}번 실패해 취소되었습니다. (${reason})`),
    )
    console.error(`[scheduled] giving up on ${mail.id} after ${retryCount} attempts: ${reason}`)
    return
  }

  await saveScheduledMail(env, { ...mail, retryCount })
  await saveNotification(
    env,
    buildNotification(mail, "scheduled-retry", `"${label}" 예약발송 실패 (${retryCount}/${MAX_RETRIES}회) — 잠시 후 다시 시도합니다. (${reason})`),
  )
  console.error(`[scheduled] attempt ${retryCount}/${MAX_RETRIES} failed for ${mail.id}: ${reason}`)
}

// cron이 매분 호출한다. 도래한(sendAt <= now) 예약 메일을 찾아 실제로 발송하고 지운다.
// 개별 항목이 실패해도(계정 토큰 만료 등) 나머지는 계속 처리하고, 실패한 건은 MAX_RETRIES까지 재시도한다.
export async function processDueScheduledMails(env: Env, now: number): Promise<void> {
  const all = await listAllScheduledMails(env)
  const due = all.filter((m) => m.sendAt <= now)

  for (const mail of due) {
    try {
      const accountMap = await loadAccountsForMail(env, mail)
      const record = accountMap[mail.accountId]
      if (!record) {
        await handleFailure(env, mail, "보내는 계정을 찾을 수 없습니다.")
        continue
      }

      let attachments: OutgoingAttachment[] | undefined
      let accountsChanged = false
      if (mail.forwardedAttachments?.length) {
        const resolved = await resolveForwardedAttachments(env, accountMap, mail.forwardedAttachments)
        attachments = resolved.attachments
        accountsChanged = resolved.accountsChanged
      }

      const { updatedRecord } = await sendViaRecord(env, record, mail.to, mail.subject, mail.body, mail.cc, mail.bcc, attachments)
      if (updatedRecord) {
        accountMap[mail.accountId] = updatedRecord
        accountsChanged = true
      }
      if (accountsChanged) await saveAccountsForMail(env, mail, accountMap)

      await deleteScheduledMail(env, mail.id)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      await handleFailure(env, mail, reason)
    }
  }
}
