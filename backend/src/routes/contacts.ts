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
  const items = await resolveContacts(c.env, session)
  if (items.some((item) => item.email.toLowerCase() === email)) return c.json({ error: "이미 주소록에 저장된 이메일입니다." }, 409)
  const contact: Contact = { id: crypto.randomUUID(), name: body?.name?.trim() || email.split("@")[0], email, createdAt: Date.now() }
  items.unshift(contact)
  await persistContacts(c.env, sessionId, session, items)
  return c.json({ contact })
})

contacts.delete("/contacts/:id", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)
  const session = await readSession(c.env, sessionId)
  const items = await resolveContacts(c.env, session)
  await persistContacts(c.env, sessionId, session, items.filter((item) => item.id !== c.req.param("id")))
  return c.json({ ok: true })
})

export default contacts
