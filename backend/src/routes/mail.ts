import { Hono } from "hono"
import type { Env, ForwardedAttachmentRef, Mail, MailCategory } from "../types"
import {
  batchModifyMessages as gmailBatchModify,
  ensureFreshToken,
  getMailDetail,
  getRawMessage,
  listInboxMails,
  markAsRead as gmailMarkAsRead,
  markAsUnread as gmailMarkAsUnread,
  markAllInboxUnreadAsRead as gmailMarkAllUnread,
  searchMails as gmailSearchMails,
  toggleStar as gmailToggleStar,
  trashMail as gmailTrash,
  trashMailBulk as gmailTrashBulk,
} from "../lib/gmail"
import { renewIfExpiringSoon } from "../lib/gmailWatch"
import {
  daumDeleteMail,
  daumDeleteMailBulk,
  daumGetMailDetail,
  daumGetRawMessage,
  daumMarkAsRead,
  daumMarkAsReadBulk,
  daumMarkAllInboxUnreadAsRead,
  daumMarkAsUnread,
  daumToggleStar,
  daumToggleStarBulk,
  imapDeleteMail,
  imapDeleteMailBulk,
  imapGetMailDetail,
  imapGetRawMessage,
  imapMarkAsRead,
  imapMarkAllInboxUnreadAsRead,
  imapMarkAsReadBulk,
  imapMarkAsUnread,
  imapToggleStar,
  imapToggleStarBulk,
  naverDeleteMail,
  naverDeleteMailBulk,
  naverGetMailDetail,
  naverGetRawMessage,
  naverListInbox,
  naverMarkAsRead,
  naverMarkAsReadBulk,
  naverMarkAllInboxUnreadAsRead,
  naverMarkAsUnread,
  naverSearchInbox,
  naverToggleStar,
  naverToggleStarBulk,
} from "../lib/imap"
import { type GmailTokenPatch, gmailTokenPatchOf, persistAccountTokenRefresh, resolveAccounts } from "../lib/auth"
import { readRawCookie } from "../lib/cookies"
import { type CursorMap, decodeCursor, encodeCursor } from "../lib/cursor"
import { fetchImapMails, searchImapMails } from "../lib/mailFetch"
import { fetchAttachmentForAccount, resolveForwardedAttachments, sendViaRecord } from "../lib/mailSend"
import { folderIdsOf, isArchived, mutateMailOrg, resolveMailOrg } from "../lib/mailOrg"
import type { ClassifyMailsResult, MoveMailResult, ToggleMailFolderResult } from "../lib/mailOrgOps"
import { sanitizeHtml, type OutgoingAttachment } from "../lib/mime"
import { readSession, SESSION_COOKIE } from "../lib/session"

const mail = new Hono<{ Bindings: Env }>()

mail.post("/mail/move", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const body = await c.req
    .json<{
      items?: { accountId: string; mailId: string }[]
      folderId?: string | null
      // folderId가 null일 때만 쓰인다: 어느 맥락(보관함/특정 분류 메일함)에서 "받은편지함으로"를
      //눌렀는지 알려줘서 그 배정 하나만 정확히 없앨 수 있게 한다.
      fromFolderId?: string | null
    }>()
    .catch(() => null)
  const items = body?.items
  if (!items?.length) return c.json({ error: "bad request" }, 400)
  const folderId = body?.folderId ?? null
  const fromFolderId = body?.fromFolderId ?? null

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  if (items.some((item) => !accountMap[item.accountId])) return c.json({ error: "not found" }, 404)

  const result = await mutateMailOrg<MoveMailResult>(c.env, sessionId, session, {
    type: "moveMail",
    items,
    folderId,
    fromFolderId,
  })
  if (!result.ok) return c.json({ error: result.error }, 404)
  return c.json({ ok: true })
})

// 메일 하나에 대해 특정 분류 메일함 배정을 추가/제거한다 (다른 배정에는 영향 없음).
// 메일이 여러 분류 메일함에 동시에 속할 수 있게 하는 핵심 라우트.
mail.post("/mail/folders/toggle", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const body = await c.req
    .json<{ accountId?: string; mailId?: string; folderId?: string; assign?: boolean }>()
    .catch(() => null)
  const { accountId, mailId, folderId, assign } = body ?? {}
  if (!accountId || !mailId || !folderId || typeof assign !== "boolean") {
    return c.json({ error: "bad request" }, 400)
  }

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  if (!accountMap[accountId]) return c.json({ error: "not found" }, 404)

  const result = await mutateMailOrg<ToggleMailFolderResult>(c.env, sessionId, session, {
    type: "toggleMailFolder",
    accountId,
    mailId,
    folderId,
    assign,
  })
  if (!result.ok) return c.json({ error: result.error }, 404)
  return c.json({ ok: true })
})

mail.get("/mail", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ mails: [], nextCursor: null })

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  const org = await resolveMailOrg(c.env, session)
  const accountIdParam = c.req.query("accountId")
  const cursorParam = c.req.query("cursor")

  const cursorMap: CursorMap = cursorParam ? decodeCursor(cursorParam) : {}
  const nextCursorMap: CursorMap = {}
  const accountIds = accountIdParam ? [accountIdParam] : Object.keys(accountMap)

  const results: Mail[] = []
  const failedAccountIds: string[] = []
  const accountPatch: Record<string, GmailTokenPatch> = {}

  const IMAP_PAGE = 20
  const GMAIL_PAGE = 20

  // 계정별로 병렬 조회 (직렬로 하면 계정 수만큼 지연이 누적됨).
  // 계정 하나가 실패해도(네트워크 문제 등) 나머지 계정 결과까지 통째로 날아가면 안 되므로
  // 계정별로 에러를 잡아서 그 계정만 빈 결과로 건너뛴다.
  const perAccountResults = await Promise.all(
    accountIds.map(async (accountId) => {
      const record = accountMap[accountId]
      if (!record) return null

      try {
        const cursorState = cursorMap[accountId] ?? {}

        if (record.provider === "naver") {
          const offset = cursorState.offset ?? 0
          const { mails, hasMore } = await naverListInbox(record.email, record.appPassword, accountId, IMAP_PAGE, offset)
          return { accountId, mails, cursor: hasMore ? { offset: offset + IMAP_PAGE } : undefined, failed: false as const }
        }

        if (record.provider === "daum" || record.provider === "imap") {
          const offset = cursorState.offset ?? 0
          const { mails, hasMore } = await fetchImapMails(accountId, record, IMAP_PAGE, offset)
          return { accountId, mails, cursor: hasMore ? { offset: offset + IMAP_PAGE } : undefined, failed: false as const }
        }

        const fresh = await ensureFreshToken(c.env, record)
        const updatedRecord = fresh.accessToken !== record.accessToken ? fresh : undefined
        // 전용 크론 없이, 이미 도는 폴링 요청에 편승해 만료 임박한 watch만 갱신한다
        // (lib/gmailWatch.ts의 renewIfExpiringSoon 주석 참고). 응답을 늦추지 않도록 fire-and-forget.
        if (session.userId) c.executionCtx.waitUntil(renewIfExpiringSoon(c.env, session.userId, accountId, fresh))
        const pageToken = cursorState.pageToken
        const { mails, nextPageToken } = await listInboxMails(fresh.accessToken, accountId, GMAIL_PAGE, pageToken)
        return { accountId, mails, cursor: nextPageToken ? { pageToken: nextPageToken } : undefined, updatedRecord, failed: false as const }
      } catch (err) {
        console.error(`[mail] account ${accountId} failed, skipping:`, err)
        return { accountId, failed: true as const }
      }
    }),
  )

  // 새로 도착한(한 번도 평가한 적 없는) 메일만 규칙과 대조해야 하므로, 판정 대상 후보를 전부 모아
  // mutateMailOrg 호출 하나(로그인 사용자는 DO의 applyOp RPC 호출 하나)로 넘긴다. "이미 평가했는지"
  // 판단과 배정/보관/classified 표시 반영이 전부 그 호출 안에서, 그 시점의 현재 상태를 기준으로
  // 일어나므로 예전처럼 "저장 직전에 최신 상태를 다시 읽어와 델타만 얹는" 단계가 필요 없다.
  const classifyItems: { accountId: string; mailId: string; fromName: string; fromEmail: string; subject: string; category: MailCategory }[] = []
  if (org.rules.length > 0) {
    for (const result of perAccountResults) {
      if (!result || result.failed) continue
      for (const item of result.mails) {
        classifyItems.push({
          accountId: result.accountId,
          mailId: item.id,
          fromName: item.fromName,
          fromEmail: item.fromEmail,
          subject: item.subject,
          category: item.category,
        })
      }
    }
  }

  const classifyResults =
    classifyItems.length > 0
      ? await mutateMailOrg<ClassifyMailsResult>(c.env, sessionId, session, { type: "classifyMails", items: classifyItems })
      : null

  let classifyIdx = 0
  for (const result of perAccountResults) {
    if (!result) continue
    if (result.failed) {
      failedAccountIds.push(result.accountId)
      continue
    }
    for (const item of result.mails) {
      let archived: boolean
      let folderIds: string[]
      if (classifyResults) {
        const classified = classifyResults[classifyIdx++]
        archived = classified.archived
        folderIds = classified.folderIds
        item.category = classified.category
      } else {
        archived = isArchived(org, result.accountId, item.id)
        folderIds = folderIdsOf(org, result.accountId, item.id)
      }
      if (archived) continue
      item.folderIds = folderIds
      results.push(item)
    }
    if (result.cursor) nextCursorMap[result.accountId] = result.cursor
    if (result.updatedRecord) {
      accountPatch[result.accountId] = gmailTokenPatchOf(result.updatedRecord)
    }
  }

  if (Object.keys(accountPatch).length > 0) await persistAccountTokenRefresh(c.env, sessionId, session, accountMap, accountPatch)

  results.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
  const nextCursor = Object.keys(nextCursorMap).length > 0 ? encodeCursor(nextCursorMap) : null
  return c.json({ mails: results, nextCursor, failedAccountIds })
})

// 이미 불러온 메일 안에서만 훑는 클라이언트 검색과 달리, 계정 서버(Gmail 검색 / IMAP SEARCH)에서
// 직접 검색한다. 계정별로 병렬 조회하고 하나가 실패해도 나머지 결과는 그대로 돌려준다.
const SEARCH_PAGE_PER_ACCOUNT = 30

mail.get("/mail/search", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ mails: [], failedAccountIds: [] })

  const query = c.req.query("q")?.trim()
  if (!query) return c.json({ mails: [], failedAccountIds: [] })

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  const org = await resolveMailOrg(c.env, session)
  const accountIds = Object.keys(accountMap)

  const results: Mail[] = []
  const failedAccountIds: string[] = []
  const accountPatch: Record<string, GmailTokenPatch> = {}

  const perAccountResults = await Promise.all(
    accountIds.map(async (accountId) => {
      const record = accountMap[accountId]
      if (!record) return null
      try {
        if (record.provider === "naver") {
          const mails = await naverSearchInbox(record.email, record.appPassword, accountId, query, SEARCH_PAGE_PER_ACCOUNT)
          return { accountId, mails }
        }
        if (record.provider === "daum" || record.provider === "imap") {
          const mails = await searchImapMails(accountId, record, query, SEARCH_PAGE_PER_ACCOUNT)
          return { accountId, mails }
        }
        const fresh = await ensureFreshToken(c.env, record)
        const updatedRecord = fresh.accessToken !== record.accessToken ? fresh : undefined
        const mails = await gmailSearchMails(fresh.accessToken, accountId, query, SEARCH_PAGE_PER_ACCOUNT)
        return { accountId, mails, updatedRecord }
      } catch (err) {
        console.error(`[mail-search] account ${accountId} failed, skipping:`, err)
        return { accountId, failed: true as const }
      }
    }),
  )

  for (const result of perAccountResults) {
    if (!result) continue
    if ('failed' in result && result.failed) {
      failedAccountIds.push(result.accountId)
      continue
    }
    for (const item of result.mails) {
      if (isArchived(org, result.accountId, item.id)) continue
      item.folderIds = folderIdsOf(org, result.accountId, item.id)
      results.push(item)
    }
    if ('updatedRecord' in result && result.updatedRecord) {
      accountPatch[result.accountId] = gmailTokenPatchOf(result.updatedRecord)
    }
  }

  if (Object.keys(accountPatch).length > 0) await persistAccountTokenRefresh(c.env, sessionId, session, accountMap, accountPatch)

  results.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
  return c.json({ mails: results, failedAccountIds })
})

mail.patch("/mail/:id/read", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  const accountId = c.req.query("accountId")
  const mailId = c.req.param("id")
  if (!sessionId || !accountId) return c.json({ error: "bad request" }, 400)

  const body = await c.req.json<{ read?: boolean }>().catch(() => null)
  const read = body?.read ?? true

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  const record = accountMap[accountId]
  if (!record) return c.json({ error: "not found" }, 404)

  if (record.provider === "naver") {
    if (read) await naverMarkAsRead(record.email, record.appPassword, mailId)
    else await naverMarkAsUnread(record.email, record.appPassword, mailId)
    return c.json({ ok: true })
  }
  if (record.provider === "daum") {
    if (read) await daumMarkAsRead(record.email, record.password, mailId)
    else await daumMarkAsUnread(record.email, record.password, mailId)
    return c.json({ ok: true })
  }
  if (record.provider === "imap") {
    const cfg = { host: record.host, port: record.port, email: record.email, password: record.password }
    if (read) await imapMarkAsRead(cfg, mailId)
    else await imapMarkAsUnread(cfg, mailId)
    return c.json({ ok: true })
  }

  const fresh = await ensureFreshToken(c.env, record)
  if (fresh.accessToken !== record.accessToken) {
    await persistAccountTokenRefresh(c.env, sessionId, session, accountMap, {
      [accountId]: gmailTokenPatchOf(fresh),
    })
  }
  if (read) await gmailMarkAsRead(fresh.accessToken, mailId)
  else await gmailMarkAsUnread(fresh.accessToken, mailId)
  return c.json({ ok: true })
})

mail.patch("/mail/:id/star", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  const accountId = c.req.query("accountId")
  const mailId = c.req.param("id")
  if (!sessionId || !accountId) return c.json({ error: "bad request" }, 400)

  const body = await c.req.json<{ starred?: boolean }>().catch(() => null)
  const starred = body?.starred ?? true

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  const record = accountMap[accountId]
  if (!record) return c.json({ error: "not found" }, 404)

  if (record.provider === "naver") {
    await naverToggleStar(record.email, record.appPassword, mailId, starred)
    return c.json({ ok: true })
  }
  if (record.provider === "daum") {
    await daumToggleStar(record.email, record.password, mailId, starred)
    return c.json({ ok: true })
  }
  if (record.provider === "imap") {
    await imapToggleStar({ host: record.host, port: record.port, email: record.email, password: record.password }, mailId, starred)
    return c.json({ ok: true })
  }

  const fresh = await ensureFreshToken(c.env, record)
  if (fresh.accessToken !== record.accessToken) {
    await persistAccountTokenRefresh(c.env, sessionId, session, accountMap, {
      [accountId]: gmailTokenPatchOf(fresh),
    })
  }
  await gmailToggleStar(fresh.accessToken, mailId, starred)
  return c.json({ ok: true })
})

// ── Bulk mail actions (하나의 연결로 여러 메일 처리, 계정마다 재연결하지 않음) ──────────

mail.patch("/mail/mark-all-read", async (c) => {
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
    await naverMarkAllInboxUnreadAsRead(record.email, record.appPassword)
    return c.json({ ok: true })
  }
  if (record.provider === "daum") {
    await daumMarkAllInboxUnreadAsRead(record.email, record.password)
    return c.json({ ok: true })
  }
  if (record.provider === "imap") {
    await imapMarkAllInboxUnreadAsRead({ host: record.host, port: record.port, email: record.email, password: record.password })
    return c.json({ ok: true })
  }

  const fresh = await ensureFreshToken(c.env, record)
  if (fresh.accessToken !== record.accessToken) {
    await persistAccountTokenRefresh(c.env, sessionId, session, accountMap, {
      [accountId]: gmailTokenPatchOf(fresh),
    })
  }
  await gmailMarkAllUnread(fresh.accessToken)
  return c.json({ ok: true })
})

mail.patch("/mail/bulk/read", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const body = await c.req.json<{ accountId?: string; mailIds?: string[]; read?: boolean }>().catch(() => null)
  const accountId = body?.accountId
  const mailIds = body?.mailIds
  const read = body?.read ?? true
  if (!accountId || !mailIds?.length) return c.json({ error: "bad request" }, 400)

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  const record = accountMap[accountId]
  if (!record) return c.json({ error: "not found" }, 404)

  if (record.provider === "naver") {
    await naverMarkAsReadBulk(record.email, record.appPassword, mailIds, read)
    return c.json({ ok: true })
  }
  if (record.provider === "daum") {
    await daumMarkAsReadBulk(record.email, record.password, mailIds, read)
    return c.json({ ok: true })
  }
  if (record.provider === "imap") {
    await imapMarkAsReadBulk({ host: record.host, port: record.port, email: record.email, password: record.password }, mailIds, read)
    return c.json({ ok: true })
  }

  const fresh = await ensureFreshToken(c.env, record)
  if (fresh.accessToken !== record.accessToken) {
    await persistAccountTokenRefresh(c.env, sessionId, session, accountMap, {
      [accountId]: gmailTokenPatchOf(fresh),
    })
  }
  await gmailBatchModify(fresh.accessToken, mailIds, read ? { removeLabelIds: ["UNREAD"] } : { addLabelIds: ["UNREAD"] })
  return c.json({ ok: true })
})

mail.patch("/mail/bulk/star", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const body = await c.req.json<{ accountId?: string; mailIds?: string[]; starred?: boolean }>().catch(() => null)
  const accountId = body?.accountId
  const mailIds = body?.mailIds
  const starred = body?.starred ?? true
  if (!accountId || !mailIds?.length) return c.json({ error: "bad request" }, 400)

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  const record = accountMap[accountId]
  if (!record) return c.json({ error: "not found" }, 404)

  if (record.provider === "naver") {
    await naverToggleStarBulk(record.email, record.appPassword, mailIds, starred)
    return c.json({ ok: true })
  }
  if (record.provider === "daum") {
    await daumToggleStarBulk(record.email, record.password, mailIds, starred)
    return c.json({ ok: true })
  }
  if (record.provider === "imap") {
    await imapToggleStarBulk({ host: record.host, port: record.port, email: record.email, password: record.password }, mailIds, starred)
    return c.json({ ok: true })
  }

  const fresh = await ensureFreshToken(c.env, record)
  if (fresh.accessToken !== record.accessToken) {
    await persistAccountTokenRefresh(c.env, sessionId, session, accountMap, {
      [accountId]: gmailTokenPatchOf(fresh),
    })
  }
  await gmailBatchModify(fresh.accessToken, mailIds, starred ? { addLabelIds: ["STARRED"] } : { removeLabelIds: ["STARRED"] })
  return c.json({ ok: true })
})

mail.post("/mail/bulk-delete", async (c) => {
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
    await naverDeleteMailBulk(record.email, record.appPassword, mailIds)
  } else if (record.provider === "daum") {
    await daumDeleteMailBulk(record.email, record.password, mailIds)
  } else if (record.provider === "imap") {
    await imapDeleteMailBulk({ host: record.host, port: record.port, email: record.email, password: record.password }, mailIds)
  } else {
    const fresh = await ensureFreshToken(c.env, record)
    if (fresh.accessToken !== record.accessToken) {
      await persistAccountTokenRefresh(c.env, sessionId, session, accountMap, {
        [accountId]: gmailTokenPatchOf(fresh),
      })
    }
    await gmailTrashBulk(fresh.accessToken, mailIds)
  }

  await mutateMailOrg(c.env, sessionId, session, { type: "clearMailKeys", accountId, mailIds })
  return c.json({ ok: true })
})

mail.get("/mail/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  const accountId = c.req.query("accountId")
  const mailId = c.req.param("id")
  if (!sessionId || !accountId) return c.json({ error: "not found" }, 404)

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  const record = accountMap[accountId]
  if (!record) return c.json({ error: "not found" }, 404)

  if (record.provider === "naver") {
    return c.json(await naverGetMailDetail(record.email, record.appPassword, accountId, mailId))
  }
  if (record.provider === "daum") {
    return c.json(await daumGetMailDetail(record.email, record.password, accountId, mailId))
  }
  if (record.provider === "imap") {
    return c.json(await imapGetMailDetail(
      { host: record.host, port: record.port, email: record.email, password: record.password },
      accountId,
      mailId,
    ))
  }

  const fresh = await ensureFreshToken(c.env, record)
  if (fresh.accessToken !== record.accessToken) {
    await persistAccountTokenRefresh(c.env, sessionId, session, accountMap, {
      [accountId]: gmailTokenPatchOf(fresh),
    })
  }
  return c.json(await getMailDetail(fresh.accessToken, accountId, mailId))
})

mail.get("/mail/:id/attachment/:attachmentId", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  const accountId = c.req.query("accountId")
  const mailId = c.req.param("id")
  const attachmentId = c.req.param("attachmentId")
  if (!sessionId || !accountId) return c.json({ error: "bad request" }, 400)

  // Gmail attachments.get 응답에는 파일명/타입이 없어서, 이미 상세보기에서 받아둔 메타데이터를
  // 프론트엔드가 쿼리로 실어보낸다. IMAP 계열은 raw 메시지를 다시 파싱하므로 정확한 값을 직접 얻는다.
  const fallbackFilename = c.req.query("filename") || "attachment"
  const fallbackMimeType = c.req.query("mimeType") || "application/octet-stream"
  const inline = c.req.query("inline") === "1"

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  if (!accountMap[accountId]) return c.json({ error: "not found" }, 404)

  const { result, updatedRecord } = await fetchAttachmentForAccount(c.env, accountMap, accountId, mailId, attachmentId, {
    filename: fallbackFilename,
    mimeType: fallbackMimeType,
  })
  if (updatedRecord) {
    await persistAccountTokenRefresh(c.env, sessionId, session, accountMap, {
      [accountId]: gmailTokenPatchOf(updatedRecord),
    })
  }

  if (!result) return c.json({ error: "첨부파일을 찾을 수 없습니다." }, 404)

  return new Response(new Blob([result.bytes]), {
    headers: {
      "Content-Type": result.mimeType || fallbackMimeType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(result.filename || fallbackFilename)}`,
      "Cache-Control": "private, max-age=3600",
    },
  })
})

// 파일명에 못 쓰는 문자만 걷어낸다 — 메일 제목을 그대로 파일명으로 쓰기 위함.
function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "_").trim()
  return cleaned.slice(0, 100) || "mail"
}

mail.get("/mail/:id/eml", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  const accountId = c.req.query("accountId")
  const mailId = c.req.param("id")
  if (!sessionId || !accountId) return c.json({ error: "bad request" }, 400)

  const filename = `${sanitizeFilename(c.req.query("subject") || "mail")}.eml`

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  const record = accountMap[accountId]
  if (!record) return c.json({ error: "not found" }, 404)

  let bytes: Uint8Array | null
  if (record.provider === "naver") {
    bytes = await naverGetRawMessage(record.email, record.appPassword, mailId)
  } else if (record.provider === "daum") {
    bytes = await daumGetRawMessage(record.email, record.password, mailId)
  } else if (record.provider === "imap") {
    bytes = await imapGetRawMessage({ host: record.host, port: record.port, email: record.email, password: record.password }, mailId)
  } else {
    const fresh = await ensureFreshToken(c.env, record)
    if (fresh.accessToken !== record.accessToken) {
      await persistAccountTokenRefresh(c.env, sessionId, session, accountMap, {
        [accountId]: gmailTokenPatchOf(fresh),
      })
    }
    bytes = await getRawMessage(fresh.accessToken, mailId)
  }

  if (!bytes) return c.json({ error: "메일을 찾을 수 없습니다." }, 404)

  return new Response(new Blob([bytes]), {
    headers: {
      "Content-Type": "message/rfc822",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, max-age=3600",
    },
  })
})

mail.delete("/mail/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  const accountId = c.req.query("accountId")
  const mailId = c.req.param("id")
  if (!sessionId || !accountId) return c.json({ error: "bad request" }, 400)

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  const record = accountMap[accountId]
  if (!record) return c.json({ error: "not found" }, 404)

  if (record.provider === "naver") {
    await naverDeleteMail(record.email, record.appPassword, mailId)
  } else if (record.provider === "daum") {
    await daumDeleteMail(record.email, record.password, mailId)
  } else if (record.provider === "imap") {
    await imapDeleteMail({ host: record.host, port: record.port, email: record.email, password: record.password }, mailId)
  } else {
    const fresh = await ensureFreshToken(c.env, record)
    if (fresh.accessToken !== record.accessToken) {
      await persistAccountTokenRefresh(c.env, sessionId, session, accountMap, {
        [accountId]: gmailTokenPatchOf(fresh),
      })
    }
    await gmailTrash(fresh.accessToken, mailId)
  }

  await mutateMailOrg(c.env, sessionId, session, { type: "clearMailKeys", accountId, mailIds: [mailId] })
  return c.json({ ok: true })
})

mail.post("/mail/send", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const body = await c.req
    .json<{
      accountId?: string
      to?: string
      cc?: string
      bcc?: string
      subject?: string
      body?: string
      forwardedAttachments?: ForwardedAttachmentRef[]
      htmlBody?: string
      attachments?: Array<{ filename: string; mimeType: string; size: number; dataBase64: string }>
    }>()
    .catch(() => null)
  const { accountId, to, cc, bcc, subject, body: mailBody, htmlBody, forwardedAttachments, attachments: uploadedAttachments } = body ?? {}
  if (!accountId || !to || !subject || !mailBody) return c.json({ error: "필수 항목이 누락되었습니다." }, 400)

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  const record = accountMap[accountId]
  if (!record) return c.json({ error: "계정을 찾을 수 없습니다." }, 404)

  let attachments: OutgoingAttachment[] = []
  if (forwardedAttachments?.length) {
    const resolved = await resolveForwardedAttachments(c.env, accountMap, forwardedAttachments)
    attachments = resolved.attachments
    if (Object.keys(resolved.accountPatch).length > 0) {
      await persistAccountTokenRefresh(c.env, sessionId, session, accountMap, resolved.accountPatch)
    }
  }

  const totalUploadSize = (uploadedAttachments ?? []).reduce((sum, item) => sum + (item.size || 0), 0)
  if (totalUploadSize > 25 * 1024 * 1024) return c.json({ error: "첨부파일은 총 25MB까지 추가할 수 있습니다." }, 413)
  for (const item of uploadedAttachments ?? []) {
    if (!item.filename || !item.dataBase64) continue
    const binary = atob(item.dataBase64)
    attachments.push({ filename: item.filename, mimeType: item.mimeType || "application/octet-stream", bytes: Uint8Array.from(binary, (char) => char.charCodeAt(0)) })
  }

  const { updatedRecord } = await sendViaRecord(c.env, record, to, subject, mailBody, cc, bcc, attachments, htmlBody ? sanitizeHtml(htmlBody) : undefined)
  if (updatedRecord) {
    await persistAccountTokenRefresh(c.env, sessionId, session, accountMap, {
      [accountId]: gmailTokenPatchOf(updatedRecord),
    })
  }
  return c.json({ ok: true })
})

export default mail
