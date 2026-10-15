import type { AutoReplyRule, ConnectedAccountRecord, Env, MailOrgState, StoredSession } from "../types"
import { mutateMailOrg } from "./mailOrg"
import { sendViaRecord } from "./mailSend"

function isInTimeWindow(dayOfWeek: number, timeStr: string, rule: AutoReplyRule): boolean {
  if (rule.daysOfWeek && rule.daysOfWeek.length > 0 && !rule.daysOfWeek.includes(dayOfWeek)) return false
  if (rule.startTime && timeStr < rule.startTime) return false
  if (rule.endTime && timeStr > rule.endTime) return false
  return true
}

function isRuleActiveNow(rule: AutoReplyRule, now: Date): boolean {
  const dateStr = now.toISOString().slice(0, 10) // "YYYY-MM-DD"
  const timeStr = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`
  const dayOfWeek = now.getUTCDay()

  const inDateRange = (!rule.startDate || dateStr >= rule.startDate) && (!rule.endDate || dateStr <= rule.endDate)
  const inTimeWindow = isInTimeWindow(dayOfWeek, timeStr, rule)

  if (rule.rangeType === "date") return inDateRange
  if (rule.rangeType === "recurring") return inTimeWindow
  return inDateRange && inTimeWindow
}

export async function triggerAutoReplies(
  env: Env,
  session: StoredSession,
  sessionId: string,
  accountMap: Record<string, ConnectedAccountRecord>,
  newItems: { accountId: string; fromEmail: string }[],
  org: MailOrgState,
): Promise<void> {
  if (!org.autoReplies?.length || !newItems.length) return

  const now = Date.now()
  const nowDate = new Date(now)

  for (const rule of org.autoReplies) {
    if (!rule.enabled) continue
    if (!isRuleActiveNow(rule, nowDate)) continue

    for (const item of newItems) {
      if (rule.fromFilter.trim() && !item.fromEmail.toLowerCase().includes(rule.fromFilter.toLowerCase())) continue

      const sentKey = `${rule.id}:${item.fromEmail.toLowerCase()}`
      const lastSent = org.autoReplySentTo?.[sentKey] ?? 0
      if (now - lastSent < 24 * 60 * 60 * 1000) continue

      const record = accountMap[item.accountId]
      if (!record) continue

      try {
        await sendViaRecord(env, record, item.fromEmail, rule.replySubject, rule.replyBody)
        await mutateMailOrg(env, sessionId, session, { type: "recordAutoReplySent", key: sentKey, timestamp: now })
        // org 캐시도 즉시 반영해서 같은 루프에서 중복 발송하지 않도록
        if (!org.autoReplySentTo) org.autoReplySentTo = {}
        org.autoReplySentTo[sentKey] = now
      } catch {
        // fire-and-forget, 실패해도 다음 규칙으로 진행
      }
    }
  }
}
