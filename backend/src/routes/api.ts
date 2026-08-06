import { Hono } from "hono"
import type { Account, ConnectedAccountRecord, DaumAccountRecord, Env, ImapAccountRecord, Mail, MailFolder, MailOrgState, StoredSession } from "../types"
import { getUserAccounts, getUserById, saveUserAccounts } from "../lib/auth"
import { readRawCookie } from "../lib/cookies"
import {
  batchDeleteMessages as gmailBatchDelete,
  batchModifyMessages as gmailBatchModify,
  emptyTrash as gmailEmptyTrash,
  ensureFreshToken,
  fetchMailsByIds as gmailFetchByIds,
  getMailDetail,
  listInboxMails,
  listTrashMails as gmailListTrash,
  markAsRead as gmailMarkAsRead,
  markAsUnread as gmailMarkAsUnread,
  toggleStar as gmailToggleStar,
  trashMail as gmailTrash,
  trashMailBulk as gmailTrashBulk,
  sendGmailMessage,
} from "../lib/gmail"
import {
  daumDeleteMail,
  daumDeleteMailBulk,
  daumEmptyTrash,
  daumFetchByUids,
  daumGetMailDetail,
  daumListInbox,
  daumListTrash,
  daumMarkAsRead,
  daumMarkAsReadBulk,
  daumMarkAsUnread,
  daumPermanentDeleteBulk,
  daumToggleStar,
  daumToggleStarBulk,
  imapDeleteMail,
  imapDeleteMailBulk,
  imapEmptyTrash,
  imapFetchByUids,
  imapGetMailDetail,
  imapListInbox,
  imapListTrash,
  imapMarkAsRead,
  imapMarkAsReadBulk,
  imapMarkAsUnread,
  imapPermanentDeleteBulk,
  imapToggleStar,
  imapToggleStarBulk,
  naverDeleteMail,
  naverDeleteMailBulk,
  naverEmptyTrash,
  naverFetchByUids,
  naverGetMailDetail,
  naverListInbox,
  naverListTrash,
  naverMarkAsRead,
  naverMarkAsReadBulk,
  naverMarkAsUnread,
  naverPermanentDeleteBulk,
  naverToggleStar,
  naverToggleStarBulk,
} from "../lib/imap"
import { assignmentKey, emptyMailOrgState, getUserMailOrg, parseAssignmentKey, saveUserMailOrg } from "../lib/mailOrg"
import { naverSendMail, daumSendMail } from "../lib/smtp"
import { readSession, SESSION_COOKIE, writeSession } from "../lib/session"

const api = new Hono<{ Bindings: Env }>()

const GMAIL_COLOR_PALETTE = ["bg-red-500", "bg-orange-500", "bg-pink-500", "bg-purple-500", "bg-amber-500", "bg-rose-500"]
const NAVER_COLOR_PALETTE = ["bg-green-500", "bg-emerald-500", "bg-lime-500", "bg-teal-500"]
const DAUM_COLOR_PALETTE = ["bg-blue-500", "bg-sky-500", "bg-cyan-500", "bg-indigo-500"]
const IMAP_COLOR_PALETTE = ["bg-slate-500", "bg-zinc-500", "bg-stone-500", "bg-neutral-500"]
const FOLDER_COLOR_PALETTE = [
  "bg-violet-500", "bg-fuchsia-500", "bg-cyan-500", "bg-lime-500",
  "bg-orange-500", "bg-teal-500", "bg-rose-500", "bg-indigo-500",
]

// ── Cursor-based pagination helpers ──────────────────────────────────────────

type CursorState = { pageToken?: string; offset?: number }
type CursorMap = Record<string, CursorState>

function encodeCursor(map: CursorMap): string {
  return btoa(JSON.stringify(map))
}

function decodeCursor(cursor: string): CursorMap {
  try { return JSON.parse(atob(cursor)) as CursorMap } catch { return {} }
}

// ── Session helpers ───────────────────────────────────────────────────────────

async function resolveAccounts(
  env: Env,
  session: StoredSession,
): Promise<Record<string, ConnectedAccountRecord>> {
  if (session.userId) return getUserAccounts(env, session.userId)
  return session.accounts
}

async function persistAccounts(
  env: Env,
  sessionId: string,
  session: StoredSession,
  accounts: Record<string, ConnectedAccountRecord>,
): Promise<void> {
  if (session.userId) {
    await saveUserAccounts(env, session.userId, accounts)
  } else {
    session.accounts = accounts
    await writeSession(env, sessionId, session)
  }
}

async function resolveMailOrg(env: Env, session: StoredSession): Promise<MailOrgState> {
  if (session.userId) return getUserMailOrg(env, session.userId)
  return session.mailOrg ?? emptyMailOrgState()
}

async function persistMailOrg(
  env: Env,
  sessionId: string,
  session: StoredSession,
  state: MailOrgState,
): Promise<void> {
  if (session.userId) {
    await saveUserMailOrg(env, session.userId, state)
  } else {
    session.mailOrg = state
    await writeSession(env, sessionId, session)
  }
}

// ── IMAP helpers ──────────────────────────────────────────────────────────────

function isDaum(r: ConnectedAccountRecord): r is DaumAccountRecord { return r.provider === "daum" }

async function fetchImapMails(
  accountId: string,
  record: DaumAccountRecord | ImapAccountRecord,
  maxResults: number,
  offset: number,
): Promise<{ mails: Mail[]; hasMore: boolean }> {
  if (isDaum(record)) return daumListInbox(record.email, record.password, accountId, maxResults, offset)
  return imapListInbox({ host: record.host, port: record.port, email: record.email, password: record.password }, accountId, maxResults, offset)
}

async function fetchImapTrash(
  accountId: string,
  record: DaumAccountRecord | ImapAccountRecord,
  maxResults: number,
  offset: number,
): Promise<{ mails: Mail[]; hasMore: boolean }> {
  if (isDaum(record)) return daumListTrash(record.email, record.password, accountId, maxResults, offset)
  return imapListTrash({ host: record.host, port: record.port, email: record.email, password: record.password }, accountId, maxResults, offset)
}

// ── Routes ────────────────────────────────────────────────────────────────────

api.get("/me", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json(null)
  const session = await readSession(c.env, sessionId)
  if (!session.userId) return c.json(null)
  const user = await getUserById(c.env, session.userId)
  if (!user) return c.json(null)
  return c.json({ id: user.id, email: user.email })
})

api.get("/accounts", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json<Account[]>([])

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)

  let gmailIdx = 0, naverIdx = 0, daumIdx = 0, imapIdx = 0
  const accounts: Account[] = Object.entries(accountMap).map(([id, record]) => {
    if (record.provider === "naver") {
      return { id, email: record.email, provider: "naver" as const, label: "네이버", color: NAVER_COLOR_PALETTE[naverIdx++ % NAVER_COLOR_PALETTE.length] }
    }
    if (record.provider === "daum") {
      return { id, email: record.email, provider: "daum" as const, label: "다음", color: DAUM_COLOR_PALETTE[daumIdx++ % DAUM_COLOR_PALETTE.length] }
    }
    if (record.provider === "imap") {
      return { id, email: record.email, provider: "imap" as const, label: record.label, color: IMAP_COLOR_PALETTE[imapIdx++ % IMAP_COLOR_PALETTE.length] }
    }
    return { id, email: record.email, provider: "gmail" as const, label: "Gmail", color: GMAIL_COLOR_PALETTE[gmailIdx++ % GMAIL_COLOR_PALETTE.length] }
  })
  return c.json(accounts)
})

api.delete("/accounts/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const accountId = c.req.param("id")
  const session = await readSession(c.env, sessionId)
  const accounts = await resolveAccounts(c.env, session)

  if (!accounts[accountId]) return c.json({ error: "not found" }, 404)
  delete accounts[accountId]
  await persistAccounts(c.env, sessionId, session, accounts)
  return c.json({ ok: true })
})

// ── 사용자 정의 메일함 (앱 내부 전용, 실제 서버에는 반영되지 않음) ──────────────

api.get("/folders", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ folders: [] })
  const session = await readSession(c.env, sessionId)
  const org = await resolveMailOrg(c.env, session)
  return c.json({ folders: org.folders })
})

api.post("/folders", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const body = await c.req.json<{ name?: string }>().catch(() => null)
  const name = body?.name?.trim()
  if (!name) return c.json({ error: "메일함 이름을 입력해주세요." }, 400)
  if (name.length > 40) return c.json({ error: "메일함 이름이 너무 깁니다." }, 400)

  const session = await readSession(c.env, sessionId)
  const org = await resolveMailOrg(c.env, session)
  if (org.folders.some((f) => f.name === name)) {
    return c.json({ error: "이미 같은 이름의 메일함이 있습니다." }, 400)
  }

  const folder: MailFolder = {
    id: crypto.randomUUID(),
    name,
    color: FOLDER_COLOR_PALETTE[org.folders.length % FOLDER_COLOR_PALETTE.length],
    createdAt: Date.now(),
  }
  org.folders.push(folder)
  await persistMailOrg(c.env, sessionId, session, org)
  return c.json({ folder })
})

api.delete("/folders/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const folderId = c.req.param("id")
  const session = await readSession(c.env, sessionId)
  const org = await resolveMailOrg(c.env, session)

  org.folders = org.folders.filter((f) => f.id !== folderId)
  for (const key of Object.keys(org.assignments)) {
    if (org.assignments[key] === folderId) delete org.assignments[key]
  }
  await persistMailOrg(c.env, sessionId, session, org)
  return c.json({ ok: true })
})

api.patch("/folders/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const folderId = c.req.param("id")
  const body = await c.req.json<{ name?: string }>().catch(() => null)
  const name = body?.name?.trim()
  if (!name) return c.json({ error: "메일함 이름을 입력해주세요." }, 400)
  if (name.length > 40) return c.json({ error: "메일함 이름이 너무 깁니다." }, 400)

  const session = await readSession(c.env, sessionId)
  const org = await resolveMailOrg(c.env, session)

  const folder = org.folders.find((f) => f.id === folderId)
  if (!folder) return c.json({ error: "메일함을 찾을 수 없습니다." }, 404)
  if (org.folders.some((f) => f.id !== folderId && f.name === name)) {
    return c.json({ error: "이미 같은 이름의 메일함이 있습니다." }, 400)
  }

  folder.name = name
  await persistMailOrg(c.env, sessionId, session, org)
  return c.json({ folder })
})

api.get("/folders/:id/mail", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ mails: [] })

  const folderId = c.req.param("id")
  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  const org = await resolveMailOrg(c.env, session)

  const idsByAccount = new Map<string, string[]>()
  for (const [key, fid] of Object.entries(org.assignments)) {
    if (fid !== folderId) continue
    const parsed = parseAssignmentKey(key)
    if (!parsed) continue
    const list = idsByAccount.get(parsed.accountId)
    if (list) list.push(parsed.mailId)
    else idsByAccount.set(parsed.accountId, [parsed.mailId])
  }

  let accountsChanged = false
  const perAccountResults = await Promise.all(
    [...idsByAccount.entries()].map(async ([accountId, mailIds]): Promise<Mail[]> => {
      const record = accountMap[accountId]
      if (!record) return []

      if (record.provider === "naver") {
        return naverFetchByUids(record.email, record.appPassword, accountId, mailIds)
      }
      if (record.provider === "daum") {
        return daumFetchByUids(record.email, record.password, accountId, mailIds)
      }
      if (record.provider === "imap") {
        return imapFetchByUids({ host: record.host, port: record.port, email: record.email, password: record.password }, accountId, mailIds)
      }

      const fresh = await ensureFreshToken(c.env, record)
      if (fresh.accessToken !== record.accessToken) {
        accountMap[accountId] = fresh
        accountsChanged = true
      }
      return gmailFetchByIds(fresh.accessToken, accountId, mailIds)
    }),
  )

  if (accountsChanged) await persistAccounts(c.env, sessionId, session, accountMap)

  const mails = perAccountResults.flat()
  mails.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
  return c.json({ mails })
})

api.post("/mail/move", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const body = await c.req.json<{ items?: { accountId: string; mailId: string }[]; folderId?: string | null }>().catch(() => null)
  const items = body?.items
  if (!items?.length) return c.json({ error: "bad request" }, 400)
  const folderId = body?.folderId ?? null

  const session = await readSession(c.env, sessionId)
  const org = await resolveMailOrg(c.env, session)

  if (folderId !== null && !org.folders.some((f) => f.id === folderId)) {
    return c.json({ error: "메일함을 찾을 수 없습니다." }, 404)
  }

  for (const { accountId, mailId } of items) {
    const key = assignmentKey(accountId, mailId)
    if (folderId === null) delete org.assignments[key]
    else org.assignments[key] = folderId
  }
  await persistMailOrg(c.env, sessionId, session, org)
  return c.json({ ok: true })
})

api.get("/mail", async (c) => {
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
  let accountsChanged = false

  const IMAP_PAGE = 50
  const GMAIL_PAGE = 50

  // 사용자 정의 메일함으로 옮긴 메일은 받은편지함 목록에서 제외한다 (실제 서버에서는 옮기지 않으므로 앱에서 걸러냄)
  const isAssignedElsewhere = (accountId: string, mailId: string) =>
    Object.prototype.hasOwnProperty.call(org.assignments, assignmentKey(accountId, mailId))

  // 계정별로 병렬 조회 (직렬로 하면 계정 수만큼 지연이 누적됨)
  const perAccountResults = await Promise.all(
    accountIds.map(async (accountId) => {
      const record = accountMap[accountId]
      if (!record) return null

      const cursorState = cursorMap[accountId] ?? {}

      if (record.provider === "naver") {
        const offset = cursorState.offset ?? 0
        const { mails, hasMore } = await naverListInbox(record.email, record.appPassword, accountId, IMAP_PAGE, offset)
        return { accountId, mails, cursor: hasMore ? { offset: offset + IMAP_PAGE } : undefined }
      }

      if (record.provider === "daum" || record.provider === "imap") {
        const offset = cursorState.offset ?? 0
        const { mails, hasMore } = await fetchImapMails(accountId, record, IMAP_PAGE, offset)
        return { accountId, mails, cursor: hasMore ? { offset: offset + IMAP_PAGE } : undefined }
      }

      const fresh = await ensureFreshToken(c.env, record)
      const updatedRecord = fresh.accessToken !== record.accessToken ? fresh : undefined
      const pageToken = cursorState.pageToken
      const { mails, nextPageToken } = await listInboxMails(fresh.accessToken, accountId, GMAIL_PAGE, pageToken)
      return { accountId, mails, cursor: nextPageToken ? { pageToken: nextPageToken } : undefined, updatedRecord }
    }),
  )

  for (const result of perAccountResults) {
    if (!result) continue
    results.push(...result.mails.filter((m) => !isAssignedElsewhere(result.accountId, m.id)))
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

// ── Trash ──────────────────────────────────────────────────────────────────────

api.get("/trash", async (c) => {
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

  const perAccountResults = await Promise.all(
    accountIds.map(async (accountId) => {
      const record = accountMap[accountId]
      if (!record) return null

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

api.post("/trash/bulk-delete", async (c) => {
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
    return c.json({ ok: true })
  }
  if (record.provider === "daum") {
    await daumPermanentDeleteBulk(record.email, record.password, mailIds)
    return c.json({ ok: true })
  }
  if (record.provider === "imap") {
    await imapPermanentDeleteBulk({ host: record.host, port: record.port, email: record.email, password: record.password }, mailIds)
    return c.json({ ok: true })
  }

  const fresh = await ensureFreshToken(c.env, record)
  if (fresh.accessToken !== record.accessToken) {
    accountMap[accountId] = fresh
    await persistAccounts(c.env, sessionId, session, accountMap)
  }
  await gmailBatchDelete(fresh.accessToken, mailIds)
  return c.json({ ok: true })
})

api.post("/trash/empty", async (c) => {
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

api.patch("/mail/:id/read", async (c) => {
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
    accountMap[accountId] = fresh
    await persistAccounts(c.env, sessionId, session, accountMap)
  }
  if (read) await gmailMarkAsRead(fresh.accessToken, mailId)
  else await gmailMarkAsUnread(fresh.accessToken, mailId)
  return c.json({ ok: true })
})

api.patch("/mail/:id/star", async (c) => {
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
    accountMap[accountId] = fresh
    await persistAccounts(c.env, sessionId, session, accountMap)
  }
  await gmailToggleStar(fresh.accessToken, mailId, starred)
  return c.json({ ok: true })
})

// ── Bulk mail actions (하나의 연결로 여러 메일 처리, 계정마다 재연결하지 않음) ──────────

api.patch("/mail/bulk/read", async (c) => {
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
    accountMap[accountId] = fresh
    await persistAccounts(c.env, sessionId, session, accountMap)
  }
  await gmailBatchModify(fresh.accessToken, mailIds, read ? { removeLabelIds: ["UNREAD"] } : { addLabelIds: ["UNREAD"] })
  return c.json({ ok: true })
})

api.patch("/mail/bulk/star", async (c) => {
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
    accountMap[accountId] = fresh
    await persistAccounts(c.env, sessionId, session, accountMap)
  }
  await gmailBatchModify(fresh.accessToken, mailIds, starred ? { addLabelIds: ["STARRED"] } : { removeLabelIds: ["STARRED"] })
  return c.json({ ok: true })
})

api.post("/mail/bulk-delete", async (c) => {
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
    return c.json({ ok: true })
  }
  if (record.provider === "daum") {
    await daumDeleteMailBulk(record.email, record.password, mailIds)
    return c.json({ ok: true })
  }
  if (record.provider === "imap") {
    await imapDeleteMailBulk({ host: record.host, port: record.port, email: record.email, password: record.password }, mailIds)
    return c.json({ ok: true })
  }

  const fresh = await ensureFreshToken(c.env, record)
  if (fresh.accessToken !== record.accessToken) {
    accountMap[accountId] = fresh
    await persistAccounts(c.env, sessionId, session, accountMap)
  }
  await gmailTrashBulk(fresh.accessToken, mailIds)
  return c.json({ ok: true })
})

api.get("/mail/:id", async (c) => {
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
    accountMap[accountId] = fresh
    await persistAccounts(c.env, sessionId, session, accountMap)
  }
  return c.json(await getMailDetail(fresh.accessToken, accountId, mailId))
})

api.delete("/mail/:id", async (c) => {
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
    return c.json({ ok: true })
  }
  if (record.provider === "daum") {
    await daumDeleteMail(record.email, record.password, mailId)
    return c.json({ ok: true })
  }
  if (record.provider === "imap") {
    await imapDeleteMail({ host: record.host, port: record.port, email: record.email, password: record.password }, mailId)
    return c.json({ ok: true })
  }

  const fresh = await ensureFreshToken(c.env, record)
  if (fresh.accessToken !== record.accessToken) {
    accountMap[accountId] = fresh
    await persistAccounts(c.env, sessionId, session, accountMap)
  }
  await gmailTrash(fresh.accessToken, mailId)
  return c.json({ ok: true })
})

api.post("/mail/send", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const body = await c.req.json<{ accountId?: string; to?: string; subject?: string; body?: string }>().catch(() => null)
  const { accountId, to, subject, body: mailBody } = body ?? {}
  if (!accountId || !to || !subject || !mailBody) return c.json({ error: "필수 항목이 누락되었습니다." }, 400)

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  const record = accountMap[accountId]
  if (!record) return c.json({ error: "계정을 찾을 수 없습니다." }, 404)

  if (record.provider === "naver") {
    await naverSendMail(record.email, record.appPassword, to, subject, mailBody)
    return c.json({ ok: true })
  }
  if (record.provider === "daum") {
    await daumSendMail(record.email, record.password, to, subject, mailBody)
    return c.json({ ok: true })
  }
  if (record.provider === "imap") {
    return c.json({ error: "IMAP 계정은 현재 메일 보내기를 지원하지 않습니다." }, 400)
  }

  const fresh = await ensureFreshToken(c.env, record)
  if (fresh.accessToken !== record.accessToken) {
    accountMap[accountId] = fresh
    await persistAccounts(c.env, sessionId, session, accountMap)
  }
  await sendGmailMessage(fresh.accessToken, record.email, to, subject, mailBody)
  return c.json({ ok: true })
})

export default api
