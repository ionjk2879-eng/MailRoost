import { Hono } from "hono"
import type { Env, Mail, MailCategory } from "../types"
import { ensureFreshToken, searchMails as gmailSearchMails } from "../lib/gmail"
import { naverSearchInbox } from "../lib/imap"
import { type GmailTokenPatch, gmailTokenPatchOf, persistAccountTokenRefresh, resolveAccounts } from "../lib/auth"
import { readRawCookie } from "../lib/cookies"
import { searchImapMails } from "../lib/mailFetch"
import { mutateMailOrg, resolveMailOrg } from "../lib/mailOrg"
import { type ApplyRuleMatchesResult, type CreateRuleResult, type UpdateRuleResult, VALID_CATEGORIES } from "../lib/mailOrgOps"
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

// 이름을 직접 안 지었을 때 조건들로부터 그럴듯한 기본 이름을 만든다.
function defaultRuleName(from: string, subject: string, excludeFrom: string, excludeSubject: string): string {
  const parts: string[] = []
  if (from) parts.push(`발신자 · ${from}`)
  if (subject) parts.push(`제목 · ${subject}`)
  if (excludeFrom) parts.push(`발신자 제외 · ${excludeFrom}`)
  if (excludeSubject) parts.push(`제목 제외 · ${excludeSubject}`)
  return parts.join(", ") || "새 규칙"
}

rules.post("/rules", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const body = await c.req
    .json<{
      name?: string
      from?: string
      subject?: string
      excludeFrom?: string
      excludeSubject?: string
      targetFolderId?: string | null
      category?: string | null
    }>()
    .catch(() => null)
  const from = body?.from?.trim() ?? ""
  const subject = body?.subject?.trim() ?? ""
  const excludeFrom = body?.excludeFrom?.trim() ?? ""
  const excludeSubject = body?.excludeSubject?.trim() ?? ""
  const targetFolderId = body?.targetFolderId ?? null
  const category = (body?.category ?? null) as MailCategory | null
  if (!from && !subject) return c.json({ error: "발신자 또는 제목 포함 조건을 하나 이상 입력해주세요." }, 400)
  if (!targetFolderId && !category) return c.json({ error: "이동할 분류 메일함이나 카테고리를 선택해주세요." }, 400)
  if (category && !VALID_CATEGORIES.includes(category)) return c.json({ error: "잘못된 카테고리입니다." }, 400)

  const session = await readSession(c.env, sessionId)
  const result = await mutateMailOrg<CreateRuleResult>(c.env, sessionId, session, {
    type: "createRule",
    id: crypto.randomUUID(),
    name: body?.name?.trim() || defaultRuleName(from, subject, excludeFrom, excludeSubject),
    from,
    subject,
    excludeFrom,
    excludeSubject,
    targetFolderId,
    category,
    createdAt: Date.now(),
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
      from?: string
      subject?: string
      excludeFrom?: string
      excludeSubject?: string
      targetFolderId?: string | null
      category?: string | null
      enabled?: boolean
    }>()
    .catch(() => null)

  const session = await readSession(c.env, sessionId)
  const result = await mutateMailOrg<UpdateRuleResult>(c.env, sessionId, session, {
    type: "updateRule",
    ruleId,
    name: body?.name,
    from: body?.from,
    subject: body?.subject,
    excludeFrom: body?.excludeFrom,
    excludeSubject: body?.excludeSubject,
    targetFolderId: body?.targetFolderId,
    category: body?.category,
    enabled: body?.enabled,
  })
  if (!result.ok) return c.json({ error: result.error }, result.status)
  return c.json({ rule: result.rule })
})

rules.delete("/rules/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const ruleId = c.req.param("id")
  const session = await readSession(c.env, sessionId)
  await mutateMailOrg(c.env, sessionId, session, { type: "deleteRule", ruleId })
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
  const accountPatch: Record<string, GmailTokenPatch> = {}

  // 서버 검색(Gmail from:/subject: 연산자, IMAP 단일 기준 SEARCH)으로 후보를 좁힌 뒤 matchRule로
  // (from/subject/excludeFrom/excludeSubject 전부) 정확히 걸러낸다. from이 있으면 from으로,
  // 없으면(제목 조건만 있는 규칙) subject로 검색한다 — 조건이 전부 AND라 이 검색으로 진짜 매치를
  // 놓치는 경우는 없다(참인 매치는 반드시 이 검색에도 걸린다).
  const searchField: "from" | "subject" = rule.from ? "from" : "subject"
  const searchKeyword = searchField === "from" ? rule.from : rule.subject

  const perAccountMatches = await Promise.all(
    accountIds.map(async (accountId): Promise<Mail[]> => {
      const record = accountMap[accountId]
      if (!record) return []
      try {
        if (record.provider === "gmail") {
          const fresh = await ensureFreshToken(c.env, record)
          if (fresh.accessToken !== record.accessToken) {
            accountPatch[accountId] = gmailTokenPatchOf(fresh)
          }
          const mails = await gmailSearchMails(fresh.accessToken, accountId, `${searchField}:"${searchKeyword}"`, RULE_APPLY_SEARCH_LIMIT)
          return mails.filter((mail) => matchRule(rule, mail))
        }
        // 삼중 OR+TEXT 구조는 네이버 등 일부 서버에서 결과가 비어있는 문제가 있어 단일 기준으로 검색한다.
        if (record.provider === "naver") {
          const mails = await naverSearchInbox(record.email, record.appPassword, accountId, searchKeyword, RULE_APPLY_SEARCH_LIMIT, searchField)
          return mails.filter((mail) => matchRule(rule, mail))
        }
        const mails = await searchImapMails(accountId, record, searchKeyword, RULE_APPLY_SEARCH_LIMIT, searchField)
        return mails.filter((mail) => matchRule(rule, mail))
      } catch (err) {
        console.error(`[rules-apply] account ${accountId} failed, skipping:`, err)
        return []
      }
    }),
  )

  if (Object.keys(accountPatch).length > 0) await persistAccountTokenRefresh(c.env, sessionId, session, accountMap, accountPatch)

  // 매치된 메일 목록을 op에 실어보내고, 최종 반영(이미 배정된 것 스킵 / archived 스킵 / 배정+classified
  // 표시)은 mutateMailOrg 호출 하나(로그인 사용자는 DO의 applyOp RPC 호출 하나) 안에서 현재 상태를
  // 기준으로 한다 — 그래서 예전처럼 "저장 직전에 최신 상태를 다시 읽어와 델타만 얹는" 별도 단계가
  // 필요 없다.
  const matches = accountIds.flatMap((accountId, i) => perAccountMatches[i].map((mail) => ({ accountId, mailId: mail.id })))
  const result = await mutateMailOrg<ApplyRuleMatchesResult>(c.env, sessionId, session, {
    type: "applyRuleMatches",
    targetFolderId,
    matches,
  })

  return c.json({ ok: true, count: result.count, alreadyClassified: result.alreadyClassified })
})

export default rules
