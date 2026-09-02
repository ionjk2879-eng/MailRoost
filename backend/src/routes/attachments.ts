import { Hono } from "hono"
import type { AttachmentListItem, Env } from "../types"
import { ensureFreshToken, listAttachmentsForAccount } from "../lib/gmail"
import { daumListAttachments, imapListAttachments, naverListAttachments } from "../lib/imap"
import { type GmailTokenPatch, gmailTokenPatchOf, persistAccountTokenRefresh, resolveAccounts } from "../lib/auth"
import { readRawCookie } from "../lib/cookies"
import { readSession, SESSION_COOKIE } from "../lib/session"

const attachments = new Hono<{ Bindings: Env }>()

attachments.get("/attachments", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ attachments: [], failedAccountIds: [] })

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  const accountIds = Object.keys(accountMap)
  const accountPatch: Record<string, GmailTokenPatch> = {}
  // 실패한 계정을 조용히 빈 목록으로 처리하면 "첨부파일이 없는 계정"과 구분되지 않는다 — 프론트에서 알릴 수 있게 모아둔다.
  const failedAccountIds: string[] = []

  const perAccountResults = await Promise.all(
    accountIds.map(async (accountId): Promise<AttachmentListItem[]> => {
      const record = accountMap[accountId]
      if (!record) return []
      try {
        if (record.provider === "naver") {
          return await naverListAttachments(record.email, record.appPassword, accountId)
        }
        if (record.provider === "daum") {
          return await daumListAttachments(record.email, record.password, accountId)
        }
        if (record.provider === "imap") {
          return await imapListAttachments({ host: record.host, port: record.port, email: record.email, password: record.password }, accountId)
        }
        const fresh = await ensureFreshToken(c.env, record)
        if (fresh.accessToken !== record.accessToken) {
          accountPatch[accountId] = gmailTokenPatchOf(fresh)
        }
        return await listAttachmentsForAccount(fresh.accessToken, accountId)
      } catch (err) {
        console.error(`[attachments] account ${accountId} failed, skipping:`, err)
        failedAccountIds.push(accountId)
        return []
      }
    }),
  )

  if (Object.keys(accountPatch).length > 0) await persistAccountTokenRefresh(c.env, sessionId, session, accountMap, accountPatch)

  return c.json({ attachments: perAccountResults.flat(), failedAccountIds })
})

export default attachments
