import { Hono } from "hono"
import type { Env, Mail, MailFolder } from "../types"
import { ensureFreshToken, fetchMailsByIds as gmailFetchByIds } from "../lib/gmail"
import { daumFetchByUids, imapFetchByUids, naverFetchByUids } from "../lib/imap"
import { type GmailTokenPatch, gmailTokenPatchOf, persistAccountTokenRefresh, resolveAccounts } from "../lib/auth"
import { readRawCookie } from "../lib/cookies"
import { ARCHIVE_FOLDER_ID, folderIdsOf, mutateMailOrg, parseAssignmentKey, resolveMailOrg } from "../lib/mailOrg"
import type { CreateFolderResult, RenameFolderResult } from "../lib/mailOrgOps"
import { readSession, SESSION_COOKIE } from "../lib/session"

const folders = new Hono<{ Bindings: Env }>()

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

// ── 사용자 정의 분류 (앱 내부 전용, 실제 서버에는 반영되지 않음) ──────────────

folders.get("/folders", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ folders: [] })
  const session = await readSession(c.env, sessionId)
  const org = await resolveMailOrg(c.env, session)
  return c.json({ folders: org.folders })
})

folders.post("/folders", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const body = await c.req.json<{ name?: string }>().catch(() => null)
  const name = body?.name?.trim()
  if (!name) return c.json({ error: "분류 메일함 이름을 입력해주세요." }, 400)
  if (name.length > 40) return c.json({ error: "분류 메일함 이름이 너무 깁니다." }, 400)

  const session = await readSession(c.env, sessionId)
  const result = await mutateMailOrg<CreateFolderResult>(c.env, sessionId, session, {
    type: "createFolder",
    id: crypto.randomUUID(),
    name,
    color: randomFolderColor(),
    createdAt: Date.now(),
  })
  if (!result.ok) return c.json({ error: result.error }, 400)
  return c.json({ folder: result.folder })
})

folders.delete("/folders/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const folderId = c.req.param("id")
  const session = await readSession(c.env, sessionId)
  await mutateMailOrg(c.env, sessionId, session, { type: "deleteFolder", folderId })
  return c.json({ ok: true })
})

folders.patch("/folders/:id", async (c) => {
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
  const result = await mutateMailOrg<RenameFolderResult>(c.env, sessionId, session, {
    type: "renameFolder",
    folderId,
    name,
    color: body?.color,
  })
  if (!result.ok) return c.json({ error: result.error }, result.status)
  return c.json({ folder: result.folder })
})

folders.post("/folders/reorder", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const body = await c.req.json<{ order?: string[] }>().catch(() => null)
  const order = body?.order
  if (!Array.isArray(order)) return c.json({ error: "bad request" }, 400)

  const session = await readSession(c.env, sessionId)
  const result = await mutateMailOrg<MailFolder[]>(c.env, sessionId, session, { type: "reorderFolders", order })
  return c.json({ folders: result })
})

folders.get("/folders/:id/mail", async (c) => {
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

  const accountPatch: Record<string, GmailTokenPatch> = {}
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
          accountPatch[accountId] = gmailTokenPatchOf(fresh)
        }
        return await gmailFetchByIds(fresh.accessToken, accountId, mailIds)
      } catch (err) {
        console.error(`[folder-mail] account ${accountId} failed, skipping:`, err)
        return []
      }
    }),
  )

  if (Object.keys(accountPatch).length > 0) await persistAccountTokenRefresh(c.env, sessionId, session, accountMap, accountPatch)

  const mails = perAccountResults.flat()
  for (const mail of mails) mail.folderIds = folderIdsOf(org, mail.accountId, mail.id)
  mails.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
  return c.json({ mails })
})

export default folders
