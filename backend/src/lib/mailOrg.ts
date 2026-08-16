import type { Env, MailOrgState, StoredSession } from "../types"
import { writeSession } from "./session"

// 보관함은 사용자 정의 분류와 동일한 배정 메커니즘을 쓰는 예약된 가상 폴더 ID.
// org.folders 목록에는 들어가지 않으므로 이름변경/삭제 대상이 되지 않는다.
export const ARCHIVE_FOLDER_ID = "archive"

// accountId와 mailId 사이에 구분자 없이 그냥 이어붙인다 (accountId 자체에 콜론이 포함될 수 있어
// -예: imap:host:email- 구분자를 넣더라도 accountId만 보고는 어차피 못 나눈다). 대신 되돌릴 때
// (parseAssignmentKey)는 지금 연결된 계정 id 목록과 접두사 대조로 나눈다.
export function assignmentKey(accountId: string, mailId: string): string {
  return `${accountId}${mailId}`
}

export function parseAssignmentKey(
  key: string,
  accountIds: Iterable<string>,
): { accountId: string; mailId: string } | null {
  let bestAccountId: string | null = null
  for (const accountId of accountIds) {
    if (!key.startsWith(accountId)) continue
    if (bestAccountId === null || accountId.length > bestAccountId.length) bestAccountId = accountId
  }
  if (bestAccountId === null) return null
  let mailId = key.slice(bestAccountId.length)
  // 아주 예전 버전은 실제 제어문자(U+0001)를 구분자로 썼던 적이 있어, 그때 만들어진 키가
  // 남아있으면 accountId 바로 뒤에 그 문자가 하나 끼어있을 수 있다 — 남아있으면 걷어낸다.
  // charCodeAt으로 비교하는 이유: 문자열 리터럴에 이 문자를 그대로 박아두면 편집기에 안 보여서
  // 빈 문자열로 잘못 굳어버릴 수 있다 (바로 이 함수가 고치는 버그의 원인이 그거였다).
  if (mailId.charCodeAt(0) === 1) mailId = mailId.slice(1)
  return { accountId: bestAccountId, mailId }
}

export function emptyMailOrgState(): MailOrgState {
  return { folders: [], assignments: {}, archived: {}, rules: [], classified: {}, accountOrder: [], signatures: {}, snoozed: {}, muted: [], savedFilters: [] }
}

// 이 기능이 추가되기 전에는 assignments가 accountId+mailId당 분류 메일함 id 문자열 하나였고
// (보관함이면 그 값이 "archive"), 지금은 여러 분류 메일함을 동시에 담는 배열이며 보관 여부는
// 별도 archived 맵으로 분리되어 있다. 예전 형식으로 저장된 값도 새 형식으로 옮겨준다.
type LegacyAssignments = Record<string, string | string[]>

export function normalizeMailOrgState(
  state: Partial<Omit<MailOrgState, "assignments" | "archived">> & {
    assignments?: LegacyAssignments
    archived?: Record<string, true>
  },
): MailOrgState {
  const assignments: Record<string, string[]> = {}
  const archived: Record<string, true> = { ...(state.archived ?? {}) }

  for (const [key, value] of Object.entries(state.assignments ?? {})) {
    if (Array.isArray(value)) {
      const folderIds = value.filter((id) => id !== ARCHIVE_FOLDER_ID)
      if (folderIds.length > 0) assignments[key] = folderIds
      if (value.includes(ARCHIVE_FOLDER_ID)) archived[key] = true
    } else if (value === ARCHIVE_FOLDER_ID) {
      archived[key] = true
    } else if (value) {
      assignments[key] = [value]
    }
  }

  return {
    folders: state.folders ?? [],
    assignments,
    archived,
    rules: state.rules ?? [],
    classified: state.classified ?? {},
    accountOrder: state.accountOrder ?? [],
    signatures: state.signatures ?? {},
    snoozed: state.snoozed ?? {},
    muted: state.muted ?? [],
    savedFilters: state.savedFilters ?? [],
  }
}

// order에 있는 id 순서대로 배치하고, order에 없는 항목은 뒤에 원래 순서 그대로 붙인다.
export function applyOrder<T>(items: T[], order: string[], getId: (item: T) => string): T[] {
  const byId = new Map(items.map((item) => [getId(item), item]))
  const ordered: T[] = []
  for (const id of order) {
    const item = byId.get(id)
    if (item) {
      ordered.push(item)
      byId.delete(id)
    }
  }
  ordered.push(...byId.values())
  return ordered
}

export function folderIdsOf(org: MailOrgState, accountId: string, mailId: string): string[] {
  return org.assignments[assignmentKey(accountId, mailId)] ?? []
}

export function isArchived(org: MailOrgState, accountId: string, mailId: string): boolean {
  return !!org.archived[assignmentKey(accountId, mailId)]
}

// 분류 메일함 배정을 추가/제거한다 (보관 여부에는 영향 없음). 메일 하나가 여러 분류 메일함에
// 동시에 속할 수 있으므로 기존 배정을 지우지 않고 이 folderId만 토글한다.
export function toggleFolderAssignment(
  org: MailOrgState,
  accountId: string,
  mailId: string,
  folderId: string,
  assign: boolean,
): void {
  const key = assignmentKey(accountId, mailId)
  const current = org.assignments[key] ?? []
  if (assign) {
    if (!current.includes(folderId)) org.assignments[key] = [...current, folderId]
  } else {
    const next = current.filter((id) => id !== folderId)
    if (next.length > 0) org.assignments[key] = next
    else delete org.assignments[key]
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

export async function resolveMailOrg(env: Env, session: StoredSession): Promise<MailOrgState> {
  if (session.userId) return getUserMailOrg(env, session.userId)
  return session.mailOrg ? normalizeMailOrgState(session.mailOrg) : emptyMailOrgState()
}

export async function persistMailOrg(
  env: Env,
  sessionId: string,
  session: StoredSession,
  state: MailOrgState,
): Promise<void> {
  if (session.userId) {
    await saveUserMailOrg(env, session.userId, state)
  } else {
    session.mailOrg = state
    await writeSession(env, sessionId, session)
  }
}

// org를 최신 상태로 읽어와 mutator를 적용하고 곧바로 저장한다. 읽기와 쓰기 사이에 await가 없어서
// (mutator는 동기 함수) 그 사이 다른 요청이 쓴 변경을 이 요청이 덮어쓸 여지가 사실상 없다 — 20초
// 자동 폴링이나 여러 탭에서 온 요청이 겹쳐도 안전하다. mutator 안에서 org 내용(폴더/규칙 존재
// 여부 등)을 검증하면, 항상 이 시점의 최신 상태를 기준으로 검증하는 셈이라 오히려 더 정확하다.
export async function mutateMailOrg<T>(
  env: Env,
  sessionId: string,
  session: StoredSession,
  mutator: (org: MailOrgState) => T,
): Promise<T> {
  const org = await resolveMailOrg(env, session)
  const result = mutator(org)
  await persistMailOrg(env, sessionId, session, org)
  return result
}
