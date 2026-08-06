import type { Env, MailOrgState } from "../types"

// accountId 자체에 콜론이 포함될 수 있어(예: imap:host:email) 구분자로 콜론 대신
// 계정 ID/메일 ID에 나타나지 않는 제어문자를 사용한다.
const KEY_DELIMITER = ""

export function assignmentKey(accountId: string, mailId: string): string {
  return `${accountId}${KEY_DELIMITER}${mailId}`
}

export function parseAssignmentKey(key: string): { accountId: string; mailId: string } | null {
  const idx = key.indexOf(KEY_DELIMITER)
  if (idx === -1) return null
  return { accountId: key.slice(0, idx), mailId: key.slice(idx + 1) }
}

export function emptyMailOrgState(): MailOrgState {
  return { folders: [], assignments: {}, rules: [], classified: {} }
}

// 이 기능들이 추가되기 전에 저장된 상태에는 rules/classified 필드가 없을 수 있어 채워준다.
export function normalizeMailOrgState(state: Partial<MailOrgState>): MailOrgState {
  return {
    folders: state.folders ?? [],
    assignments: state.assignments ?? {},
    rules: state.rules ?? [],
    classified: state.classified ?? {},
  }
}

export async function getUserMailOrg(env: Env, userId: string): Promise<MailOrgState> {
  const raw = await env.TOKENS.get(`user:mailorg:${userId}`)
  if (!raw) return emptyMailOrgState()
  return normalizeMailOrgState(JSON.parse(raw) as Partial<MailOrgState>)
}

export async function saveUserMailOrg(env: Env, userId: string, state: MailOrgState): Promise<void> {
  await env.TOKENS.put(`user:mailorg:${userId}`, JSON.stringify(state))
}
