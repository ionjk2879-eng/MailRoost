import type { AutoClassifyRule, MailCategory, MailFolder, MailOrgState, SavedFilter } from "../types"
import { ARCHIVE_FOLDER_ID, applyOrder, assignmentKey, folderIdsOf, isArchived, toggleFolderAssignment } from "./mailOrg"
import { applyCategoryRules, matchRule } from "./rules"

export const VALID_CATEGORIES: MailCategory[] = ["primary", "social", "promotions", "updates", "forums"]

// mutateMailOrg에 전달하는 모든 MailOrgState 변경 연산. 각 연산은 이 파일의 applyMailOrgOp가
// org 하나를 읽고/고치고/반환값을 만드는 것까지 한 번에 처리한다 — 이렇게 "읽기+수정+쓰기"가
// 함수 호출 하나(결국 DO의 단일 메서드 호출 하나)로 끝나야 두 요청이 겹쳐도 레이스가 생기지 않는다
// (자세한 배경은 backend/CLAUDE.md의 "상태 저장 방식" 절 참고).
//
// crypto.randomUUID()/Date.now() 같은 건 호출부(라우트)에서 미리 만들어 op 필드로 실어보낸다 —
// op는 순수 데이터(구조적 복제 가능)여야 DO RPC 경계를 그대로 넘어갈 수 있다.
export type MailOrgOp =
  | { type: "updateSignature"; accountId: string; signature: string }
  | { type: "reorderAccounts"; order: string[] }
  | { type: "createFolder"; id: string; name: string; color: string; createdAt: number }
  | { type: "renameFolder"; folderId: string; name: string; color?: string }
  | { type: "deleteFolder"; folderId: string }
  | { type: "reorderFolders"; order: string[] }
  | { type: "createRule"; id: string; name: string; field: "from" | "subject"; keyword: string; targetFolderId: string | null; category: MailCategory | null; createdAt: number }
  | {
      type: "updateRule"
      ruleId: string
      name?: string
      field?: string
      keyword?: string
      targetFolderId?: string | null
      category?: string | null
      enabled?: boolean
    }
  | { type: "deleteRule"; ruleId: string }
  | { type: "applyRuleMatches"; targetFolderId: string; matches: { accountId: string; mailId: string }[] }
  | {
      type: "createSavedFilter"
      id: string
      name: string
      accountId: string | null
      from: string
      subject: string
      isUnread: boolean | null
      isStarred: boolean | null
      hasAttachment: boolean | null
      folderId: string | null
      createdAt: number
    }
  | { type: "deleteSavedFilter"; filterId: string }
  | { type: "moveMail"; items: { accountId: string; mailId: string }[]; folderId: string | null; fromFolderId: string | null }
  | { type: "toggleMailFolder"; accountId: string; mailId: string; folderId: string; assign: boolean }
  | {
      type: "classifyMails"
      items: { accountId: string; mailId: string; fromName: string; fromEmail: string; subject: string; category: MailCategory }[]
    }
  | { type: "clearMailKeys"; accountId: string; mailIds: string[] }
  | { type: "snoozeMail"; accountId: string; mailId: string; until: number }
  | { type: "unsnooze"; accountId: string; mailId: string }
  | { type: "pruneExpiredSnoozes"; now: number }
  | { type: "muteSender"; email: string }
  | { type: "unmuteSender"; email: string }

// applyMailOrgOp 결과 타입 모음. applyMailOrgOp 자체는 unknown을 반환하므로(각 case의 반환 타입이
// 서로 다른 큰 switch라 제네릭으로 정확히 좁히기 번거로움), 호출부(mutateMailOrg<T>(...))에서
// 아래 타입을 타입 인자로 넘겨 결과를 원래 형태로 되돌려 쓴다.
export type CreateFolderResult = { ok: true; folder: MailFolder } | { ok: false; error: string }
export type RenameFolderResult = { ok: true; folder: MailFolder } | { ok: false; status: 404 | 400; error: string }
export type CreateRuleResult = { ok: true; rule: AutoClassifyRule } | { ok: false; error: string }
export type UpdateRuleResult = { ok: true; rule: AutoClassifyRule } | { ok: false; status: 404 | 400; error: string }
export type ApplyRuleMatchesResult = { count: number; alreadyClassified: number }
export type CreateSavedFilterResult = { ok: true; filter: SavedFilter } | { ok: false; error: string }
export type MoveMailResult = { ok: true } | { ok: false; error: string }
export type ToggleMailFolderResult = { ok: true } | { ok: false; error: string }
export type ClassifyMailsResult = { archived: boolean; folderIds: string[]; category: MailCategory }[]

export function applyMailOrgOp(org: MailOrgState, op: MailOrgOp): unknown {
  switch (op.type) {
    case "updateSignature": {
      if (op.signature.trim()) org.signatures[op.accountId] = op.signature
      else delete org.signatures[op.accountId]
      return undefined
    }

    case "reorderAccounts": {
      org.accountOrder = op.order
      return undefined
    }

    case "createFolder": {
      if (org.folders.some((f) => f.name === op.name)) {
        return { ok: false as const, error: "이미 같은 이름의 분류 메일함이 있습니다." }
      }
      const folder: MailFolder = { id: op.id, name: op.name, color: op.color, createdAt: op.createdAt }
      org.folders.push(folder)
      return { ok: true as const, folder }
    }

    case "renameFolder": {
      const folder = org.folders.find((f) => f.id === op.folderId)
      if (!folder) return { ok: false as const, status: 404 as const, error: "분류 메일함을 찾을 수 없습니다." }
      if (org.folders.some((f) => f.id !== op.folderId && f.name === op.name)) {
        return { ok: false as const, status: 400 as const, error: "이미 같은 이름의 분류 메일함이 있습니다." }
      }
      folder.name = op.name
      if (op.color !== undefined) folder.color = op.color
      return { ok: true as const, folder }
    }

    case "deleteFolder": {
      org.folders = org.folders.filter((f) => f.id !== op.folderId)
      for (const key of Object.keys(org.assignments)) {
        const next = org.assignments[key].filter((id) => id !== op.folderId)
        if (next.length > 0) org.assignments[key] = next
        else delete org.assignments[key]
      }
      return undefined
    }

    case "reorderFolders": {
      org.folders = applyOrder(org.folders, op.order, (f) => f.id)
      return org.folders
    }

    case "createRule": {
      if (op.targetFolderId && op.targetFolderId !== ARCHIVE_FOLDER_ID && !org.folders.some((f) => f.id === op.targetFolderId)) {
        return { ok: false as const, error: "분류 메일함을 찾을 수 없습니다." }
      }
      const rule: AutoClassifyRule = {
        id: op.id,
        name: op.name,
        field: op.field,
        keyword: op.keyword,
        targetFolderId: op.targetFolderId,
        category: op.category,
        enabled: true,
        createdAt: op.createdAt,
      }
      org.rules.push(rule)
      return { ok: true as const, rule }
    }

    case "updateRule": {
      const rule = org.rules.find((r) => r.id === op.ruleId)
      if (!rule) return { ok: false as const, status: 404 as const, error: "규칙을 찾을 수 없습니다." }

      if (op.name !== undefined) {
        const name = op.name.trim()
        if (!name) return { ok: false as const, status: 400 as const, error: "규칙 이름을 입력해주세요." }
        rule.name = name
      }

      if (op.field !== undefined) {
        if (op.field !== "from" && op.field !== "subject") {
          return { ok: false as const, status: 400 as const, error: "잘못된 조건입니다." }
        }
        rule.field = op.field
      }
      if (op.keyword !== undefined) {
        const keyword = op.keyword.trim()
        if (!keyword) return { ok: false as const, status: 400 as const, error: "키워드를 입력해주세요." }
        rule.keyword = keyword
      }
      if (op.targetFolderId !== undefined) {
        const targetFolderId = op.targetFolderId
        if (targetFolderId && targetFolderId !== ARCHIVE_FOLDER_ID && !org.folders.some((f) => f.id === targetFolderId)) {
          return { ok: false as const, status: 404 as const, error: "분류 메일함을 찾을 수 없습니다." }
        }
        rule.targetFolderId = targetFolderId
      }
      if (op.category !== undefined) {
        const category = op.category as MailCategory | null
        if (category && !VALID_CATEGORIES.includes(category)) {
          return { ok: false as const, status: 400 as const, error: "잘못된 카테고리입니다." }
        }
        rule.category = category
      }
      if (!rule.targetFolderId && !rule.category) {
        return { ok: false as const, status: 400 as const, error: "이동할 분류 메일함이나 카테고리를 선택해주세요." }
      }
      if (op.enabled !== undefined) rule.enabled = op.enabled
      return { ok: true as const, rule }
    }

    case "deleteRule": {
      org.rules = org.rules.filter((r) => r.id !== op.ruleId)
      return undefined
    }

    case "applyRuleMatches": {
      let count = 0
      let alreadyClassified = 0
      for (const { accountId, mailId } of op.matches) {
        if (isArchived(org, accountId, mailId)) continue
        const key = assignmentKey(accountId, mailId)
        const current = org.assignments[key] ?? []
        if (current.includes(op.targetFolderId)) {
          alreadyClassified++
          continue
        }
        toggleFolderAssignment(org, accountId, mailId, op.targetFolderId, true)
        org.classified[key] = true
        count++
      }
      return { count, alreadyClassified }
    }

    case "createSavedFilter": {
      if (op.folderId && !org.folders.some((f) => f.id === op.folderId)) {
        return { ok: false as const, error: "분류 메일함을 찾을 수 없습니다." }
      }
      const filter: SavedFilter = {
        id: op.id,
        name: op.name,
        accountId: op.accountId,
        from: op.from,
        subject: op.subject,
        isUnread: op.isUnread,
        isStarred: op.isStarred,
        hasAttachment: op.hasAttachment,
        folderId: op.folderId,
        createdAt: op.createdAt,
      }
      org.savedFilters.push(filter)
      return { ok: true as const, filter }
    }

    case "deleteSavedFilter": {
      org.savedFilters = org.savedFilters.filter((f) => f.id !== op.filterId)
      return undefined
    }

    case "moveMail": {
      if (op.folderId !== null && op.folderId !== ARCHIVE_FOLDER_ID && !org.folders.some((f) => f.id === op.folderId)) {
        return { ok: false as const, error: "분류 메일함을 찾을 수 없습니다." }
      }
      for (const { accountId, mailId } of op.items) {
        const key = assignmentKey(accountId, mailId)
        if (op.folderId === ARCHIVE_FOLDER_ID) {
          org.archived[key] = true
        } else if (op.folderId !== null) {
          toggleFolderAssignment(org, accountId, mailId, op.folderId, true)
        } else if (op.fromFolderId === ARCHIVE_FOLDER_ID) {
          delete org.archived[key]
        } else if (op.fromFolderId) {
          toggleFolderAssignment(org, accountId, mailId, op.fromFolderId, false)
        } else {
          delete org.archived[key]
          delete org.assignments[key]
        }
      }
      return { ok: true as const }
    }

    case "toggleMailFolder": {
      if (!org.folders.some((f) => f.id === op.folderId)) return { ok: false as const, error: "분류 메일함을 찾을 수 없습니다." }
      toggleFolderAssignment(org, op.accountId, op.mailId, op.folderId, op.assign)
      return { ok: true as const }
    }

    case "classifyMails": {
      const results: ClassifyMailsResult = op.items.map((item) => {
        const key = assignmentKey(item.accountId, item.mailId)
        if (!Object.prototype.hasOwnProperty.call(org.classified, key)) {
          for (const rule of org.rules) {
            if (!rule.enabled || !rule.targetFolderId) continue
            if (matchRule(rule, item)) {
              if (rule.targetFolderId === ARCHIVE_FOLDER_ID) {
                org.archived[key] = true
              } else {
                toggleFolderAssignment(org, item.accountId, item.mailId, rule.targetFolderId, true)
              }
              break
            }
          }
          org.classified[key] = true
        }
        return {
          archived: isArchived(org, item.accountId, item.mailId),
          folderIds: folderIdsOf(org, item.accountId, item.mailId),
          category: applyCategoryRules(org.rules, item),
        }
      })
      return results
    }

    case "clearMailKeys": {
      for (const mailId of op.mailIds) {
        const key = assignmentKey(op.accountId, mailId)
        delete org.assignments[key]
        delete org.archived[key]
        delete org.snoozed[key]
        delete org.classified[key]
      }
      return undefined
    }

    case "snoozeMail": {
      org.snoozed = org.snoozed ?? {}
      org.snoozed[assignmentKey(op.accountId, op.mailId)] = op.until
      return undefined
    }

    case "unsnooze": {
      org.snoozed = org.snoozed ?? {}
      delete org.snoozed[assignmentKey(op.accountId, op.mailId)]
      return undefined
    }

    case "pruneExpiredSnoozes": {
      const next: Record<string, number> = {}
      for (const [k, until] of Object.entries(org.snoozed ?? {})) {
        if (until > op.now) next[k] = until
      }
      org.snoozed = next
      return next
    }

    case "muteSender": {
      if (!(org.muted ?? []).includes(op.email)) org.muted = [...(org.muted ?? []), op.email]
      return undefined
    }

    case "unmuteSender": {
      org.muted = (org.muted ?? []).filter((e) => e !== op.email)
      return undefined
    }
  }
}
