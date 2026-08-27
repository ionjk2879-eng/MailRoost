import { Hono } from "hono"
import type { Contact, Env, StoredSession } from "../types"
import { readRawCookie } from "../lib/cookies"
import { getUserContacts, saveUserContacts } from "../lib/contacts"
import { readSession, SESSION_COOKIE, writeSession } from "../lib/session"

const contacts = new Hono<{ Bindings: Env }>()

async function resolveContacts(env: Env, session: StoredSession): Promise<Contact[]> {
  return session.userId ? getUserContacts(env, session.userId) : (session.contacts ?? [])
}

async function persistContacts(env: Env, sessionId: string, session: StoredSession, items: Contact[]) {
  if (session.userId) await saveUserContacts(env, session.userId, items)
  else { session.contacts = items; await writeSession(env, sessionId, session) }
}

// 쓰기 직전에 다시 읽은 최신 목록 위에 이 요청의 변경만 적용한다 — mailOrg에 썼던 것과 같은
// 레이스 회피 패턴(backend/CLAUDE.md 참고).
async function mutateContacts(
  env: Env,
  sessionId: string,
  session: StoredSession,
  mutate: (items: Contact[]) => Contact[],
): Promise<Contact[]> {
  const fresh = await resolveContacts(env, session)
  const next = mutate(fresh)
  if (next !== fresh) await persistContacts(env, sessionId, session, next)
  return next
}

contacts.get("/contacts", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ contacts: [] })
  const session = await readSession(c.env, sessionId)
  return c.json({ contacts: await resolveContacts(c.env, session) })
})

contacts.post("/contacts", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)
  const body = await c.req.json<{ name?: string; email?: string }>().catch(() => null)
  const email = body?.email?.trim().toLowerCase() ?? ""
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json({ error: "올바른 이메일 주소를 입력해주세요." }, 400)
  const session = await readSession(c.env, sessionId)

  let created: Contact | null = null
  let conflict = false
  await mutateContacts(c.env, sessionId, session, (items) => {
    if (items.some((item) => item.email.toLowerCase() === email)) {
      conflict = true
      return items
    }
    const contact: Contact = { id: crypto.randomUUID(), name: body?.name?.trim() || email.split("@")[0], email, createdAt: Date.now() }
    created = contact
    return [contact, ...items]
  })
  if (conflict) return c.json({ error: "이미 주소록에 저장된 이메일입니다." }, 409)
  return c.json({ contact: created })
})

contacts.patch("/contacts/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)
  const id = c.req.param("id")
  const body = await c.req.json<{ name?: string; email?: string }>().catch(() => null)
  const email = body?.email !== undefined ? body.email.trim().toLowerCase() : undefined
  if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: "올바른 이메일 주소를 입력해주세요." }, 400)
  }
  if (body?.name !== undefined && !body.name.trim()) return c.json({ error: "이름을 입력해주세요." }, 400)
  const session = await readSession(c.env, sessionId)

  let updated: Contact | null = null
  let conflict = false
  await mutateContacts(c.env, sessionId, session, (items) => {
    const contact = items.find((item) => item.id === id)
    if (!contact) return items
    if (email !== undefined && items.some((item) => item.id !== id && item.email.toLowerCase() === email)) {
      conflict = true
      return items
    }
    const next: Contact = {
      ...contact,
      ...(body?.name !== undefined ? { name: body.name.trim() } : {}),
      ...(email !== undefined ? { email } : {}),
    }
    updated = next
    return items.map((item) => (item.id === id ? next : item))
  })
  if (conflict) return c.json({ error: "이미 주소록에 저장된 이메일입니다." }, 409)
  if (!updated) return c.json({ error: "연락처를 찾을 수 없습니다." }, 404)
  return c.json({ contact: updated })
})

contacts.delete("/contacts/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)
  const session = await readSession(c.env, sessionId)
  const id = c.req.param("id")
  await mutateContacts(c.env, sessionId, session, (items) => items.filter((item) => item.id !== id))
  return c.json({ ok: true })
})

export default contacts
