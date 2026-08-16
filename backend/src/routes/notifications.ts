import { Hono } from "hono"
import type { Env } from "../types"
import { readRawCookie } from "../lib/cookies"
import { deleteNotification, listAllNotifications, saveNotification } from "../lib/notifications"
import { readSession, SESSION_COOKIE } from "../lib/session"

const notifications = new Hono<{ Bindings: Env }>()

// ── 알림 ──────────────────────────────────────────────────────────────────────
// 새 메일 도착 같은 일반 알림은 없다 — 예약발송 재시도/최종 실패처럼 사용자가
// 놓치기 쉬운 백그라운드 이벤트만 여기 쌓인다.

notifications.get("/notifications", async (c) => {
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

notifications.patch("/notifications/:id/read", async (c) => {
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

notifications.post("/notifications/read-all", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ error: "unauthorized" }, 401)
  const session = await readSession(c.env, sessionId)

  const all = await listAllNotifications(c.env)
  const mine = all.filter((n) => (session.userId ? n.userId === session.userId : n.sessionId === sessionId) && !n.read)
  await Promise.all(mine.map((n) => saveNotification(c.env, { ...n, read: true })))
  return c.json({ ok: true })
})

notifications.delete("/notifications/:id", async (c) => {
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

export default notifications
