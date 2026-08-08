import type { ConnectedAccountRecord, Env, ScheduledMail } from "../types"
import { getUserAccounts, saveUserAccounts } from "./auth"
import { resolveForwardedAttachments, sendViaRecord } from "./mailSend"
import type { OutgoingAttachment } from "./mime"
import { deleteScheduledMail, listAllScheduledMails } from "./scheduledMail"
import { readSession, writeSession } from "./session"

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

// cron이 매분 호출한다. 도래한(sendAt <= now) 예약 메일을 찾아 실제로 발송하고 지운다.
// 개별 항목이 실패해도(계정 토큰 만료 등) 나머지는 계속 처리하고, 실패한 건은 다음 실행에서 재시도한다.
export async function processDueScheduledMails(env: Env, now: number): Promise<void> {
  const all = await listAllScheduledMails(env)
  const due = all.filter((m) => m.sendAt <= now)

  for (const mail of due) {
    try {
      const accountMap = await loadAccountsForMail(env, mail)
      const record = accountMap[mail.accountId]
      if (!record) {
        console.error(`[scheduled] account ${mail.accountId} not found for scheduled mail ${mail.id}, dropping`)
        await deleteScheduledMail(env, mail.id)
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
      console.error(`[scheduled] failed to send scheduled mail ${mail.id}, will retry next run:`, err)
    }
  }
}
