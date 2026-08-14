import { Hono } from "hono"
import type { Account, AutoClassifyRule, ConnectedAccountRecord, DaumAccountRecord, Draft, Env, ForwardedAttachmentRef, ImapAccountRecord, Mail, MailCategory, MailFolder, MailOrgState, MemoItem, QuickReply, SavedFilter, StoredSession } from "../types"
import { getUserAccounts, getUserById, saveUserAccounts } from "../lib/auth"
import { readRawCookie } from "../lib/cookies"
import {
  batchDeleteMessages as gmailBatchDelete,
  batchModifyMessages as gmailBatchModify,
  emptyTrash as gmailEmptyTrash,
  markAllInboxUnreadAsRead as gmailMarkAllUnread,
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
  restoreFromTrashBulk as gmailRestoreFromTrash,
  searchMails as gmailSearchMails,
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
  daumMarkAllInboxUnreadAsRead,
  daumMarkAsUnread,
  daumPermanentDeleteBulk,
  daumRestoreFromTrashBulk,
  daumSearchInbox,
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
  imapMarkAllInboxUnreadAsRead,
  imapMarkAsReadBulk,
  imapMarkAsUnread,
  imapPermanentDeleteBulk,
  imapRestoreFromTrashBulk,
  imapSearchInbox,
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
  naverMarkAllInboxUnreadAsRead,
  naverMarkAsUnread,
  naverPermanentDeleteBulk,
  naverRestoreFromTrashBulk,
  naverSearchInbox,
  naverToggleStar,
  naverToggleStarBulk,
} from "../lib/imap"
import { getUserDrafts, saveUserDrafts } from "../lib/drafts"
import { applyOrder, ARCHIVE_FOLDER_ID, assignmentKey, emptyMailOrgState, folderIdsOf, getUserMailOrg, isArchived, normalizeMailOrgState, parseAssignmentKey, saveUserMailOrg, toggleFolderAssignment } from "../lib/mailOrg"
import { fetchAttachmentForAccount, resolveForwardedAttachments, sendViaRecord } from "../lib/mailSend"
import type { OutgoingAttachment } from "../lib/mime"
import { getUserMemos, saveUserMemos } from "../lib/memo"
import { deleteNotification, listAllNotifications, saveNotification } from "../lib/notifications"
import type { StoredPushSubscription } from "../types"
import { sendEmptyPush } from "../lib/webpush"
import { getUserQuickReplies, saveUserQuickReplies } from "../lib/quickReplies"
import { readSession, SESSION_COOKIE, writeSession } from "../lib/session"

const api = new Hono<{ Bindings: Env }>()

const GMAIL_COLOR_PALETTE = ["bg-red-500", "bg-orange-500", "bg-pink-500", "bg-purple-500", "bg-amber-500", "bg-rose-500"]
const NAVER_COLOR_PALETTE = ["bg-green-500", "bg-emerald-500", "bg-lime-500", "bg-teal-500"]
const DAUM_COLOR_PALETTE = ["bg-blue-500", "bg-sky-500", "bg-cyan-500", "bg-indigo-500"]
const IMAP_COLOR_PALETTE = ["bg-slate-500", "bg-zinc-500", "bg-stone-500", "bg-neutral-500"]
// 분류 색상은 hex 값으로 저장해 사용자가 색상 선택기로 자유롭게 바꿀 수 있게 한다
// (Tailwind 클래스명은 빌드 타임에 알려진 값만 써야 해서 임의 색상을 표현할 수 없다).

function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100
  const lNorm = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = sNorm * Math.min(lNorm, 1 - lNorm)
  const f = (n: number) => lNorm - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0")
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`
}

// 새 분류를 만들 때 매번 랜덤으로 배정되는 기본 색상. 채도/명도를 적당한 범위로 묶어
// 너무 탁하거나(채도 낮음) 형광색(채도 높음)이거나, 너무 어둡거나 밝은 색은 나오지 않게 한다.
// 이후 사용자가 원하는 색으로 자유롭게 바꿀 수 있다.
function randomFolderColor(): string {
  const hue = Math.floor(Math.random() * 360)
  const saturation = 55 + Math.random() * 20 // 55~75%
  const lightness = 45 + Math.random() * 15 // 45~60%
  return hslToHex(hue, saturation, lightness)
}

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
  return session.mailOrg ? normalizeMailOrgState(session.mailOrg) : emptyMailOrgState()
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

// org를 최신 상태로 읽어와 mutator를 적용하고 곧바로 저장한다. 읽기와 쓰기 사이에 await가 없어서
// (mutator는 동기 함수) 그 사이 다른 요청이 쓴 변경을 이 요청이 덮어쓸 여지가 사실상 없다 — 20초
// 자동 폴링이나 여러 탭에서 온 요청이 겹쳐도 안전하다. mutator 안에서 org 내용(폴더/규칙 존재
// 여부 등)을 검증하면, 항상 이 시점의 최신 상태를 기준으로 검증하는 셈이라 오히려 더 정확하다.
async function mutateMailOrg<T>(
  env: Env,
  sessionId: string,
  session: StoredSession,
  mutator: (org: MailOrgState) => T,
): Promise<T> {
  const org = await resolveMailOrg(env, session)
  const result = mutator(org)
  await persistMailOrg(env, sessionId, session, org)
  return result
}

async function resolveMemos(env: Env, session: StoredSession): Promise<MemoItem[]> {
  if (session.userId) return getUserMemos(env, session.userId)
  return session.memos ?? []
}

async function persistMemos(
  env: Env,
  sessionId: string,
  session: StoredSession,
  memos: MemoItem[],
): Promise<void> {
  if (session.userId) {
    await saveUserMemos(env, session.userId, memos)
  } else {
    session.memos = memos
    await writeSession(env, sessionId, session)
  }
}

async function resolveQuickReplies(env: Env, session: StoredSession): Promise<QuickReply[]> {
  if (session.userId) return getUserQuickReplies(env, session.userId)
  return session.quickReplies ?? []
}

async function persistQuickReplies(
  env: Env,
  sessionId: string,
  session: StoredSession,
  quickReplies: QuickReply[],
): Promise<void> {
  if (session.userId) {
    await saveUserQuickReplies(env, session.userId, quickReplies)
  } else {
    session.quickReplies = quickReplies
    await writeSession(env, sessionId, session)
  }
}

async function resolveDrafts(env: Env, session: StoredSession): Promise<Draft[]> {
  if (session.userId) return getUserDrafts(env, session.userId)
  return session.drafts ?? []
}

async function persistDrafts(
  env: Env,
  sessionId: string,
  session: StoredSession,
  drafts: Draft[],
): Promise<void> {
  if (session.userId) {
    await saveUserDrafts(env, session.userId, drafts)
  } else {
    session.drafts = drafts
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

async function searchImapMails(
  accountId: string,
  record: DaumAccountRecord | ImapAccountRecord,
  query: string,
  maxResults: number,
  field?: "from" | "subject",
): Promise<Mail[]> {
  if (isDaum(record)) return daumSearchInbox(record.email, record.password, accountId, query, maxResults, field)
  return imapSearchInbox({ host: record.host, port: record.port, email: record.email, password: record.password }, accountId, query, maxResults, field)
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
  const org = await resolveMailOrg(c.env, session)

  let gmailIdx = 0, naverIdx = 0, daumIdx = 0, imapIdx = 0
  let accounts: Account[] = Object.entries(accountMap).map(([id, record]) => {
    const signature = org.signatures[id] || undefined
    if (record.provider === "naver") {
      return { id, email: record.email, provider: "naver" as const, label: "네이버", color: NAVER_COLOR_PALETTE[naverIdx++ % NAVER_COLOR_PALETTE.length], signature }
    }
    if (record.provider === "daum") {
      return { id, email: record.email, provider: "daum" as const, label: "다음", color: DAUM_COLOR_PALETTE[daumIdx++ % DAUM_COLOR_PALETTE.length], signature }
    }
    if (record.provider === "imap") {
      return { id, email: record.email, provider: "imap" as const, label: record.label, color: IMAP_COLOR_PALETTE[imapIdx++ % IMAP_COLOR_PALETTE.length], signature }
    }
    return { id, email: record.email, provider: "gmail" as const, label: "Gmail", color: GMAIL_COLOR_PALETTE[gmailIdx++ % GMAIL_COLOR_PALETTE.length], signature }
  })
  accounts = applyOrder(accounts, org.accountOrder, (a) => a.id)
  return c.json(accounts)
})

api.patch("/accounts/:id/signature", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const accountId = c.req.param("id")
  const body = await c.req.json<{ signature?: string }>().catch(() => null)
  const signature = body?.signature ?? ""

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  if (!accountMap[accountId]) return c.json({ error: "계정을 찾을 수 없습니다." }, 404)

  await mutateMailOrg(c.env, sessionId, session, (org) => {
    if (signature.trim()) org.signatures[accountId] = signature
    else delete org.signatures[accountId]
  })
  return c.json({ ok: true, signature: signature.trim() ? signature : undefined })
})

api.post("/accounts/reorder", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const body = await c.req.json<{ order?: string[] }>().catch(() => null)
  const order = body?.order
  if (!Array.isArray(order)) return c.json({ error: "bad request" }, 400)

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  const validOrder = order.filter((id) => id in accountMap)

  await mutateMailOrg(c.env, sessionId, session, (org) => {
    org.accountOrder = validOrder
  })
  return c.json({ ok: true })
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

// ── 사용자 정의 분류 (앱 내부 전용, 실제 서버에는 반영되지 않음) ──────────────

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
  if (!name) return c.json({ error: "분류 메일함 이름을 입력해주세요." }, 400)
  if (name.length > 40) return c.json({ error: "분류 메일함 이름이 너무 깁니다." }, 400)

  const session = await readSession(c.env, sessionId)
  const result = await mutateMailOrg(c.env, sessionId, session, (org) => {
    if (org.folders.some((f) => f.name === name)) return { ok: false as const, error: "이미 같은 이름의 분류 메일함이 있습니다." }
    const folder: MailFolder = { id: crypto.randomUUID(), name, color: randomFolderColor(), createdAt: Date.now() }
    org.folders.push(folder)
    return { ok: true as const, folder }
  })
  if (!result.ok) return c.json({ error: result.error }, 400)
  return c.json({ folder: result.folder })
})

api.delete("/folders/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const folderId = c.req.param("id")
  const session = await readSession(c.env, sessionId)
  await mutateMailOrg(c.env, sessionId, session, (org) => {
    org.folders = org.folders.filter((f) => f.id !== folderId)
    for (const key of Object.keys(org.assignments)) {
      const next = org.assignments[key].filter((id) => id !== folderId)
      if (next.length > 0) org.assignments[key] = next
      else delete org.assignments[key]
    }
  })
  return c.json({ ok: true })
})

api.patch("/folders/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const folderId = c.req.param("id")
  const body = await c.req.json<{ name?: string; color?: string }>().catch(() => null)
  const name = body?.name?.trim()
  if (!name) return c.json({ error: "분류 메일함 이름을 입력해주세요." }, 400)
  if (name.length > 40) return c.json({ error: "분류 메일함 이름이 너무 깁니다." }, 400)
  if (body?.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(body.color)) {
    return c.json({ error: "잘못된 색상입니다." }, 400)
  }

  const session = await readSession(c.env, sessionId)
  const result = await mutateMailOrg(c.env, sessionId, session, (org) => {
    const folder = org.folders.find((f) => f.id === folderId)
    if (!folder) return { ok: false as const, status: 404 as const, error: "분류 메일함을 찾을 수 없습니다." }
    if (org.folders.some((f) => f.id !== folderId && f.name === name)) {
      return { ok: false as const, status: 400 as const, error: "이미 같은 이름의 분류 메일함이 있습니다." }
    }
    folder.name = name
    if (body?.color !== undefined) folder.color = body.color
    return { ok: true as const, folder }
  })
  if (!result.ok) return c.json({ error: result.error }, result.status)
  return c.json({ folder: result.folder })
})

api.post("/folders/reorder", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const body = await c.req.json<{ order?: string[] }>().catch(() => null)
  const order = body?.order
  if (!Array.isArray(order)) return c.json({ error: "bad request" }, 400)

  const session = await readSession(c.env, sessionId)
  const folders = await mutateMailOrg(c.env, sessionId, session, (org) => {
    org.folders = applyOrder(org.folders, order, (f) => f.id)
    return org.folders
  })
  return c.json({ folders })
})

api.get("/folders/:id/mail", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ mails: [] })

  const folderId = c.req.param("id")
  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  const org = await resolveMailOrg(c.env, session)

  // "archive"는 사용자 정의 분류 메일함과 달리 org.assignments가 아니라 org.archived에 따로 있다.
  const keys = folderId === ARCHIVE_FOLDER_ID
    ? Object.keys(org.archived)
    : Object.entries(org.assignments).filter(([, folderIds]) => folderIds.includes(folderId)).map(([key]) => key)

  const idsByAccount = new Map<string, string[]>()
  for (const key of keys) {
    const parsed = parseAssignmentKey(key, Object.keys(accountMap))
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

      try {
        if (record.provider === "naver") {
          return await naverFetchByUids(record.email, record.appPassword, accountId, mailIds)
        }
        if (record.provider === "daum") {
          return await daumFetchByUids(record.email, record.password, accountId, mailIds)
        }
        if (record.provider === "imap") {
          return await imapFetchByUids({ host: record.host, port: record.port, email: record.email, password: record.password }, accountId, mailIds)
        }

        const fresh = await ensureFreshToken(c.env, record)
        if (fresh.accessToken !== record.accessToken) {
          accountMap[accountId] = fresh
          accountsChanged = true
        }
        return await gmailFetchByIds(fresh.accessToken, accountId, mailIds)
      } catch (err) {
        console.error(`[folder-mail] account ${accountId} failed, skipping:`, err)
        return []
      }
    }),
  )

  if (accountsChanged) await persistAccounts(c.env, sessionId, session, accountMap)

  const mails = perAccountResults.flat()
  for (const mail of mails) mail.folderIds = folderIdsOf(org, mail.accountId, mail.id)
  mails.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
  return c.json({ mails })
})

// ── 메모 (앱 내부 전용, 메일 서버와 무관) ────────────────────────────────────────

api.get("/memos", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ memos: [] })
  const session = await readSession(c.env, sessionId)
  const memos = await resolveMemos(c.env, session)
  return c.json({ memos })
})

api.post("/memos", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const body = await c.req.json<{ content?: string }>().catch(() => null)
  const content = body?.content ?? ""

  const session = await readSession(c.env, sessionId)
  const memos = await resolveMemos(c.env, session)

  const now = Date.now()
  const memo: MemoItem = { id: crypto.randomUUID(), content, createdAt: now, updatedAt: now }
  memos.unshift(memo)
  await persistMemos(c.env, sessionId, session, memos)
  return c.json({ memo })
})

api.patch("/memos/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const memoId = c.req.param("id")
  const body = await c.req.json<{ content?: string }>().catch(() => null)
  if (body?.content === undefined) return c.json({ error: "bad request" }, 400)

  const session = await readSession(c.env, sessionId)
  const memos = await resolveMemos(c.env, session)
  const memo = memos.find((m) => m.id === memoId)
  if (!memo) return c.json({ error: "메모를 찾을 수 없습니다." }, 404)

  memo.content = body.content
  memo.updatedAt = Date.now()
  await persistMemos(c.env, sessionId, session, memos)
  return c.json({ memo })
})

api.delete("/memos/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const memoId = c.req.param("id")
  const session = await readSession(c.env, sessionId)
  const memos = await resolveMemos(c.env, session)
  const next = memos.filter((m) => m.id !== memoId)
  await persistMemos(c.env, sessionId, session, next)
  return c.json({ ok: true })
})

// ── 빠른 답장 (자주 쓰는 문구, 앱 내부 전용) ──────────────────────────────────────

api.get("/quick-replies", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ quickReplies: [] })
  const session = await readSession(c.env, sessionId)
  const quickReplies = await resolveQuickReplies(c.env, session)
  return c.json({ quickReplies })
})

api.post("/quick-replies", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const body = await c.req.json<{ title?: string; body?: string }>().catch(() => null)
  const title = body?.title?.trim()
  const replyBody = body?.body ?? ""
  if (!title) return c.json({ error: "제목을 입력해주세요." }, 400)
  if (!replyBody.trim()) return c.json({ error: "내용을 입력해주세요." }, 400)

  const session = await readSession(c.env, sessionId)
  const quickReplies = await resolveQuickReplies(c.env, session)

  const quickReply: QuickReply = { id: crypto.randomUUID(), title, body: replyBody, createdAt: Date.now() }
  quickReplies.unshift(quickReply)
  await persistQuickReplies(c.env, sessionId, session, quickReplies)
  return c.json({ quickReply })
})

api.patch("/quick-replies/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const id = c.req.param("id")
  const body = await c.req.json<{ title?: string; body?: string }>().catch(() => null)

  const session = await readSession(c.env, sessionId)
  const quickReplies = await resolveQuickReplies(c.env, session)
  const quickReply = quickReplies.find((q) => q.id === id)
  if (!quickReply) return c.json({ error: "빠른 답장을 찾을 수 없습니다." }, 404)

  if (body?.title !== undefined) {
    const title = body.title.trim()
    if (!title) return c.json({ error: "제목을 입력해주세요." }, 400)
    quickReply.title = title
  }
  if (body?.body !== undefined) {
    if (!body.body.trim()) return c.json({ error: "내용을 입력해주세요." }, 400)
    quickReply.body = body.body
  }
  await persistQuickReplies(c.env, sessionId, session, quickReplies)
  return c.json({ quickReply })
})

api.delete("/quick-replies/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const id = c.req.param("id")
  const session = await readSession(c.env, sessionId)
  const quickReplies = await resolveQuickReplies(c.env, session)
  const next = quickReplies.filter((q) => q.id !== id)
  await persistQuickReplies(c.env, sessionId, session, next)
  return c.json({ ok: true })
})

// ── 임시보관함 ──────────────────────────────────────────────────────────────────

api.get("/drafts", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ drafts: [] })
  const session = await readSession(c.env, sessionId)
  const drafts = await resolveDrafts(c.env, session)
  return c.json({ drafts: [...drafts].sort((a, b) => b.updatedAt - a.updatedAt) })
})

interface DraftFields {
  accountId?: string
  to?: string
  cc?: string
  bcc?: string
  subject?: string
  body?: string
  forwardedAttachments?: ForwardedAttachmentRef[]
}

api.post("/drafts", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const fields = (await c.req.json<DraftFields>().catch(() => ({}))) ?? {}
  const session = await readSession(c.env, sessionId)
  const drafts = await resolveDrafts(c.env, session)

  const now = Date.now()
  const draft: Draft = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, ...fields }
  drafts.unshift(draft)
  await persistDrafts(c.env, sessionId, session, drafts)
  return c.json({ draft })
})

api.patch("/drafts/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const id = c.req.param("id")
  const fields = (await c.req.json<DraftFields>().catch(() => ({}))) ?? {}

  const session = await readSession(c.env, sessionId)
  const drafts = await resolveDrafts(c.env, session)
  const draft = drafts.find((d) => d.id === id)
  if (!draft) return c.json({ error: "임시보관 메일을 찾을 수 없습니다." }, 404)

  Object.assign(draft, fields, { updatedAt: Date.now() })
  await persistDrafts(c.env, sessionId, session, drafts)
  return c.json({ draft })
})

api.delete("/drafts/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const id = c.req.param("id")
  const session = await readSession(c.env, sessionId)
  const drafts = await resolveDrafts(c.env, session)
  const next = drafts.filter((d) => d.id !== id)
  await persistDrafts(c.env, sessionId, session, next)
  return c.json({ ok: true })
})

// ── 자동분류 규칙 ──────────────────────────────────────────────────────────────

api.get("/rules", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ rules: [] })
  const session = await readSession(c.env, sessionId)
  const org = await resolveMailOrg(c.env, session)
  return c.json({ rules: org.rules })
})

const VALID_CATEGORIES: MailCategory[] = ["primary", "social", "promotions", "updates", "forums"]

api.post("/rules", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const body = await c.req
    .json<{ name?: string; field?: string; keyword?: string; targetFolderId?: string | null; category?: string | null }>()
    .catch(() => null)
  const field = body?.field
  const keyword = body?.keyword?.trim()
  const targetFolderId = body?.targetFolderId ?? null
  const category = (body?.category ?? null) as MailCategory | null
  if (field !== "from" && field !== "subject") return c.json({ error: "잘못된 조건입니다." }, 400)
  if (!keyword) return c.json({ error: "키워드를 입력해주세요." }, 400)
  if (!targetFolderId && !category) return c.json({ error: "이동할 분류 메일함이나 카테고리를 선택해주세요." }, 400)
  if (category && !VALID_CATEGORIES.includes(category)) return c.json({ error: "잘못된 카테고리입니다." }, 400)

  const session = await readSession(c.env, sessionId)
  const result = await mutateMailOrg(c.env, sessionId, session, (org) => {
    if (targetFolderId && targetFolderId !== ARCHIVE_FOLDER_ID && !org.folders.some((f) => f.id === targetFolderId)) {
      return { ok: false as const, error: "분류 메일함을 찾을 수 없습니다." }
    }
    const rule: AutoClassifyRule = {
      id: crypto.randomUUID(),
      name: body?.name?.trim() || `${field === "from" ? "발신자" : "제목"} · ${keyword}`,
      field,
      keyword,
      targetFolderId,
      category,
      enabled: true,
      createdAt: Date.now(),
    }
    org.rules.push(rule)
    return { ok: true as const, rule }
  })
  if (!result.ok) return c.json({ error: result.error }, 404)
  return c.json({ rule: result.rule })
})

api.patch("/rules/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const ruleId = c.req.param("id")
  const body = await c.req
    .json<{
      name?: string
      field?: string
      keyword?: string
      targetFolderId?: string | null
      category?: string | null
      enabled?: boolean
    }>()
    .catch(() => null)

  const session = await readSession(c.env, sessionId)
  const result = await mutateMailOrg(c.env, sessionId, session, (org) => {
    const rule = org.rules.find((r) => r.id === ruleId)
    if (!rule) return { ok: false as const, status: 404 as const, error: "규칙을 찾을 수 없습니다." }

    if (body?.name !== undefined) {
      const name = body.name.trim()
      if (!name) return { ok: false as const, status: 400 as const, error: "규칙 이름을 입력해주세요." }
      rule.name = name
    }

    if (body?.field !== undefined) {
      if (body.field !== "from" && body.field !== "subject") {
        return { ok: false as const, status: 400 as const, error: "잘못된 조건입니다." }
      }
      rule.field = body.field
    }
    if (body?.keyword !== undefined) {
      const keyword = body.keyword.trim()
      if (!keyword) return { ok: false as const, status: 400 as const, error: "키워드를 입력해주세요." }
      rule.keyword = keyword
    }
    if (body?.targetFolderId !== undefined) {
      const targetFolderId = body.targetFolderId
      if (targetFolderId && targetFolderId !== ARCHIVE_FOLDER_ID && !org.folders.some((f) => f.id === targetFolderId)) {
        return { ok: false as const, status: 404 as const, error: "분류 메일함을 찾을 수 없습니다." }
      }
      rule.targetFolderId = targetFolderId
    }
    if (body?.category !== undefined) {
      const category = body.category as MailCategory | null
      if (category && !VALID_CATEGORIES.includes(category)) {
        return { ok: false as const, status: 400 as const, error: "잘못된 카테고리입니다." }
      }
      rule.category = category
    }
    if (!rule.targetFolderId && !rule.category) {
      return { ok: false as const, status: 400 as const, error: "이동할 분류 메일함이나 카테고리를 선택해주세요." }
    }
    if (body?.enabled !== undefined) rule.enabled = body.enabled
    return { ok: true as const, rule }
  })
  if (!result.ok) return c.json({ error: result.error }, result.status)
  return c.json({ rule: result.rule })
})

api.delete("/rules/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const ruleId = c.req.param("id")
  const session = await readSession(c.env, sessionId)
  await mutateMailOrg(c.env, sessionId, session, (org) => {
    org.rules = org.rules.filter((r) => r.id !== ruleId)
  })
  return c.json({ ok: true })
})

// 이미 받은 메일에 규칙을 소급 적용한다. 프론트에서 그때그때 로드해둔 목록만 뒤지는 대신
// 계정 서버(Gmail 검색 / IMAP SEARCH)에서 직접 찾으므로, 화면에 안 불러와져 있던 오래된 메일도 찾아낸다.
const RULE_APPLY_SEARCH_LIMIT = 200

api.post("/rules/:id/apply", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const ruleId = c.req.param("id")
  const session = await readSession(c.env, sessionId)
  const org = await resolveMailOrg(c.env, session)
  const rule = org.rules.find((r) => r.id === ruleId)
  if (!rule || !rule.targetFolderId) return c.json({ error: "규칙을 찾을 수 없습니다." }, 404)
  const targetFolderId = rule.targetFolderId

  const accountMap = await resolveAccounts(c.env, session)
  const accountIds = Object.keys(accountMap)
  let accountsChanged = false

  const matchesRule = (mail: Mail) =>
    (rule.field === "from" ? `${mail.fromName} ${mail.fromEmail}` : mail.subject)
      .toLowerCase()
      .includes(rule.keyword.toLowerCase())

  const perAccountMatches = await Promise.all(
    accountIds.map(async (accountId): Promise<Mail[]> => {
      const record = accountMap[accountId]
      if (!record) return []
      try {
        if (record.provider === "gmail") {
          const fresh = await ensureFreshToken(c.env, record)
          if (fresh.accessToken !== record.accessToken) {
            accountMap[accountId] = fresh
            accountsChanged = true
          }
          // Gmail은 from:/subject: 연산자로 그 필드만 정확히 검색할 수 있다.
          const op = rule.field === "from" ? "from" : "subject"
          const mails = await gmailSearchMails(fresh.accessToken, accountId, `${op}:"${rule.keyword}"`, RULE_APPLY_SEARCH_LIMIT)
          return mails.filter(matchesRule)
        }
        // 규칙의 field(from/subject)를 넘겨 단일 기준 IMAP SEARCH를 쓴다.
        // 삼중 OR+TEXT 구조는 네이버 등 일부 서버에서 결과가 비어있는 문제가 있다.
        if (record.provider === "naver") {
          const mails = await naverSearchInbox(record.email, record.appPassword, accountId, rule.keyword, RULE_APPLY_SEARCH_LIMIT, rule.field)
          return mails.filter(matchesRule)
        }
        const mails = await searchImapMails(accountId, record, rule.keyword, RULE_APPLY_SEARCH_LIMIT, rule.field)
        return mails.filter(matchesRule)
      } catch (err) {
        console.error(`[rules-apply] account ${accountId} failed, skipping:`, err)
        return []
      }
    }),
  )

  if (accountsChanged) await persistAccounts(c.env, sessionId, session, accountMap)

  // 저장 직전에 최신 상태를 다시 읽어와 이번에 새로 찾은 배정만 얹는다 (겹친 요청이 서로 덮어쓰지 않도록).
  const latestOrg = await resolveMailOrg(c.env, session)
  let count = 0
  let alreadyClassified = 0
  accountIds.forEach((accountId, i) => {
    for (const mail of perAccountMatches[i]) {
      if (isArchived(latestOrg, accountId, mail.id)) continue
      const key = assignmentKey(accountId, mail.id)
      const current = latestOrg.assignments[key] ?? []
      if (current.includes(targetFolderId)) { alreadyClassified++; continue }
      latestOrg.assignments[key] = [...current, targetFolderId]
      latestOrg.classified[key] = true
      count++
    }
  })
  await persistMailOrg(c.env, sessionId, session, latestOrg)

  return c.json({ ok: true, count, alreadyClassified })
})

// ── 저장된 검색/스마트 필터 ──────────────────────────────────────────────────

interface SavedFilterInput {
  name?: string
  accountId?: string | null
  from?: string | null
  subject?: string | null
  isUnread?: boolean | null
  isStarred?: boolean | null
  hasAttachment?: boolean | null
  folderId?: string | null
}

api.get("/saved-filters", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ filters: [] })
  const session = await readSession(c.env, sessionId)
  const org = await resolveMailOrg(c.env, session)
  return c.json({ filters: org.savedFilters })
})

api.post("/saved-filters", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const body = await c.req.json<SavedFilterInput>().catch(() => null)
  const name = body?.name?.trim()
  if (!name) return c.json({ error: "이름을 입력해주세요." }, 400)

  const session = await readSession(c.env, sessionId)
  const result = await mutateMailOrg(c.env, sessionId, session, (org) => {
    if (body?.folderId && !org.folders.some((f) => f.id === body.folderId)) {
      return { ok: false as const, error: "분류 메일함을 찾을 수 없습니다." }
    }
    const filter: SavedFilter = {
      id: crypto.randomUUID(),
      name,
      accountId: body?.accountId ?? null,
      from: body?.from?.trim() ?? "",
      subject: body?.subject?.trim() ?? "",
      isUnread: body?.isUnread ?? null,
      isStarred: body?.isStarred ?? null,
      hasAttachment: body?.hasAttachment ?? null,
      folderId: body?.folderId ?? null,
      createdAt: Date.now(),
    }
    org.savedFilters.push(filter)
    return { ok: true as const, filter }
  })
  if (!result.ok) return c.json({ error: result.error }, 404)
  return c.json({ filter: result.filter })
})

api.delete("/saved-filters/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const filterId = c.req.param("id")
  const session = await readSession(c.env, sessionId)
  await mutateMailOrg(c.env, sessionId, session, (org) => {
    org.savedFilters = org.savedFilters.filter((f) => f.id !== filterId)
  })
  return c.json({ ok: true })
})

api.post("/mail/move", async (c) => {
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
  const result = await mutateMailOrg(c.env, sessionId, session, (org) => {
    if (folderId !== null && folderId !== ARCHIVE_FOLDER_ID && !org.folders.some((f) => f.id === folderId)) {
      return { ok: false as const, error: "분류 메일함을 찾을 수 없습니다." }
    }

    // 보관은 분류 메일함 배정과 독립적이라 라벨을 그대로 둔 채 보관 여부만 바꾼다.
    // 분류 메일함으로 이동은 기존 배정을 지우지 않고 그 분류 메일함만 추가한다(여러 개에 동시에 속할 수 있음).
    for (const { accountId, mailId } of items) {
      const key = assignmentKey(accountId, mailId)
      if (folderId === ARCHIVE_FOLDER_ID) {
        org.archived[key] = true
      } else if (folderId !== null) {
        toggleFolderAssignment(org, accountId, mailId, folderId, true)
      } else if (fromFolderId === ARCHIVE_FOLDER_ID) {
        delete org.archived[key]
      } else if (fromFolderId) {
        toggleFolderAssignment(org, accountId, mailId, fromFolderId, false)
      } else {
        delete org.archived[key]
        delete org.assignments[key]
      }
    }
    return { ok: true as const }
  })
  if (!result.ok) return c.json({ error: result.error }, 404)
  return c.json({ ok: true })
})

// 메일 하나에 대해 특정 분류 메일함 배정을 추가/제거한다 (다른 배정에는 영향 없음).
// 메일이 여러 분류 메일함에 동시에 속할 수 있게 하는 핵심 라우트.
api.post("/mail/folders/toggle", async (c) => {
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
  const result = await mutateMailOrg(c.env, sessionId, session, (org) => {
    if (!org.folders.some((f) => f.id === folderId)) return { ok: false as const, error: "분류 메일함을 찾을 수 없습니다." }
    toggleFolderAssignment(org, accountId, mailId, folderId, assign)
    return { ok: true as const }
  })
  if (!result.ok) return c.json({ error: result.error }, 404)
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
  const failedAccountIds: string[] = []
  let accountsChanged = false
  let orgChanged = false

  const IMAP_PAGE = 50
  const GMAIL_PAGE = 50

  // 이번 요청에서 새로 확정된 분류 결과 (저장 직전에 최신 상태 위에 다시 얹기 위해 델타로 기록해둔다 —
  // 20초 폴링이나 여러 탭이 겹쳐 동시에 /api/mail을 호출하면, 서로 다른 요청이 각자 읽은 오래된
  // 스냅샷을 통째로 덮어쓰면서 상대방이 방금 쓴 변경(다른 메일의 분류 배정 등)을 날려버릴 수 있다.)
  const newlyClassifiedKeys = new Set<string>()
  const newlyArchivedKeys = new Set<string>()
  const newlyAssignedFolder = new Map<string, string>()

  // 새로 도착한(한 번도 평가한 적 없는) 메일만 규칙과 대조한다 — 사용자가 수동으로 받은편지함으로
  // 되돌린 메일이 새로고침할 때마다 다시 자동분류되는 것을 막기 위함.
  function classifyIfNew(accountId: string, mail: Mail): void {
    const key = assignmentKey(accountId, mail.id)
    if (Object.prototype.hasOwnProperty.call(org.classified, key)) return
    for (const rule of org.rules) {
      if (!rule.enabled || !rule.targetFolderId) continue
      const haystack = (rule.field === "from" ? `${mail.fromName} ${mail.fromEmail}` : mail.subject).toLowerCase()
      if (haystack.includes(rule.keyword.toLowerCase())) {
        if (rule.targetFolderId === ARCHIVE_FOLDER_ID) {
          org.archived[key] = true
          newlyArchivedKeys.add(key)
        } else {
          toggleFolderAssignment(org, accountId, mail.id, rule.targetFolderId, true)
          newlyAssignedFolder.set(key, rule.targetFolderId)
        }
        break
      }
    }
    org.classified[key] = true
    newlyClassifiedKeys.add(key)
    orgChanged = true
  }

  // 카테고리는 저장되는 배정이 아니라 매번 새로 계산되는 값이라, 새 메일/기존 메일 구분 없이 매 조회마다 적용한다.
  function applyCategoryRule(mail: Mail): MailCategory {
    for (const rule of org.rules) {
      if (!rule.enabled || !rule.category) continue
      const haystack = (rule.field === "from" ? `${mail.fromName} ${mail.fromEmail}` : mail.subject).toLowerCase()
      if (haystack.includes(rule.keyword.toLowerCase())) return rule.category
    }
    return mail.category
  }

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
      } catch (err) {
        console.error(`[mail] account ${accountId} failed, skipping:`, err)
        return { accountId, failed: true }
      }
    }),
  )

  for (const result of perAccountResults) {
    if (!result) continue
    if ('failed' in result && result.failed) {
      failedAccountIds.push(result.accountId)
      continue
    }
    if (org.rules.length > 0) {
      for (const mail of result.mails) {
        classifyIfNew(result.accountId, mail)
        mail.category = applyCategoryRule(mail)
      }
    }
    for (const mail of result.mails) {
      if (isArchived(org, result.accountId, mail.id)) continue
      mail.folderIds = folderIdsOf(org, result.accountId, mail.id)
      results.push(mail)
    }
    if (result.cursor) nextCursorMap[result.accountId] = result.cursor
    if (result.updatedRecord) {
      accountMap[result.accountId] = result.updatedRecord
      accountsChanged = true
    }
  }

  if (accountsChanged) await persistAccounts(c.env, sessionId, session, accountMap)
  if (orgChanged) {
    // 저장 직전에 최신 상태를 다시 읽어와 이번 요청에서 새로 확정된 분류 결과만 얹는다 —
    // 그 사이 다른 요청(겹친 폴링 등)이 쓴 변경을 통째로 덮어쓰지 않도록.
    const latestOrg = await resolveMailOrg(c.env, session)
    for (const key of newlyClassifiedKeys) latestOrg.classified[key] = true
    for (const key of newlyArchivedKeys) latestOrg.archived[key] = true
    for (const [key, folderId] of newlyAssignedFolder) {
      const current = latestOrg.assignments[key] ?? []
      if (!current.includes(folderId)) latestOrg.assignments[key] = [...current, folderId]
    }
    await persistMailOrg(c.env, sessionId, session, latestOrg)
  }

  results.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
  const nextCursor = Object.keys(nextCursorMap).length > 0 ? encodeCursor(nextCursorMap) : null
  return c.json({ mails: results, nextCursor, failedAccountIds })
})

// 이미 불러온 메일 안에서만 훑는 클라이언트 검색과 달리, 계정 서버(Gmail 검색 / IMAP SEARCH)에서
// 직접 검색한다. 계정별로 병렬 조회하고 하나가 실패해도 나머지 결과는 그대로 돌려준다.
const SEARCH_PAGE_PER_ACCOUNT = 30

api.get("/mail/search", async (c) => {
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
  let accountsChanged = false

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
    for (const mail of result.mails) {
      if (isArchived(org, result.accountId, mail.id)) continue
      mail.folderIds = folderIdsOf(org, result.accountId, mail.id)
      results.push(mail)
    }
    if ('updatedRecord' in result && result.updatedRecord) {
      accountMap[result.accountId] = result.updatedRecord
      accountsChanged = true
    }
  }

  if (accountsChanged) await persistAccounts(c.env, sessionId, session, accountMap)

  results.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
  return c.json({ mails: results, failedAccountIds })
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

  await mutateMailOrg(c.env, sessionId, session, (org) => {
    for (const mailId of mailIds) {
      const key = assignmentKey(accountId, mailId)
      delete org.assignments[key]
      delete org.archived[key]
      delete org.snoozed[key]
      delete org.classified[key]
    }
  })
  return c.json({ ok: true })
})

api.post("/trash/restore", async (c) => {
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
  await mutateMailOrg(c.env, sessionId, session, (org) => {
    for (const mailId of mailIds) {
      const key = assignmentKey(accountId, mailId)
      delete org.assignments[key]
      delete org.archived[key]
      delete org.snoozed[key]
      delete org.classified[key]
    }
  })

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

api.post("/trash/empty-all", async (c) => {
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

api.patch("/mail/mark-all-read", async (c) => {
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
    accountMap[accountId] = fresh
    await persistAccounts(c.env, sessionId, session, accountMap)
  }
  await gmailMarkAllUnread(fresh.accessToken)
  return c.json({ ok: true })
})

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
  } else if (record.provider === "daum") {
    await daumDeleteMailBulk(record.email, record.password, mailIds)
  } else if (record.provider === "imap") {
    await imapDeleteMailBulk({ host: record.host, port: record.port, email: record.email, password: record.password }, mailIds)
  } else {
    const fresh = await ensureFreshToken(c.env, record)
    if (fresh.accessToken !== record.accessToken) {
      accountMap[accountId] = fresh
      await persistAccounts(c.env, sessionId, session, accountMap)
    }
    await gmailTrashBulk(fresh.accessToken, mailIds)
  }

  await mutateMailOrg(c.env, sessionId, session, (org) => {
    for (const mailId of mailIds) {
      const key = assignmentKey(accountId, mailId)
      delete org.assignments[key]
      delete org.archived[key]
      delete org.snoozed[key]
      delete org.classified[key]
    }
  })
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

api.get("/mail/:id/attachment/:attachmentId", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  const accountId = c.req.query("accountId")
  const mailId = c.req.param("id")
  const attachmentId = c.req.param("attachmentId")
  if (!sessionId || !accountId) return c.json({ error: "bad request" }, 400)

  // Gmail attachments.get 응답에는 파일명/타입이 없어서, 이미 상세보기에서 받아둔 메타데이터를
  // 프론트엔드가 쿼리로 실어보낸다. IMAP 계열은 raw 메시지를 다시 파싱하므로 정확한 값을 직접 얻는다.
  const fallbackFilename = c.req.query("filename") || "attachment"
  const fallbackMimeType = c.req.query("mimeType") || "application/octet-stream"

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  if (!accountMap[accountId]) return c.json({ error: "not found" }, 404)

  const { result, updatedRecord } = await fetchAttachmentForAccount(c.env, accountMap, accountId, mailId, attachmentId, {
    filename: fallbackFilename,
    mimeType: fallbackMimeType,
  })
  if (updatedRecord) {
    accountMap[accountId] = updatedRecord
    await persistAccounts(c.env, sessionId, session, accountMap)
  }

  if (!result) return c.json({ error: "첨부파일을 찾을 수 없습니다." }, 404)

  return new Response(new Blob([result.bytes]), {
    headers: {
      "Content-Type": result.mimeType || fallbackMimeType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.filename || fallbackFilename)}`,
    },
  })
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
  } else if (record.provider === "daum") {
    await daumDeleteMail(record.email, record.password, mailId)
  } else if (record.provider === "imap") {
    await imapDeleteMail({ host: record.host, port: record.port, email: record.email, password: record.password }, mailId)
  } else {
    const fresh = await ensureFreshToken(c.env, record)
    if (fresh.accessToken !== record.accessToken) {
      accountMap[accountId] = fresh
      await persistAccounts(c.env, sessionId, session, accountMap)
    }
    await gmailTrash(fresh.accessToken, mailId)
  }

  await mutateMailOrg(c.env, sessionId, session, (org) => {
    const key = assignmentKey(accountId, mailId)
    delete org.assignments[key]
    delete org.archived[key]
    delete org.snoozed[key]
    delete org.classified[key]
  })
  return c.json({ ok: true })
})

api.post("/mail/send", async (c) => {
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
    }>()
    .catch(() => null)
  const { accountId, to, cc, bcc, subject, body: mailBody, forwardedAttachments } = body ?? {}
  if (!accountId || !to || !subject || !mailBody) return c.json({ error: "필수 항목이 누락되었습니다." }, 400)

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  const record = accountMap[accountId]
  if (!record) return c.json({ error: "계정을 찾을 수 없습니다." }, 404)

  let attachments: OutgoingAttachment[] = []
  if (forwardedAttachments?.length) {
    const resolved = await resolveForwardedAttachments(c.env, accountMap, forwardedAttachments)
    attachments = resolved.attachments
    if (resolved.accountsChanged) await persistAccounts(c.env, sessionId, session, accountMap)
  }

  const { updatedRecord } = await sendViaRecord(c.env, record, to, subject, mailBody, cc, bcc, attachments)
  if (updatedRecord) {
    accountMap[accountId] = updatedRecord
    await persistAccounts(c.env, sessionId, session, accountMap)
  }
  return c.json({ ok: true })
})

// ── 알림 ──────────────────────────────────────────────────────────────────────
// 새 메일 도착 같은 일반 알림은 없다 — 예약발송 재시도/최종 실패처럼 사용자가
// 놓치기 쉬운 백그라운드 이벤트만 여기 쌓인다.

api.get("/notifications", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)
  const session = await readSession(c.env, sessionId)

  const all = await listAllNotifications(c.env)
  const mine = all
    .filter((n) => (session.userId ? n.userId === session.userId : n.sessionId === sessionId))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 50)
  return c.json({ notifications: mine })
})

api.patch("/notifications/:id/read", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)
  const session = await readSession(c.env, sessionId)

  const id = c.req.param("id")
  const all = await listAllNotifications(c.env)
  const target = all.find((n) => n.id === id)
  if (!target) return c.json({ error: "not found" }, 404)
  const owns = session.userId ? target.userId === session.userId : target.sessionId === sessionId
  if (!owns) return c.json({ error: "not found" }, 404)

  await saveNotification(c.env, { ...target, read: true })
  return c.json({ ok: true })
})

api.post("/notifications/read-all", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)
  const session = await readSession(c.env, sessionId)

  const all = await listAllNotifications(c.env)
  const mine = all.filter((n) => (session.userId ? n.userId === session.userId : n.sessionId === sessionId) && !n.read)
  await Promise.all(mine.map((n) => saveNotification(c.env, { ...n, read: true })))
  return c.json({ ok: true })
})

api.delete("/notifications/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)
  const session = await readSession(c.env, sessionId)

  const id = c.req.param("id")
  const all = await listAllNotifications(c.env)
  const target = all.find((n) => n.id === id)
  if (!target) return c.json({ error: "not found" }, 404)
  const owns = session.userId ? target.userId === session.userId : target.sessionId === sessionId
  if (!owns) return c.json({ error: "not found" }, 404)

  await deleteNotification(c.env, id)
  return c.json({ ok: true })
})

// ── 스누즈 ───────────────────────────────────────────────────────────────────
// 외부 API 키: "accountId||mailId" (||는 accountId/mailId에 절대 등장하지 않음)
// 내부 KV 키: assignmentKey(accountId, mailId) (구분자 없이 이어붙임 — lib/mailOrg.ts 참고)

function toApiSnoozeKey(accountId: string, mailId: string): string {
  return `${accountId}||${mailId}`
}

api.get("/snooze", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ snoozed: {} })
  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)

  // 만료된 항목이 있을 때만 KV에 write한다
  const now = Date.now()
  const org = await resolveMailOrg(c.env, session)
  const snoozed = org.snoozed ?? {}
  const hasExpired = Object.values(snoozed).some((until) => until <= now)

  let active: Record<string, number>
  if (hasExpired) {
    active = await mutateMailOrg(c.env, sessionId, session, (o) => {
      const next: Record<string, number> = {}
      for (const [k, until] of Object.entries(o.snoozed ?? {})) {
        if (until > now) next[k] = until
      }
      o.snoozed = next
      return next
    })
  } else {
    active = snoozed
  }

  // 내부 키 → API 키 변환
  const result: Record<string, number> = {}
  for (const [k, until] of Object.entries(active)) {
    const parsed = parseAssignmentKey(k, Object.keys(accountMap))
    if (parsed) result[toApiSnoozeKey(parsed.accountId, parsed.mailId)] = until
  }
  return c.json({ snoozed: result })
})

api.post("/snooze", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)
  const session = await readSession(c.env, sessionId)
  const body = await c.req.json<{ accountId: string; mailId: string; until: number }>()
  if (!body.accountId || !body.mailId || !body.until) return c.json({ error: "invalid" }, 400)

  await mutateMailOrg(c.env, sessionId, session, (org) => {
    org.snoozed = org.snoozed ?? {}
    org.snoozed[assignmentKey(body.accountId, body.mailId)] = body.until
  })
  return c.json({ ok: true })
})

api.delete("/snooze", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)
  const session = await readSession(c.env, sessionId)
  const body = await c.req.json<{ accountId: string; mailId: string }>()
  if (!body.accountId || !body.mailId) return c.json({ error: "invalid" }, 400)

  await mutateMailOrg(c.env, sessionId, session, (org) => {
    org.snoozed = org.snoozed ?? {}
    delete org.snoozed[assignmentKey(body.accountId, body.mailId)]
  })
  return c.json({ ok: true })
})

// ── Muted senders ────────────────────────────────────────────────────────────

api.get("/muted", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ muted: [] })
  const session = await readSession(c.env, sessionId)
  const org = await resolveMailOrg(c.env, session)
  return c.json({ muted: org.muted ?? [] })
})

api.post("/muted", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)
  const session = await readSession(c.env, sessionId)
  const body = await c.req.json<{ email: string }>().catch(() => null)
  if (!body?.email) return c.json({ error: "invalid" }, 400)

  await mutateMailOrg(c.env, sessionId, session, (org) => {
    if (!(org.muted ?? []).includes(body.email)) org.muted = [...(org.muted ?? []), body.email]
  })
  return c.json({ ok: true })
})

api.delete("/muted", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)
  const session = await readSession(c.env, sessionId)
  const body = await c.req.json<{ email: string }>().catch(() => null)
  if (!body?.email) return c.json({ error: "invalid" }, 400)

  await mutateMailOrg(c.env, sessionId, session, (org) => {
    org.muted = (org.muted ?? []).filter((e) => e !== body.email)
  })
  return c.json({ ok: true })
})

// ── Web Push ─────────────────────────────────────────────────────────────────

const PUSH_SUBS_PREFIX = "push_subs:"

function pushSubsKey(sessionId: string): string {
  return `${PUSH_SUBS_PREFIX}${sessionId}`
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

api.get("/push/vapid-public-key", (c) => {
  return c.json({ publicKey: c.env.VAPID_PUBLIC_KEY || "" })
})

api.post("/push/subscribe", async (c) => {
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
  return c.json({ ok: true })
})

api.delete("/push/subscribe", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const body = await c.req.json<{ deviceId: string }>()
  if (!body.deviceId) return c.json({ error: "invalid" }, 400)

  const subs = await readPushSubs(c.env, sessionId)
  await savePushSubs(c.env, sessionId, subs.filter((s) => s.deviceId !== body.deviceId))
  return c.json({ ok: true })
})

api.post("/push/notify", async (c) => {
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

export default api
