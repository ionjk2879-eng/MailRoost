import type { AppNotification, Env } from "../types"

const PREFIX = "notification:"

export async function saveNotification(env: Env, notification: AppNotification): Promise<void> {
  await env.TOKENS.put(`${PREFIX}${notification.id}`, JSON.stringify(notification))
}

export async function deleteNotification(env: Env, id: string): Promise<void> {
  await env.TOKENS.delete(`${PREFIX}${id}`)
}

// 개인용 소규모 앱 전제로, 전체 알림을 나열한 뒤 필요하면 호출부에서 필터링한다.
export async function listAllNotifications(env: Env): Promise<AppNotification[]> {
  const result: AppNotification[] = []
  let cursor: string | undefined
  do {
    const page = await env.TOKENS.list({ prefix: PREFIX, cursor })
    for (const key of page.keys) {
      const raw = await env.TOKENS.get(key.name)
      if (raw) result.push(JSON.parse(raw) as AppNotification)
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return result
}
