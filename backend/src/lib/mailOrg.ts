import type { Env, MailOrgState } from "../types"

// accountId 자체에 콜론이 포함될 수 있어(예: imap:host:email) 구분자로 콜론 대신
// 계정 ID/메일 ID에 나타나지 않는 제어문자를 사용한다.
const KEY_DELIMITER = ""

// 보관함은 사용자 정의 분류와 동일한 배정 메커니즘을 쓰는 예약된 가상 폴더 ID.
// org.folders 목록에는 들어가지 않으므로 이름변경/삭제 대상이 되지 않는다.
export const ARCHIVE_FOLDER_ID = "archive"

export function assignmentKey(accountId: string, mailId: string): string {
  return `${accountId}${KEY_DELIMITER}${mailId}`
}

export function parseAssignmentKey(key: string): { accountId: string; mailId: string } | null {
  const idx = key.indexOf(KEY_DELIMITER)
  if (idx === -1) return null
  return { accountId: key.slice(0, idx), mailId: key.slice(idx + 1) }
}

export function emptyMailOrgState(): MailOrgState {
  return { folders: [], assignments: {}, archived: {}, rules: [], classified: {}, accountOrder: [], signatures: {}, snoozed: {}, muted: [] }
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
