import type { Env, MailOrgState, StoredSession } from "../types"
import { applyMailOrgOp, type MailOrgOp } from "./mailOrgOps"
import { getMailOrgStub } from "./mailOrgStore"
import { writeSession } from "./session"

// 보관함은 사용자 정의 분류와 동일한 배정 메커니즘을 쓰는 예약된 가상 폴더 ID.
// org.folders 목록에는 들어가지 않으므로 이름변경/삭제 대상이 되지 않는다.
export const ARCHIVE_FOLDER_ID = "archive"

// accountId와 mailId 사이에 구분자 없이 그냥 이어붙인다. 이미 저장된 모든 사용자 데이터가 이
// 형식이라(assignmentKey 결과를 org.assignments/archived/snoozed/classified의 키로 그대로 써왔다),
// 여기에 구분자를 새로 넣으면 폴더 배정/보관/스누즈/분류 표시 함수들(folderIdsOf, isArchived,
// toggleFolderAssignment 등 — 전부 parseAssignmentKey가 아니라 assignmentKey를 다시 계산해서
// org 맵에 직접 인덱싱한다)이 배포 즉시 기존에 저장된 모든 키를 못 찾게 된다 — 마이그레이션 없이는
// 절대 바꿀 수 없다. 대신 되돌릴 때(parseAssignmentKey)는 지금 연결된 계정 id 목록과 접두사
// 대조로 나눈다. (한 계정 id가 다른 계정 id의 완전한 prefix인 경우 오판 가능성이 이론적으로
// 남지만, 마이그레이션이 필요한 키 형식 변경보다 위험이 훨씬 작다고 판단해 감수하기로 했다 —
// docs/incidents/2026-08-13-folder-and-snooze-lookup-broken.md 참고.)
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

// 레거시 KV blob(user:mailorg:<userId>) 읽기 전용 — MailOrgStore DO의 지연 마이그레이션이
// storage에 아직 아무것도 없을 때 이걸로 한 번 읽어온다. 로그인 사용자의 상태를 KV에 다시 쓰는
// saveUserMailOrg 짝은 일부러 없앴다 — 남겨두면 누군가 다시 불러서 "읽기 → 수정 → 통째로 쓰기"
// 레이스를 되살릴 수 있다 (durable/MailOrgStore.ts, backend/CLAUDE.md 참고).
export async function getUserMailOrg(env: Env, userId: string): Promise<MailOrgState> {
  const raw = await env.TOKENS.get(`user:mailorg:${userId}`)
  if (!raw) return emptyMailOrgState()
  return normalizeMailOrgState(JSON.parse(raw) as Partial<MailOrgState>)
}

// 로그인한 사용자는 MailOrgStore Durable Object(계정당 인스턴스 하나)가 상태를 직접 들고 있고,
// 게스트(userId 없음)는 지금까지처럼 세션 blob(session.mailOrg)에 들어있다. DO 쪽은 getState 호출
// 시점에 아직 DO storage에 아무것도 없으면 레거시 KV blob(user:mailorg:<userId>)을 한 번 읽어와
// 그대로 DO storage에 옮겨 담는 지연 마이그레이션을 한다 (durable/MailOrgStore.ts 참고).
export async function resolveMailOrg(env: Env, session: StoredSession): Promise<MailOrgState> {
  if (session.userId) return getMailOrgStub(env, session.userId).getState(session.userId)
  return session.mailOrg ? normalizeMailOrgState(session.mailOrg) : emptyMailOrgState()
}

// 게스트 세션 전용 — 로그인한 사용자는 DO가 자기 storage에 직접 쓰므로 이 함수를 거치지 않는다
// (mutateMailOrg의 로그인 경로는 DO의 applyOp 호출 하나로 끝난다). 로그인 사용자의 상태를
// 여기서 다시 통째로 KV에 쓰는 경로를 남겨두면, 이 마이그레이션이 없애려던 바로 그 레이스
// 패턴("읽기 → 메모리에서 수정 → 통째로 쓰기")을 다시 열어주는 셈이라 일부러 없앴다.
export async function persistMailOrg(
  env: Env,
  sessionId: string,
  session: StoredSession,
  state: MailOrgState,
): Promise<void> {
  session.mailOrg = state
  await writeSession(env, sessionId, session)
}

// org에 op 하나를 적용하고 곧바로 저장한다.
// - 게스트 경로: 지금까지와 동일하게 이 함수 안에서 읽기 → applyMailOrgOp로 수정 → 쓰기를 한 번에
//   한다 (읽기와 쓰기 사이에 await가 없어 그 사이 다른 요청이 끼어들 여지가 없다).
// - 로그인 경로: MailOrgStore DO의 applyOp RPC 호출 하나로 위임한다. 읽기+수정+쓰기 전체가 그
//   DO 메서드 호출 "안에서" 일어나므로(Cloudflare가 같은 DO 인스턴스에 대한 동시 호출을 직렬화),
//   Worker가 두 번의 왕복(읽기 RPC, 쓰기 RPC)으로 나눠 부르는 게 아니어서 두 요청이 겹쳐도
//   레이스가 생기지 않는다 — 이게 바로 이 마이그레이션의 핵심이다.
export async function mutateMailOrg<T = unknown>(
  env: Env,
  sessionId: string,
  session: StoredSession,
  op: MailOrgOp,
): Promise<T> {
  if (session.userId) {
    return getMailOrgStub(env, session.userId).applyOp(session.userId, op) as Promise<T>
  }
  const org = await resolveMailOrg(env, session)
  const result = applyMailOrgOp(org, op)
  await persistMailOrg(env, sessionId, session, org)
  return result as T
}
