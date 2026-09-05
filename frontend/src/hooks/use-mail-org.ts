import { useMemo, useState } from "react"
import {
  applyRuleToExisting as apiApplyRuleToExisting,
  createContact,
  createFolder as apiCreateFolder,
  createMemo,
  type MemoPatch,
  createQuickReply,
  createRule as apiCreateRule,
  type RuleConditions,
  createSavedFilter as apiCreateSavedFilter,
  deleteContact,
  deleteDraft,
  deleteFolder as apiDeleteFolder,
  deleteMemo,
  deleteQuickReply,
  deleteRule as apiDeleteRule,
  deleteSavedFilter as apiDeleteSavedFilter,
  dismissNotification,
  fetchContacts,
  fetchDrafts,
  fetchFolders,
  fetchMemos,
  fetchMuted,
  fetchNotifications,
  fetchQuickReplies,
  fetchRules,
  fetchSavedFilters,
  fetchSnoozed,
  markAllNotificationsRead,
  markNotificationRead,
  muteSender,
  renameFolder as apiRenameFolder,
  reorderFolders as apiReorderFolders,
  snoozeKey,
  snoozeMail,
  unmuteSender,
  unsnoozeMail,
  updateContact,
  updateMemo,
  updateQuickReply,
  updateRule as apiUpdateRule,
} from "@/lib/api"
import type { AppNotification, AutoClassifyRule, Contact, Draft, MailCategory, MailFolder, MemoItem, MemoLinkedMail, QuickReply, SavedFilter } from "@/types/mail"

interface UseMailOrgParams {
  currentUser: { id: string; email: string } | null
  showError: (message: string) => void
  // 규칙을 기존 메일에 소급 적용하거나 분류 메일함을 삭제한 뒤에는 메일 목록을 다시 불러와야 한다.
  // 그 갱신 함수 자체는 useMailWorkspace가 소유하므로 여기서는 주입받는다 (하나의 훅이 다른 훅을
  // 직접 호출하지 않고, App.tsx가 두 훅을 연결해주는 구조).
  refreshMails: () => Promise<void> | void
  refreshFolderMails: (folderId: string) => Promise<void> | void
  // "기존 메일에 적용"이 지금 보고 있는 분류 메일함에 영향을 주는지 판단하려면 필요하다.
  selectedFolderId: string | null
}

// 분류 메일함/자동분류 규칙/저장된 필터/스누즈/뮤트/메모/빠른 답장/알림/임시보관함 목록을
// 소유하는 훅. 메일 목록 자체(useMailWorkspace)를 갱신해야 하는 핸들러는 위에서 주입받은
// refreshMails/refreshFolderMails를 호출한다.
export function useMailOrg({ showError, refreshMails, refreshFolderMails, selectedFolderId }: UseMailOrgParams) {
  const [folders, setFolders] = useState<MailFolder[]>([])
  const [rules, setRules] = useState<AutoClassifyRule[]>([])
  const [snoozed, setSnoozed] = useState<Record<string, number>>({})
  const [muted, setMuted] = useState<string[]>([])
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([])
  const [activeFilter, setActiveFilter] = useState<SavedFilter | null>(null)
  const [memos, setMemos] = useState<MemoItem[]>([])
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [drafts, setDrafts] = useState<Draft[]>([])

  const mutedSet = useMemo(() => new Set(muted), [muted])

  const loadInitialData = () => Promise.all([
    fetchFolders().then(setFolders),
    fetchRules().then(setRules),
    fetchMemos().then(setMemos),
    fetchQuickReplies().then(setQuickReplies),
    fetchContacts().then(setContacts),
    fetchNotifications().then(setNotifications),
    fetchDrafts().then(setDrafts),
    fetchSnoozed().then(setSnoozed),
    fetchMuted().then(setMuted),
    fetchSavedFilters().then(setSavedFilters),
  ])

  // 분류 메일함 CRUD
  const handleCreateFolder = async (name: string): Promise<{ ok: boolean; error?: string }> => {
    const result = await apiCreateFolder(name)
    if (!result.ok) return { ok: false, error: result.error }
    setFolders((prev) => [...prev, result.folder])
    return { ok: true }
  }

  const handleDeleteFolder = async (folderId: string) => {
    setFolders((prev) => prev.filter((f) => f.id !== folderId))
    await apiDeleteFolder(folderId)
    // 삭제된 분류에 있던 메일은 서버에서 배정이 풀려 받은편지함으로 돌아간다
    refreshMails()
  }

  const handleRenameFolder = async (folderId: string, name: string, color: string): Promise<{ ok: boolean; error?: string }> => {
    const result = await apiRenameFolder(folderId, name, color)
    if (!result.ok) return { ok: false, error: result.error }
    setFolders((prev) => prev.map((f) => (f.id === folderId ? result.folder : f)))
    return { ok: true }
  }

  const handleReorderFolders = async (order: string[]) => {
    const previous = folders
    const byId = new Map(folders.map((f) => [f.id, f]))
    setFolders(order.map((id) => byId.get(id)).filter((f): f is MailFolder => !!f))
    const result = await apiReorderFolders(order)
    if (!result.ok) {
      setFolders(previous)
      showError(result.error ?? "분류 메일함 순서 변경에 실패했습니다.")
    }
  }

  // "기존 메일에 적용": 규칙은 원래 새로 도착하는 메일에만 적용되므로, 이미 받은 메일까지 옮기고
  // 싶으면 계정 서버(Gmail 검색 / IMAP SEARCH)에서 직접 찾아서 배정한다 — 화면에 로드돼 있는 메일만
  // 훑으면 아직 안 불러온 오래된 메일은 찾지 못하기 때문.
  const applyRuleToExistingAndRefresh = async (
    ruleId: string,
    targetFolderId: string,
  ): Promise<{ ok: boolean; error?: string; count?: number; alreadyClassified?: number }> => {
    const result = await apiApplyRuleToExisting(ruleId)
    if (!result.ok) return { ok: false, error: result.error }
    if (result.count > 0) {
      await refreshMails()
      if (selectedFolderId === targetFolderId) await refreshFolderMails(targetFolderId)
    }
    return { ok: true, count: result.count, alreadyClassified: result.alreadyClassified }
  }

  const handleApplyRuleToExisting = async (
    ruleId: string,
  ): Promise<{ ok: boolean; error?: string; count?: number; alreadyClassified?: number }> => {
    const rule = rules.find((r) => r.id === ruleId)
    if (!rule?.targetFolderId) return { ok: false, error: "규칙을 찾을 수 없습니다." }
    return applyRuleToExistingAndRefresh(ruleId, rule.targetFolderId)
  }

  const handleCreateRule = async (
    conditions: RuleConditions,
    targetFolderId: string | null,
    category: MailCategory | null,
    applyToExisting?: boolean,
    name?: string,
  ): Promise<{ ok: boolean; error?: string; count?: number }> => {
    const result = await apiCreateRule(conditions, targetFolderId, category, name)
    if (!result.ok) return { ok: false, error: result.error }
    setRules((prev) => [...prev, result.rule])
    if (applyToExisting && targetFolderId) {
      const applyResult = await applyRuleToExistingAndRefresh(result.rule.id, targetFolderId)
      return { ok: true, count: applyResult.count }
    }
    return { ok: true }
  }

  const handleUpdateRule = async (
    ruleId: string,
    patch: Partial<Omit<AutoClassifyRule, "id" | "createdAt">>,
  ): Promise<{ ok: boolean; error?: string }> => {
    const result = await apiUpdateRule(ruleId, patch)
    if (!result.ok) return result
    setRules((prev) => prev.map((rule) => rule.id === ruleId ? result.rule : rule))
    return { ok: true }
  }

  const handleToggleRule = async (ruleId: string, enabled: boolean) => {
    setRules((prev) => prev.map((r) => (r.id === ruleId ? { ...r, enabled } : r)))
    const result = await apiUpdateRule(ruleId, { enabled })
    if (!result.ok) {
      setRules((prev) => prev.map((r) => (r.id === ruleId ? { ...r, enabled: !enabled } : r)))
      showError(result.error ?? "규칙 수정에 실패했습니다.")
    }
  }

  const handleDeleteRule = async (ruleId: string) => {
    const removed = rules.find((r) => r.id === ruleId)
    setRules((prev) => prev.filter((r) => r.id !== ruleId))
    const result = await apiDeleteRule(ruleId)
    if (!result.ok) {
      if (removed) setRules((prev) => [...prev, removed])
      showError(result.error ?? "규칙 삭제에 실패했습니다.")
    }
  }

  // 저장된 필터
  const handleCreateFilter = async (input: Omit<SavedFilter, "id" | "createdAt">) => {
    const result = await apiCreateSavedFilter(input)
    if (!result.ok) return result
    setSavedFilters((prev) => [...prev, result.filter])
    return { ok: true }
  }

  const handleDeleteFilter = async (filterId: string) => {
    setSavedFilters((prev) => prev.filter((f) => f.id !== filterId))
    setActiveFilter((prev) => (prev?.id === filterId ? null : prev))
    await apiDeleteSavedFilter(filterId)
  }

  // 스누즈/뮤트
  const handleMuteSender = async (fromEmail: string) => {
    if (mutedSet.has(fromEmail)) {
      setMuted((prev) => prev.filter((e) => e !== fromEmail))
      await unmuteSender(fromEmail)
    } else {
      setMuted((prev) => [...prev, fromEmail])
      await muteSender(fromEmail)
    }
  }

  const handleUnsnooze = async (mailId: string, accountId: string) => {
    const key = snoozeKey(accountId, mailId)
    setSnoozed((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    await unsnoozeMail(accountId, mailId)
  }

  // App.tsx가 스누즈 직후 자기 자신(선택된 메일)을 닫아야 하므로 콜백을 받는다 — mail-org 훅은
  // 어떤 메일이 "선택되어 있는지"를 모르므로(그건 useMailWorkspace 소관) 직접 손댈 수 없다.
  const handleSnooze = async (mailId: string, accountId: string, until: number, onSnoozed?: () => void) => {
    setSnoozed((prev) => ({ ...prev, [snoozeKey(accountId, mailId)]: until }))
    onSnoozed?.()
    await snoozeMail(accountId, mailId, until)
  }

  // 메모
  const handleCreateMemo = async (init?: { title?: string; linkedMail?: MemoLinkedMail }): Promise<string | null> => {
    const result = await createMemo("", init)
    if (!result.ok) {
      showError(result.error ?? "메모 생성에 실패했습니다.")
      return null
    }
    setMemos((prev) => [result.memo, ...prev])
    return result.memo.id
  }

  const handleUpdateMemo = (id: string, patch: MemoPatch) => {
    const now = Date.now()
    setMemos((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m
        const next: MemoItem = { ...m, updatedAt: now }
        if (patch.content !== undefined) next.content = patch.content
        if (patch.title !== undefined) next.title = patch.title
        if (patch.color !== undefined) next.color = patch.color ?? undefined
        if (patch.pinned !== undefined) next.pinned = patch.pinned
        if ("linkedMail" in patch) next.linkedMail = patch.linkedMail ?? undefined
        return next
      }),
    )
    updateMemo(id, patch)
  }

  const handleDeleteMemo = async (id: string) => {
    const removed = memos.find((m) => m.id === id)
    setMemos((prev) => prev.filter((m) => m.id !== id))
    const result = await deleteMemo(id)
    if (!result.ok) {
      if (removed) setMemos((prev) => [removed, ...prev])
      showError(result.error ?? "메모 삭제에 실패했습니다.")
    }
  }

  // 빠른 답장
  const handleCreateQuickReply = async (title: string, body: string): Promise<{ ok: boolean; error?: string }> => {
    const result = await createQuickReply(title, body)
    if (!result.ok) return { ok: false, error: result.error }
    setQuickReplies((prev) => [result.quickReply, ...prev])
    return { ok: true }
  }

  const handleUpdateQuickReply = async (
    id: string,
    title: string,
    body: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    const result = await updateQuickReply(id, { title, body })
    if (!result.ok) return { ok: false, error: result.error }
    setQuickReplies((prev) => prev.map((q) => (q.id === id ? result.quickReply : q)))
    return { ok: true }
  }

  const handleDeleteQuickReply = async (id: string) => {
    const removed = quickReplies.find((q) => q.id === id)
    setQuickReplies((prev) => prev.filter((q) => q.id !== id))
    const result = await deleteQuickReply(id)
    if (!result.ok) {
      if (removed) setQuickReplies((prev) => [removed, ...prev])
      showError(result.error ?? "빠른 답장 삭제에 실패했습니다.")
    }
  }

  // 주소록
  const handleCreateContact = async (name: string, email: string): Promise<{ ok: boolean; error?: string }> => {
    const result = await createContact(name, email)
    if (!result.ok) return { ok: false, error: result.error }
    setContacts((prev) => [result.contact, ...prev])
    return { ok: true }
  }

  const handleUpdateContact = async (
    id: string,
    name: string,
    email: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    const result = await updateContact(id, { name, email })
    if (!result.ok) return { ok: false, error: result.error }
    setContacts((prev) => prev.map((c) => (c.id === id ? result.contact : c)))
    return { ok: true }
  }

  const handleDeleteContact = async (id: string) => {
    const removed = contacts.find((c) => c.id === id)
    setContacts((prev) => prev.filter((c) => c.id !== id))
    const ok = await deleteContact(id)
    if (!ok) {
      if (removed) setContacts((prev) => [removed, ...prev])
      showError("주소록 삭제에 실패했습니다.")
    }
  }

  // 알림 — 예약발송 재시도/실패 알림은 cron이 백그라운드에서 쌓으므로 App.tsx가 1분마다 이 함수를
  // 폴링해서 반영한다.
  const refreshNotifications = () => fetchNotifications().then(setNotifications)

  const handleMarkNotificationRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    markNotificationRead(id)
  }

  const handleMarkAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    markAllNotificationsRead()
  }

  const handleDismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    dismissNotification(id)
  }

  // 임시보관함 목록 관리 (작성 UI 자체는 App.tsx의 composeState 소관)
  const handleDraftSaved = (draft: Draft) => {
    setDrafts((prev) => (prev.some((d) => d.id === draft.id) ? prev.map((d) => (d.id === draft.id ? draft : d)) : [draft, ...prev]))
  }

  const handleDraftDeleted = (id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id))
  }

  const handleDeleteDraft = (id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id))
    deleteDraft(id)
  }

  // App.tsx의 handleLogout이 호출한다. 원래 handleLogout이 손대지 않던 savedFilters/activeFilter는
  // 여기서도 그대로 초기화하지 않는다 (기존 동작 그대로 유지).
  const reset = () => {
    setFolders([])
    setRules([])
    setMemos([])
    setQuickReplies([])
    setNotifications([])
    setDrafts([])
    setSnoozed({})
    setMuted([])
  }

  return {
    // 상태
    folders,
    rules,
    snoozed,
    muted,
    mutedSet,
    savedFilters,
    activeFilter,
    memos,
    quickReplies,
    contacts,
    notifications,
    drafts,

    // 세터
    setActiveFilter,

    // 핸들러/함수
    loadInitialData,
    refreshNotifications,
    handleCreateFolder,
    handleDeleteFolder,
    handleRenameFolder,
    handleReorderFolders,
    handleApplyRuleToExisting,
    handleCreateRule,
    handleUpdateRule,
    handleToggleRule,
    handleDeleteRule,
    handleCreateFilter,
    handleDeleteFilter,
    handleMuteSender,
    handleUnsnooze,
    handleSnooze,
    handleCreateMemo,
    handleUpdateMemo,
    handleDeleteMemo,
    handleCreateQuickReply,
    handleUpdateQuickReply,
    handleDeleteQuickReply,
    handleCreateContact,
    handleUpdateContact,
    handleDeleteContact,
    handleMarkNotificationRead,
    handleMarkAllNotificationsRead,
    handleDismissNotification,
    handleDraftSaved,
    handleDraftDeleted,
    handleDeleteDraft,
    reset,
  }
}

export type MailOrg = ReturnType<typeof useMailOrg>
