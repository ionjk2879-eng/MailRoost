import { Hono } from "hono"
import type { AutoClassifyRule, Env, Mail, MailCategory } from "../types"
import { ensureFreshToken, searchMails as gmailSearchMails } from "../lib/gmail"
import { naverSearchInbox } from "../lib/imap"
import { persistAccounts, resolveAccounts } from "../lib/auth"
import { readRawCookie } from "../lib/cookies"
import { searchImapMails } from "../lib/mailFetch"
import { ARCHIVE_FOLDER_ID, assignmentKey, isArchived, mutateMailOrg, resolveMailOrg, persistMailOrg } from "../lib/mailOrg"
import { matchRule } from "../lib/rules"
import { readSession, SESSION_COOKIE } from "../lib/session"

const rules = new Hono<{ Bindings: Env }>()

// ── 자동분류 규칙 ──────────────────────────────────────────────────────────────

rules.get("/rules", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ rules: [] })
  const session = await readSession(c.env, sessionId)
  const org = await resolveMailOrg(c.env, session)
  return c.json({ rules: org.rules })
})

const VALID_CATEGORIES: MailCategory[] = ["primary", "social", "promotions", "updates", "forums"]

rules.post("/rules", async (c) => {
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

rules.patch("/rules/:id", async (c) => {
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

rules.delete("/rules/:id", async (c) => {
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

rules.post("/rules/:id/apply", async (c) => {
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
          return mails.filter((mail) => matchRule(rule, mail))
        }
        // 규칙의 field(from/subject)를 넘겨 단일 기준 IMAP SEARCH를 쓴다.
        // 삼중 OR+TEXT 구조는 네이버 등 일부 서버에서 결과가 비어있는 문제가 있다.
        if (record.provider === "naver") {
          const mails = await naverSearchInbox(record.email, record.appPassword, accountId, rule.keyword, RULE_APPLY_SEARCH_LIMIT, rule.field)
          return mails.filter((mail) => matchRule(rule, mail))
        }
        const mails = await searchImapMails(accountId, record, rule.keyword, RULE_APPLY_SEARCH_LIMIT, rule.field)
        return mails.filter((mail) => matchRule(rule, mail))
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

export default rules
