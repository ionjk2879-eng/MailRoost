import { Hono } from "hono"
import type { Env, MailOrgState } from "../types"
import { readRawCookie } from "../lib/cookies"
import { mutateMailOrg, resolveMailOrg } from "../lib/mailOrg"
import { readSession, SESSION_COOKIE } from "../lib/session"

const backup = new Hono<{ Bindings: Env }>()

// ── 분류 메일함/규칙/스누즈/뮤트/저장된 필터 백업 ──────────────────────────────
// 빠른답장/연락처/메모/임시보관함은 MailOrgState가 아니라 세션 blob에 따로 저장되어 있어
// 이 백업 범위 밖이다 (별도 사안).

interface BackupFile {
  version: 1
  exportedAt: number
  state: MailOrgState
}

backup.get("/backup/export", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)
  const session = await readSession(c.env, sessionId)
  const state = await resolveMailOrg(c.env, session)
  const payload: BackupFile = { version: 1, exportedAt: Date.now(), state }
  return c.json(payload)
})

backup.post("/backup/import", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)

  const body = await c.req.json<Partial<BackupFile>>().catch(() => null)
  if (!body || typeof body.state !== "object" || body.state === null || Array.isArray(body.state)) {
    return c.json({ error: "올바른 백업 파일이 아닙니다." }, 400)
  }

  const session = await readSession(c.env, sessionId)
  const state = await mutateMailOrg<MailOrgState>(c.env, sessionId, session, {
    type: "replaceState",
    state: body.state,
  })
  return c.json({ state })
})

export default backup
