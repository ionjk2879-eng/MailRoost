import type { Env, ScheduledMail } from "../types"

const PREFIX = "scheduled:"

export async function saveScheduledMail(env: Env, mail: ScheduledMail): Promise<void> {
  await env.TOKENS.put(`${PREFIX}${mail.id}`, JSON.stringify(mail))
}

export async function deleteScheduledMail(env: Env, id: string): Promise<void> {
  await env.TOKENS.delete(`${PREFIX}${id}`)
}

// 개인용 소규모 앱 전제로, 전체 예약 목록을 나열한 뒤 필요하면 호출부에서 필터링한다.
export async function listAllScheduledMails(env: Env): Promise<ScheduledMail[]> {
  const result: ScheduledMail[] = []
  let cursor: string | undefined
  do {
    const page = await env.TOKENS.list({ prefix: PREFIX, cursor })
    for (const key of page.keys) {
      const raw = await env.TOKENS.get(key.name)
      if (raw) result.push(JSON.parse(raw) as ScheduledMail)
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return result
}
