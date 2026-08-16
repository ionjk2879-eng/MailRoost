import { Hono } from "hono"
import type { Env, Mail } from "../types"
import {
  batchDeleteMessages as gmailBatchDelete,
  emptyTrash as gmailEmptyTrash,
  ensureFreshToken,
  listTrashMails as gmailListTrash,
  restoreFromTrashBulk as gmailRestoreFromTrash,
} from "../lib/gmail"
import {
  daumEmptyTrash,
  daumPermanentDeleteBulk,
  daumRestoreFromTrashBulk,
  imapEmptyTrash,
  imapPermanentDeleteBulk,
  imapRestoreFromTrashBulk,
  naverEmptyTrash,
  naverListTrash,
  naverPermanentDeleteBulk,
  naverRestoreFromTrashBulk,
} from "../lib/imap"
import { persistAccounts, resolveAccounts } from "../lib/auth"
import { readRawCookie } from "../lib/cookies"
import { type CursorMap, decodeCursor, encodeCursor } from "../lib/cursor"
import { fetchImapTrash } from "../lib/mailFetch"
import { mutateMailOrg } from "../lib/mailOrg"
import { readSession, SESSION_COOKIE } from "../lib/session"

const trash = new Hono<{ Bindings: Env }>()

// ── Trash ──────────────────────────────────────────────────────────────────────

trash.get("/trash", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ mails: [], nextCursor: null })

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  const accountIdParam = c.req.query("accountId")
  const cursorParam = c.req.query("cursor")

  const cursorMap: CursorMap = cursorParam ? decodeCursor(cursorParam) : {}
  const nextCursorMap: CursorMap = {}
  const accountIds = accountIdParam ? [accountIdParam] : Object.keys(accountMap)

  const results: Mail[] = []
  let accountsChanged = false

  const IMAP_PAGE = 50
  const GMAIL_PAGE = 50

  // 계정 하나가 실패해도 나머지 계정의 휴지통 결과까지 통째로 사라지면 안 되므로
  // 계정별로 에러를 잡아서 그 계정만 건너뛴다.
  const perAccountResults = await Promise.all(
    accountIds.map(async (accountId) => {
      const record = accountMap[accountId]
      if (!record) return null

      try {
        const cursorState = cursorMap[accountId] ?? {}

        if (record.provider === "naver") {
          const offset = cursorState.offset ?? 0
          const { mails, hasMore } = await naverListTrash(record.email, record.appPassword, accountId, IMAP_PAGE, offset)
          return { accountId, mails, cursor: hasMore ? { offset: offset + IMAP_PAGE } : undefined }
        }

        if (record.provider === "daum" || record.provider === "imap") {
          const offset = cursorState.offset ?? 0
          const { mails, hasMore } = await fetchImapTrash(accountId, record, IMAP_PAGE, offset)
          return { accountId, mails, cursor: hasMore ? { offset: offset + IMAP_PAGE } : undefined }
        }

        const fresh = await ensureFreshToken(c.env, record)
        const updatedRecord = fresh.accessToken !== record.accessToken ? fresh : undefined
        const pageToken = cursorState.pageToken
        const { mails, nextPageToken } = await gmailListTrash(fresh.accessToken, accountId, GMAIL_PAGE, pageToken)
        return { accountId, mails, cursor: nextPageToken ? { pageToken: nextPageToken } : undefined, updatedRecord }
      } catch (err) {
        console.error(`[trash] account ${accountId} failed, skipping:`, err)
        return null
      }
    }),
  )

  for (const result of perAccountResults) {
    if (!result) continue
    results.push(...result.mails)
    if (result.cursor) nextCursorMap[result.accountId] = result.cursor
    if (result.updatedRecord) {
      accountMap[result.accountId] = result.updatedRecord
      accountsChanged = true
    }
  }

  if (accountsChanged) await persistAccounts(c.env, sessionId, session, accountMap)

  results.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
  const nextCursor = Object.keys(nextCursorMap).length > 0 ? encodeCursor(nextCursorMap) : null
  return c.json({ mails: results, nextCursor })
})

trash.post("/trash/bulk-delete", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const body = await c.req.json<{ accountId?: string; mailIds?: string[] }>().catch(() => null)
  const accountId = body?.accountId
  const mailIds = body?.mailIds
  if (!accountId || !mailIds?.length) return c.json({ error: "bad request" }, 400)

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  const record = accountMap[accountId]
  if (!record) return c.json({ error: "not found" }, 404)

  if (record.provider === "naver") {
    await naverPermanentDeleteBulk(record.email, record.appPassword, mailIds)
  } else if (record.provider === "daum") {
    await daumPermanentDeleteBulk(record.email, record.password, mailIds)
  } else if (record.provider === "imap") {
    await imapPermanentDeleteBulk({ host: record.host, port: record.port, email: record.email, password: record.password }, mailIds)
  } else {
    const fresh = await ensureFreshToken(c.env, record)
    if (fresh.accessToken !== record.accessToken) {
      accountMap[accountId] = fresh
      await persistAccounts(c.env, sessionId, session, accountMap)
    }
    await gmailBatchDelete(fresh.accessToken, mailIds)
  }

  await mutateMailOrg(c.env, sessionId, session, { type: "clearMailKeys", accountId, mailIds })
  return c.json({ ok: true })
})

trash.post("/trash/restore", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const body = await c.req.json<{ accountId?: string; mailIds?: string[] }>().catch(() => null)
  const accountId = body?.accountId
  const mailIds = body?.mailIds
  if (!accountId || !mailIds?.length) return c.json({ error: "bad request" }, 400)

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  const record = accountMap[accountId]
  if (!record) return c.json({ error: "not found" }, 404)

  if (record.provider === "naver") {
    await naverRestoreFromTrashBulk(record.email, record.appPassword, mailIds)
  } else if (record.provider === "daum") {
    await daumRestoreFromTrashBulk(record.email, record.password, mailIds)
  } else if (record.provider === "imap") {
    await imapRestoreFromTrashBulk({ host: record.host, port: record.port, email: record.email, password: record.password }, mailIds)
  } else {
    const fresh = await ensureFreshToken(c.env, record)
    if (fresh.accessToken !== record.accessToken) {
      accountMap[accountId] = fresh
      await persistAccounts(c.env, sessionId, session, accountMap)
    }
    await gmailRestoreFromTrash(fresh.accessToken, mailIds)
  }

  // 복구된 메일에 남아있는 모든 org 상태를 정리한다 — 받은편지함으로 돌아온 것이므로
  // classified도 함께 지워서 현재 규칙으로 재분류될 수 있게 한다.
  await mutateMailOrg(c.env, sessionId, session, { type: "clearMailKeys", accountId, mailIds })

  return c.json({ ok: true })
})

trash.post("/trash/empty", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const body = await c.req.json<{ accountId?: string }>().catch(() => null)
  const accountId = body?.accountId
  if (!accountId) return c.json({ error: "bad request" }, 400)

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  const record = accountMap[accountId]
  if (!record) return c.json({ error: "not found" }, 404)

  if (record.provider === "naver") {
    await naverEmptyTrash(record.email, record.appPassword)
    return c.json({ ok: true })
  }
  if (record.provider === "daum") {
    await daumEmptyTrash(record.email, record.password)
    return c.json({ ok: true })
  }
  if (record.provider === "imap") {
    await imapEmptyTrash({ host: record.host, port: record.port, email: record.email, password: record.password })
    return c.json({ ok: true })
  }

  const fresh = await ensureFreshToken(c.env, record)
  if (fresh.accessToken !== record.accessToken) {
    accountMap[accountId] = fresh
    await persistAccounts(c.env, sessionId, session, accountMap)
  }
  await gmailEmptyTrash(fresh.accessToken)
  return c.json({ ok: true })
})

trash.post("/trash/empty-all", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  const accountIds = Object.keys(accountMap)

  let accountsChanged = false

  // 계정별로 병렬 처리하되, 하나가 실패해도 나머지 계정은 계속 비워지도록 에러를 개별로 잡는다.
  const results = await Promise.all(
    accountIds.map(async (accountId) => {
      const record = accountMap[accountId]
      if (!record) return { accountId, ok: true }
      try {
        if (record.provider === "naver") {
          await naverEmptyTrash(record.email, record.appPassword)
        } else if (record.provider === "daum") {
          await daumEmptyTrash(record.email, record.password)
        } else if (record.provider === "imap") {
          await imapEmptyTrash({ host: record.host, port: record.port, email: record.email, password: record.password })
        } else {
          const fresh = await ensureFreshToken(c.env, record)
          if (fresh.accessToken !== record.accessToken) {
            accountMap[accountId] = fresh
            accountsChanged = true
          }
          await gmailEmptyTrash(fresh.accessToken)
        }
        return { accountId, ok: true }
      } catch (err) {
        console.error(`[trash-empty-all] account ${accountId} failed:`, err)
        return { accountId, ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }),
  )

  if (accountsChanged) await persistAccounts(c.env, sessionId, session, accountMap)

  const failed = results.filter((r) => !r.ok)
  return c.json({ ok: failed.length === 0, failedAccountIds: failed.map((f) => f.accountId) })
})

export default trash
