import { Loader2, Pencil, RefreshCw, Search, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { AccountSidebar } from "@/components/mail/account-sidebar"
import { CategoryTabs } from "@/components/mail/category-tabs"
import { COMPOSE_SUPPORTED, ComposeView } from "@/components/mail/compose-view"
import { MailDetail } from "@/components/mail/mail-detail"
import { MailList } from "@/components/mail/mail-list"
import { CleanupView } from "@/components/cleanup/cleanup-view"
import { TrashView } from "@/components/trash/trash-view"
import { MemoView } from "@/components/memo/memo-view"
import { Button } from "@/components/ui/button"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { HomeView } from "@/components/home/home-view"
import { LandingView } from "@/components/home/landing-view"
import {
  bulkDeleteMails,
  bulkMarkRead,
  createFolder as apiCreateFolder,
  createMemo,
  createRule as apiCreateRule,
  deleteFolder as apiDeleteFolder,
  deleteMemo,
  deleteRule as apiDeleteRule,
  emptyAllTrash,
  emptyTrash,
  fetchAccounts,
  fetchCurrentUser,
  fetchFolderMails,
  fetchFolders,
  fetchMailDetail,
  fetchMails,
  fetchMemos,
  fetchRules,
  fetchTrashMails,
  logout,
  markAsRead,
  markAsUnread,
  moveMails,
  permanentDeleteFromTrash,
  renameFolder as apiRenameFolder,
  reorderAccounts as apiReorderAccounts,
  reorderFolders as apiReorderFolders,
  restoreFromTrash,
  toggleStar,
  updateMemo,
  updateRule as apiUpdateRule,
} from "@/lib/api"
import { ARCHIVE_FOLDER_ID } from "@/types/mail"
import type { Account, AutoClassifyRule, Mail, MailCategory, MailFolder, MemoItem } from "@/types/mail"

function isRealAccountId(accountId: string): boolean {
  return accountId.includes(":")
}

function groupIdsByAccount(mails: Mail[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const mail of mails) {
    const ids = map.get(mail.accountId)
    if (ids) ids.push(mail.id)
    else map.set(mail.accountId, [mail.id])
  }
  return map
}

function App() {
  const isMobile = useIsMobile()
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string } | null>(null)
  const [view, setView] = useState<"home" | "inbox" | "cleanup" | "trash" | "folder" | "archive" | "memo">("home")
  const [trashMails, setTrashMails] = useState<Mail[]>([])
  const [trashCursor, setTrashCursor] = useState<string | null>(null)
  const [isTrashLoading, setIsTrashLoading] = useState(false)
  const [isTrashLoadingMore, setIsTrashLoadingMore] = useState(false)
  const [folders, setFolders] = useState<MailFolder[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [folderMails, setFolderMails] = useState<Mail[]>([])
  const [isFolderLoading, setIsFolderLoading] = useState(false)
  const [rules, setRules] = useState<AutoClassifyRule[]>([])
  const [memos, setMemos] = useState<MemoItem[]>([])
  const [composeState, setComposeState] = useState<{ accountId?: string; to?: string; subject?: string } | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<MailCategory | null>(null)
  const [selectedMailId, setSelectedMailId] = useState<string | null>(null)
  const [realAccounts, setRealAccounts] = useState<Account[]>([])
  const [realMails, setRealMails] = useState<Mail[]>([])
  const [mailDetails, setMailDetails] = useState<Record<string, Mail>>({})
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [checkedMailIds, setCheckedMailIds] = useState<Set<string>>(new Set())
  const [isBulkLoading, setIsBulkLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [failedAccountIds, setFailedAccountIds] = useState<string[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)

  // 삭제 요청이 아직 서버에 반영되지 않은 사이 폴링이 되살리는 것을 막기 위한 tombstone
  const deletedKeysRef = useRef<Set<string>>(new Set())

  const showError = (message: string) => {
    setErrorMessage(message)
    window.setTimeout(() => setErrorMessage((prev) => (prev === message ? null : prev)), 5000)
  }

  const filterOutDeleted = (mails: Mail[]) =>
    mails.filter((m) => !deletedKeysRef.current.has(`${m.accountId}:${m.id}`))

  const loadAccountsAndMails = () => {
    // 계정 목록과 메일 목록을 동시에 요청 (순차 요청 시 왕복 지연이 두 배로 누적됨)
    return Promise.all([fetchAccounts(), fetchMails()]).then(([accounts, { mails, nextCursor: cursor, failedAccountIds: failed }]) => {
      setRealAccounts(accounts)
      setFailedAccountIds(failed ?? [])
      const failedSet = new Set(failed ?? [])
      setRealMails((prev) => {
        const freshMails = filterOutDeleted(mails)
        if (failedSet.size === 0) return freshMails
        // 실패한 계정의 기존 메일은 그대로 유지하고 성공한 계정 메일만 교체
        const kept = prev.filter((m) => failedSet.has(m.accountId))
        const freshIds = new Set(freshMails.map((m) => `${m.accountId}:${m.id}`))
        return [...freshMails, ...kept.filter((m) => !freshIds.has(`${m.accountId}:${m.id}`))]
      })
      setNextCursor(cursor)
    })
  }

  useEffect(() => {
    fetchCurrentUser()
      .then((user) => {
        setCurrentUser(user)
        if (user) {
          return Promise.all([
            loadAccountsAndMails(),
            fetchFolders().then(setFolders),
            fetchRules().then(setRules),
            fetchMemos().then(setMemos),
          ])
        }
      })
      .finally(() => setIsBootstrapping(false))
  }, [])

  // 탭이 보일 때만 20초마다 자동 새로고침
  useEffect(() => {
    if (!currentUser) return
    const poll = () => { if (!document.hidden) loadAccountsAndMails() }
    const interval = setInterval(poll, 20_000)
    document.addEventListener("visibilitychange", poll)
    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", poll)
    }
  }, [currentUser])

  const accounts = realAccounts
  const allMails = realMails
  const sendableAccounts = accounts.filter((a) => COMPOSE_SUPPORTED.includes(a.provider))

  const unreadCountByAccount = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const mail of allMails) {
      if (!mail.isRead) {
        counts[mail.accountId] = (counts[mail.accountId] ?? 0) + 1
      }
    }
    return counts
  }, [allMails])

  const accountMails = useMemo(() => {
    return selectedAccountId
      ? allMails.filter((mail) => mail.accountId === selectedAccountId)
      : allMails
  }, [allMails, selectedAccountId])

  const categoryCounts = useMemo(() => {
    const counts: Record<MailCategory, number> = {
      primary: 0, social: 0, promotions: 0, updates: 0, forums: 0,
    }
    for (const mail of accountMails) {
      counts[mail.category] += 1
    }
    return counts
  }, [accountMails])

  const visibleMails = useMemo(() => {
    let mails = selectedCategory
      ? accountMails.filter((mail) => mail.category === selectedCategory)
      : accountMails

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      mails = mails.filter(
        (m) =>
          m.fromName.toLowerCase().includes(q) ||
          m.fromEmail.toLowerCase().includes(q) ||
          m.subject.toLowerCase().includes(q) ||
          m.snippet.toLowerCase().includes(q),
      )
    }

    return [...mails].sort(
      (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
    )
  }, [accountMails, selectedCategory, searchQuery])

  const selectedMailStub =
    visibleMails.find((mail) => mail.id === selectedMailId)
    ?? folderMails.find((mail) => mail.id === selectedMailId)
    ?? null

  useEffect(() => {
    if (!selectedMailStub || !isRealAccountId(selectedMailStub.accountId)) return
    if (mailDetails[selectedMailStub.id]) return
    fetchMailDetail(selectedMailStub.id, selectedMailStub.accountId).then((detail) => {
      if (detail) setMailDetails((prev) => ({ ...prev, [detail.id]: detail }))
    })
  }, [selectedMailStub, mailDetails])

  const isLoadingDetail =
    selectedMailStub !== null &&
    isRealAccountId(selectedMailStub.accountId) &&
    !mailDetails[selectedMailStub.id]

  const selectedMail = selectedMailStub
    ? (mailDetails[selectedMailStub.id] ?? selectedMailStub)
    : null

  const handleSelectMail = (mailId: string | null) => {
    setComposeState(null)
    setSelectedMailId(mailId)
    if (!mailId) return
    const mail = allMails.find((m) => m.id === mailId) ?? folderMails.find((m) => m.id === mailId)
    if (mail && !mail.isRead) {
      setRealMails((prev) => prev.map((m) => (m.id === mailId ? { ...m, isRead: true } : m)))
      setFolderMails((prev) => prev.map((m) => (m.id === mailId ? { ...m, isRead: true } : m)))
      markAsRead(mailId, mail.accountId)
    }
  }

  const handleToggleStar = (mailId: string, accountId: string, starred: boolean) => {
    setRealMails((prev) =>
      prev.map((m) => (m.id === mailId && m.accountId === accountId ? { ...m, isStarred: starred } : m)),
    )
    setFolderMails((prev) =>
      prev.map((m) => (m.id === mailId && m.accountId === accountId ? { ...m, isStarred: starred } : m)),
    )
    setMailDetails((prev) => {
      const detail = prev[mailId]
      if (!detail) return prev
      return { ...prev, [mailId]: { ...detail, isStarred: starred } }
    })
    toggleStar(mailId, accountId, starred)
  }

  const handleToggleCheck = (mailId: string) => {
    setCheckedMailIds((prev) => {
      const next = new Set(prev)
      if (next.has(mailId)) next.delete(mailId)
      else next.add(mailId)
      return next
    })
  }

  // Shift-클릭 범위선택: 범위 안의 메일을 기존 선택에 더한다 (제거는 하지 않음)
  const handleCheckRange = (mailIds: string[]) => {
    setCheckedMailIds((prev) => {
      const next = new Set(prev)
      for (const id of mailIds) next.add(id)
      return next
    })
  }

  const selectByFilter = (mails: Mail[], filter: "all" | "none" | "read" | "unread" | "starred" | "unstarred") => {
    switch (filter) {
      case "all": setCheckedMailIds(new Set(mails.map((m) => m.id))); break
      case "none": setCheckedMailIds(new Set()); break
      case "read": setCheckedMailIds(new Set(mails.filter((m) => m.isRead).map((m) => m.id))); break
      case "unread": setCheckedMailIds(new Set(mails.filter((m) => !m.isRead).map((m) => m.id))); break
      case "starred": setCheckedMailIds(new Set(mails.filter((m) => m.isStarred).map((m) => m.id))); break
      case "unstarred": setCheckedMailIds(new Set(mails.filter((m) => !m.isStarred).map((m) => m.id))); break
    }
  }

  const handleSelectByFilter = (filter: "all" | "none" | "read" | "unread" | "starred" | "unstarred") =>
    selectByFilter(visibleMails, filter)

  const handleSelectByFilterInFolder = (filter: "all" | "none" | "read" | "unread" | "starred" | "unstarred") =>
    selectByFilter(folderMails, filter)

  const bulkMarkReadGeneric = async (
    mails: Mail[],
    setList: (updater: (prev: Mail[]) => Mail[]) => void,
    read: boolean,
  ) => {
    const targets = mails.filter((m) => checkedMailIds.has(m.id) && m.isRead !== read)
    setList((prev) => prev.map((m) => (checkedMailIds.has(m.id) ? { ...m, isRead: read } : m)))
    setCheckedMailIds(new Set())
    if (targets.length > 0) {
      setIsBulkLoading(true)
      const groups = groupIdsByAccount(targets)
      await Promise.all([...groups.entries()].map(([accountId, ids]) => bulkMarkRead(accountId, ids, read)))
      setIsBulkLoading(false)
    }
  }

  const handleBulkMarkRead = () => bulkMarkReadGeneric(visibleMails, setRealMails, true)
  const handleBulkMarkUnread = () => bulkMarkReadGeneric(visibleMails, setRealMails, false)
  const handleBulkMarkReadInFolder = () => bulkMarkReadGeneric(folderMails, setFolderMails, true)
  const handleBulkMarkUnreadInFolder = () => bulkMarkReadGeneric(folderMails, setFolderMails, false)

  // 낙관적으로 즉시 제거하되, 실패한 계정 몫은 되돌리고 에러를 표시한다.
  // 삭제 확정 전까지는 tombstone에 등록해 폴링이 되살리지 못하게 막는다.
  const deleteMailsWithRevert = async (targets: Mail[], origin: "inbox" | "folder" = "inbox") => {
    if (targets.length === 0) return
    for (const m of targets) deletedKeysRef.current.add(`${m.accountId}:${m.id}`)

    const setList = origin === "folder" ? setFolderMails : setRealMails
    const deletedIds = new Set(targets.map((m) => m.id))
    setList((prev) => prev.filter((m) => !deletedIds.has(m.id)))
    setMailDetails((prev) => {
      const next = { ...prev }
      for (const id of deletedIds) delete next[id]
      return next
    })
    if (selectedMailId && deletedIds.has(selectedMailId)) setSelectedMailId(null)

    const groups = groupIdsByAccount(targets)
    const outcomes = await Promise.all(
      [...groups.entries()].map(async ([accountId, ids]) => ({
        accountId,
        ids,
        result: await bulkDeleteMails(accountId, ids),
      })),
    )

    const failed = outcomes.filter((o) => !o.result.ok)
    if (failed.length > 0) {
      const failedTargets = targets.filter((m) =>
        failed.some((f) => f.accountId === m.accountId && f.ids.includes(m.id)),
      )
      for (const m of failedTargets) deletedKeysRef.current.delete(`${m.accountId}:${m.id}`)
      setList((prev) => [...prev, ...failedTargets])
      showError(failed[0].result.error ?? "일부 메일을 삭제하지 못했습니다. 다시 시도해주세요.")
    }
  }

  const handleBulkDelete = async () => {
    const targets = visibleMails.filter((m) => checkedMailIds.has(m.id))
    if (targets.length === 0) return
    setCheckedMailIds(new Set())
    setIsBulkLoading(true)
    await deleteMailsWithRevert(targets)
    setIsBulkLoading(false)
  }

  const handleBulkDeleteInFolder = async () => {
    const targets = folderMails.filter((m) => checkedMailIds.has(m.id))
    if (targets.length === 0) return
    setCheckedMailIds(new Set())
    setIsBulkLoading(true)
    await deleteMailsWithRevert(targets, "folder")
    setIsBulkLoading(false)
  }

  const handleMarkAsUnread = (mailId: string, accountId: string) => {
    setRealMails((prev) => prev.map((m) => (m.id === mailId && m.accountId === accountId ? { ...m, isRead: false } : m)))
    setFolderMails((prev) => prev.map((m) => (m.id === mailId && m.accountId === accountId ? { ...m, isRead: false } : m)))
    setMailDetails((prev) => {
      const detail = prev[mailId]
      if (!detail) return prev
      return { ...prev, [mailId]: { ...detail, isRead: false } }
    })
    markAsUnread(mailId, accountId)
  }

  const handleDeleteMail = async (mailId: string, accountId: string) => {
    const target = allMails.find((m) => m.id === mailId && m.accountId === accountId)
      ?? folderMails.find((m) => m.id === mailId && m.accountId === accountId)
    if (!target) return
    await deleteMailsWithRevert([target], view === "folder" ? "folder" : "inbox")
  }

  // 분류 이동: 실제 서버에서는 옮기지 않고 앱 내부 배정만 바꾼다.
  const applyMove = async (targets: Mail[], folderId: string | null, origin: "inbox" | "folder") => {
    if (targets.length === 0) return
    const setList = origin === "folder" ? setFolderMails : setRealMails
    const ids = new Set(targets.map((m) => m.id))
    setList((prev) => prev.filter((m) => !ids.has(m.id)))
    setMailDetails((prev) => {
      const next = { ...prev }
      for (const id of ids) delete next[id]
      return next
    })
    if (selectedMailId && ids.has(selectedMailId)) setSelectedMailId(null)

    const items = targets.map((m) => ({ accountId: m.accountId, mailId: m.id }))
    const result = await moveMails(items, folderId)
    if (!result.ok) {
      setList((prev) => [...prev, ...targets])
      showError(result.error ?? "메일 이동에 실패했습니다.")
    }
  }

  const handleBulkMoveFromInbox = (folderId: string | null) => {
    const targets = visibleMails.filter((m) => checkedMailIds.has(m.id))
    setCheckedMailIds(new Set())
    applyMove(targets, folderId, "inbox")
  }

  const handleBulkMoveFromFolder = (folderId: string | null) => {
    const targets = folderMails.filter((m) => checkedMailIds.has(m.id))
    setCheckedMailIds(new Set())
    applyMove(targets, folderId, "folder")
  }

  const handleMoveMailFromInbox = (mailId: string, accountId: string, folderId: string | null) => {
    const target = allMails.find((m) => m.id === mailId && m.accountId === accountId)
    if (target) applyMove([target], folderId, "inbox")
  }

  const handleMoveMailFromFolder = (mailId: string, accountId: string, folderId: string | null) => {
    const target = folderMails.find((m) => m.id === mailId && m.accountId === accountId)
    if (target) applyMove([target], folderId, "folder")
  }

  const handleLoadMore = async () => {
    if (!nextCursor || isLoadingMore) return
    setIsLoadingMore(true)
    try {
      const { mails, nextCursor: newCursor } = await fetchMails(nextCursor)
      setRealMails((prev) => {
        const existingIds = new Set(prev.map((m) => `${m.accountId}:${m.id}`))
        const fresh = filterOutDeleted(mails).filter((m) => !existingIds.has(`${m.accountId}:${m.id}`))
        return [...prev, ...fresh]
      })
      setNextCursor(newCursor)
    } finally {
      setIsLoadingMore(false)
    }
  }

  const handleMarkAllRead = async (accountId?: string) => {
    const targets = realMails.filter((m) => !m.isRead && (accountId === undefined || m.accountId === accountId))
    setRealMails((prev) => prev.map((m) => {
      if (!m.isRead && (accountId === undefined || m.accountId === accountId)) return { ...m, isRead: true }
      return m
    }))
    const groups = groupIdsByAccount(targets)
    await Promise.all([...groups.entries()].map(([accId, ids]) => bulkMarkRead(accId, ids, true)))
  }

  const handleDeleteBeforeDate = async (cutoff: Date, accountId?: string) => {
    const targets = realMails.filter((m) => {
      const match = accountId === undefined || m.accountId === accountId
      return match && new Date(m.receivedAt) < cutoff
    })
    await deleteMailsWithRevert(targets)
  }

  const goToInbox = (accountId: string | null) => {
    setView("inbox")
    setSelectedAccountId(accountId)
    setSelectedCategory(null)
    setSelectedMailId(null)
    setSearchQuery("")
    setCheckedMailIds(new Set())
    setComposeState(null)
  }

  const goHome = () => {
    setView("home")
    setSelectedAccountId(null)
    setSelectedCategory(null)
    setSelectedMailId(null)
    setSearchQuery("")
    setCheckedMailIds(new Set())
    setComposeState(null)
  }

  const goToCleanup = () => {
    setView("cleanup")
    setSelectedMailId(null)
    setCheckedMailIds(new Set())
    setComposeState(null)
  }

  const goToMemo = () => {
    setView("memo")
    setSelectedMailId(null)
    setCheckedMailIds(new Set())
    setComposeState(null)
  }

  const loadTrash = () => {
    setIsTrashLoading(true)
    return fetchTrashMails()
      .then(({ mails, nextCursor: cursor }) => {
        setTrashMails(mails)
        setTrashCursor(cursor)
      })
      .finally(() => setIsTrashLoading(false))
  }

  const goToTrash = () => {
    setView("trash")
    setSelectedMailId(null)
    setCheckedMailIds(new Set())
    setComposeState(null)
    loadTrash()
  }

  const handleLoadMoreTrash = async () => {
    if (!trashCursor || isTrashLoadingMore) return
    setIsTrashLoadingMore(true)
    try {
      const { mails, nextCursor: newCursor } = await fetchTrashMails(trashCursor)
      setTrashMails((prev) => {
        const existingIds = new Set(prev.map((m) => `${m.accountId}:${m.id}`))
        const fresh = mails.filter((m) => !existingIds.has(`${m.accountId}:${m.id}`))
        return [...prev, ...fresh]
      })
      setTrashCursor(newCursor)
    } finally {
      setIsTrashLoadingMore(false)
    }
  }

  const loadFolderMails = (folderId: string) => {
    setIsFolderLoading(true)
    return fetchFolderMails(folderId)
      .then(setFolderMails)
      .finally(() => setIsFolderLoading(false))
  }

  const goToFolder = (folderId: string) => {
    setView("folder")
    setSelectedFolderId(folderId)
    setSelectedMailId(null)
    setCheckedMailIds(new Set())
    setComposeState(null)
    loadFolderMails(folderId)
  }

  // 보관함은 사용자 정의 분류와 동일한 배정 메커니즘을 쓰는 예약된 가상 폴더라서
  // folderMails/selectedFolderId 상태를 그대로 재사용한다.
  const goToArchive = () => {
    setView("archive")
    setSelectedFolderId(ARCHIVE_FOLDER_ID)
    setSelectedMailId(null)
    setCheckedMailIds(new Set())
    setComposeState(null)
    loadFolderMails(ARCHIVE_FOLDER_ID)
  }

  const handleCreateFolder = async (name: string): Promise<{ ok: boolean; error?: string }> => {
    const result = await apiCreateFolder(name)
    if (!result.ok) return { ok: false, error: result.error }
    setFolders((prev) => [...prev, result.folder])
    return { ok: true }
  }

  const handleDeleteFolder = async (folderId: string) => {
    setFolders((prev) => prev.filter((f) => f.id !== folderId))
    if (selectedFolderId === folderId) {
      goHome()
    }
    await apiDeleteFolder(folderId)
    // 삭제된 분류에 있던 메일은 서버에서 배정이 풀려 받은편지함으로 돌아간다
    loadAccountsAndMails()
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
      showError(result.error ?? "분류 순서 변경에 실패했습니다.")
    }
  }

  const handleCreateRule = async (
    field: "from" | "subject",
    keyword: string,
    targetFolderId: string | null,
    category: MailCategory | null,
  ): Promise<{ ok: boolean; error?: string }> => {
    const result = await apiCreateRule(field, keyword, targetFolderId, category)
    if (!result.ok) return { ok: false, error: result.error }
    setRules((prev) => [...prev, result.rule])
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

  const handleCreateMemo = async (): Promise<string | null> => {
    const result = await createMemo("")
    if (!result.ok) {
      showError(result.error ?? "메모 생성에 실패했습니다.")
      return null
    }
    setMemos((prev) => [result.memo, ...prev])
    return result.memo.id
  }

  const handleUpdateMemoContent = (id: string, content: string) => {
    const now = Date.now()
    setMemos((prev) => prev.map((m) => (m.id === id ? { ...m, content, updatedAt: now } : m)))
    updateMemo(id, content)
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

  const handleOpenCompose = () => {
    setComposeState({})
    setSelectedMailId(null)
  }

  const handleReply = (mail: Mail) => {
    setComposeState({
      accountId: mail.accountId,
      to: mail.fromEmail,
      subject: mail.subject.startsWith("Re:") ? mail.subject : `Re: ${mail.subject}`,
    })
  }

  const handleCancelCompose = () => setComposeState(null)

  const handleComposeSent = () => {
    setComposeState(null)
    loadAccountsAndMails()
  }

  const handleManualRefresh = async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    try {
      if (view === "trash") await loadTrash()
      else if ((view === "folder" || view === "archive") && selectedFolderId) await loadFolderMails(selectedFolderId)
      else await loadAccountsAndMails()
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleEmptyTrashAccount = async (accountId: string) => {
    const result = await emptyTrash(accountId)
    if (!result.ok) {
      showError(result.error ?? "휴지통을 비우지 못했습니다.")
      return
    }
    setTrashMails((prev) => prev.filter((m) => m.accountId !== accountId))
  }

  const handleEmptyAllTrash = async (): Promise<{ ok: boolean; error?: string }> => {
    const result = await emptyAllTrash()
    if (result.ok) setTrashMails([])
    return result
  }

  const handleDeleteFromTrash = async (targets: Mail[]) => {
    if (targets.length === 0) return
    const deletedIds = new Set(targets.map((m) => m.id))
    setTrashMails((prev) => prev.filter((m) => !deletedIds.has(m.id)))

    const groups = groupIdsByAccount(targets)
    const outcomes = await Promise.all(
      [...groups.entries()].map(async ([accountId, ids]) => ({
        accountId,
        ids,
        result: await permanentDeleteFromTrash(accountId, ids),
      })),
    )

    const failed = outcomes.filter((o) => !o.result.ok)
    if (failed.length > 0) {
      const failedTargets = targets.filter((m) =>
        failed.some((f) => f.accountId === m.accountId && f.ids.includes(m.id)),
      )
      setTrashMails((prev) => [...prev, ...failedTargets])
      showError(failed[0].result.error ?? "일부 메일을 영구 삭제하지 못했습니다.")
    }
  }

  const handleRestoreFromTrash = async (targets: Mail[]) => {
    if (targets.length === 0) return
    const restoredIds = new Set(targets.map((m) => m.id))
    setTrashMails((prev) => prev.filter((m) => !restoredIds.has(m.id)))

    const groups = groupIdsByAccount(targets)
    const outcomes = await Promise.all(
      [...groups.entries()].map(async ([accountId, ids]) => ({
        accountId,
        ids,
        result: await restoreFromTrash(accountId, ids),
      })),
    )

    const failed = outcomes.filter((o) => !o.result.ok)
    if (failed.length > 0) {
      const failedTargets = targets.filter((m) =>
        failed.some((f) => f.accountId === m.accountId && f.ids.includes(m.id)),
      )
      setTrashMails((prev) => [...prev, ...failedTargets])
      showError(failed[0].result.error ?? "일부 메일을 복구하지 못했습니다.")
    }

    // 복구된 메일이 받은편지함에 다시 보이도록 새로고침
    if (failed.length < outcomes.length) loadAccountsAndMails()
  }

  const handleLogout = async () => {
    await logout()
    setCurrentUser(null)
    setRealAccounts([])
    setRealMails([])
    setMailDetails({})
    setNextCursor(null)
    setTrashMails([])
    setTrashCursor(null)
    setFolders([])
    setFolderMails([])
    setSelectedFolderId(null)
    setRules([])
    setMemos([])
    goHome()
  }

  const handleDeleteAccount = (accountId: string) => {
    setRealAccounts((prev) => prev.filter((a) => a.id !== accountId))
    setRealMails((prev) => prev.filter((m) => m.accountId !== accountId))
    setTrashMails((prev) => prev.filter((m) => m.accountId !== accountId))
    setFolderMails((prev) => prev.filter((m) => m.accountId !== accountId))
    setMailDetails((prev) => {
      const next = { ...prev }
      for (const key of Object.keys(next)) {
        if (next[key].accountId === accountId) delete next[key]
      }
      return next
    })
    if (selectedAccountId === accountId) {
      setSelectedAccountId(null)
      setSelectedMailId(null)
    }
  }

  const handleReorderAccounts = async (order: string[]) => {
    const previous = realAccounts
    const byId = new Map(realAccounts.map((a) => [a.id, a]))
    setRealAccounts(order.map((id) => byId.get(id)).filter((a): a is Account => !!a))
    const result = await apiReorderAccounts(order)
    if (!result.ok) {
      setRealAccounts(previous)
      showError(result.error ?? "계정 순서 변경에 실패했습니다.")
    }
  }

  if (isBootstrapping) {
    return (
      <div className="flex h-svh items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    )
  }

  if (!currentUser) {
    return <LandingView />
  }

  const mailListPane = (
    <div className="flex h-full min-h-0 flex-col">
      <CategoryTabs
        counts={categoryCounts}
        selected={selectedCategory}
        onSelect={(category) => {
          setSelectedCategory(category)
          setSelectedMailId(null)
        }}
      />
      {/* 검색 바 */}
      <div className="relative border-b px-3 py-2">
        <Search className="text-muted-foreground absolute left-5 top-1/2 size-3.5 -translate-y-1/2" />
        <input
          type="text"
          placeholder="검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-muted/50 focus:bg-muted w-full rounded-md py-1.5 pr-7 pl-7 text-sm outline-none transition-colors placeholder:text-muted-foreground"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="text-muted-foreground hover:text-foreground absolute right-5 top-1/2 -translate-y-1/2"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <MailList
          mails={visibleMails}
          accounts={accounts}
          selectedMailId={selectedMailId}
          onSelectMail={handleSelectMail}
          onToggleStar={handleToggleStar}
          checkedIds={checkedMailIds}
          onToggleCheck={handleToggleCheck}
          onCheckRange={handleCheckRange}
          onSelectByFilter={handleSelectByFilter}
          onClearChecked={() => setCheckedMailIds(new Set())}
          onBulkMarkRead={handleBulkMarkRead}
          onBulkMarkUnread={handleBulkMarkUnread}
          onBulkDelete={handleBulkDelete}
          isBulkLoading={isBulkLoading}
          onBulkArchive={() => handleBulkMoveFromInbox(ARCHIVE_FOLDER_ID)}
          folders={folders}
          onBulkMove={handleBulkMoveFromInbox}
          hasMore={!searchQuery && !!nextCursor}
          isLoadingMore={isLoadingMore}
          onLoadMore={handleLoadMore}
        />
      </div>
    </div>
  )

  const mailDetailPane = composeState ? (
    <ComposeView
      accounts={accounts}
      defaultAccountId={composeState.accountId}
      defaultTo={composeState.to}
      defaultSubject={composeState.subject}
      onBack={isMobile ? handleCancelCompose : undefined}
      onCancel={handleCancelCompose}
      onSent={handleComposeSent}
    />
  ) : (
    <MailDetail
      mail={selectedMail}
      accounts={accounts}
      isLoadingBody={isLoadingDetail}
      onBack={isMobile ? () => setSelectedMailId(null) : undefined}
      onToggleStar={handleToggleStar}
      onMarkAsUnread={handleMarkAsUnread}
      onDelete={handleDeleteMail}
      onArchive={(mailId, accountId) => handleMoveMailFromInbox(mailId, accountId, ARCHIVE_FOLDER_ID)}
      onReply={handleReply}
      folders={folders}
      onMove={handleMoveMailFromInbox}
    />
  )

  const folderListPane = (
    <MailList
      mails={folderMails}
      accounts={accounts}
      selectedMailId={selectedMailId}
      onSelectMail={handleSelectMail}
      onToggleStar={handleToggleStar}
      checkedIds={checkedMailIds}
      onToggleCheck={handleToggleCheck}
      onCheckRange={handleCheckRange}
      onSelectByFilter={handleSelectByFilterInFolder}
      onClearChecked={() => setCheckedMailIds(new Set())}
      onBulkMarkRead={handleBulkMarkReadInFolder}
      onBulkMarkUnread={handleBulkMarkUnreadInFolder}
      onBulkDelete={handleBulkDeleteInFolder}
      isBulkLoading={isBulkLoading}
      onBulkArchive={view === "archive" ? undefined : () => handleBulkMoveFromFolder(ARCHIVE_FOLDER_ID)}
      folders={folders}
      currentFolderId={selectedFolderId ?? undefined}
      onBulkMove={handleBulkMoveFromFolder}
    />
  )

  const folderDetailPane = composeState ? (
    <ComposeView
      accounts={accounts}
      defaultAccountId={composeState.accountId}
      defaultTo={composeState.to}
      defaultSubject={composeState.subject}
      onBack={isMobile ? handleCancelCompose : undefined}
      onCancel={handleCancelCompose}
      onSent={handleComposeSent}
    />
  ) : (
    <MailDetail
      mail={selectedMail}
      accounts={accounts}
      isLoadingBody={isLoadingDetail}
      onBack={isMobile ? () => setSelectedMailId(null) : undefined}
      onToggleStar={handleToggleStar}
      onMarkAsUnread={handleMarkAsUnread}
      onDelete={handleDeleteMail}
      onArchive={
        view === "archive"
          ? undefined
          : (mailId, accountId) => handleMoveMailFromFolder(mailId, accountId, ARCHIVE_FOLDER_ID)
      }
      onReply={handleReply}
      folders={folders}
      currentFolderId={selectedFolderId ?? undefined}
      onMove={handleMoveMailFromFolder}
    />
  )

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AccountSidebar
        accounts={accounts}
        unreadCountByAccount={unreadCountByAccount}
        selectedAccountId={selectedAccountId}
        isInboxView={view === "inbox"}
        isCleanupView={view === "cleanup"}
        isTrashView={view === "trash"}
        isArchiveView={view === "archive"}
        isMemoView={view === "memo"}
        folders={folders}
        selectedFolderId={selectedFolderId}
        isFolderView={view === "folder"}
        onSelectAccount={goToInbox}
        onGoHome={goHome}
        onGoCleanup={goToCleanup}
        onGoTrash={goToTrash}
        onGoArchive={goToArchive}
        onGoMemo={goToMemo}
        onSelectFolder={goToFolder}
        onCreateFolder={handleCreateFolder}
        onRenameFolder={handleRenameFolder}
        onDeleteFolder={handleDeleteFolder}
        onReorderFolders={handleReorderFolders}
        onAccountConnected={loadAccountsAndMails}
        onDeleteAccount={handleDeleteAccount}
        onReorderAccounts={handleReorderAccounts}
        onLogout={handleLogout}
      />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {view === "home"
              ? "홈"
              : view === "cleanup"
                ? "정리하기"
                : view === "trash"
                  ? "휴지통"
                  : view === "archive"
                    ? "보관함"
                    : view === "memo"
                      ? "메모"
                      : view === "folder"
                      ? (folders.find((f) => f.id === selectedFolderId)?.name ?? "분류")
                      : selectedAccountId
                      ? (() => {
                          const account = accounts.find((a) => a.id === selectedAccountId)
                          return account?.provider === "gmail" || account?.provider === "naver" || account?.provider === "daum"
                            ? account.email
                            : account?.label
                        })()
                      : "전체 받은편지함"}
          </span>
          {(view === "inbox" || view === "trash" || view === "folder" || view === "archive") && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              title="새로고침"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} />
            </Button>
          )}
          {view === "inbox" && sendableAccounts.length > 0 && (
            <Button size="sm" className="gap-2" onClick={handleOpenCompose}>
              <Pencil className="size-4" />
              메일 쓰기
            </Button>
          )}
        </header>
        {view === "home" ? (
          <HomeView
            accounts={accounts}
            mails={allMails}
            unreadCountByAccount={unreadCountByAccount}
            onSelectAccount={goToInbox}
          />
        ) : view === "cleanup" ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            <CleanupView
              accounts={accounts}
              mails={allMails}
              onMarkAllRead={handleMarkAllRead}
              onDeleteBeforeDate={handleDeleteBeforeDate}
              onEmptyTrashAccount={handleEmptyTrashAccount}
              folders={folders}
              rules={rules}
              onCreateRule={handleCreateRule}
              onToggleRule={handleToggleRule}
              onDeleteRule={handleDeleteRule}
            />
          </div>
        ) : view === "trash" ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            <TrashView
              accounts={accounts}
              mails={trashMails}
              isLoading={isTrashLoading}
              hasMore={!!trashCursor}
              isLoadingMore={isTrashLoadingMore}
              onLoadMore={handleLoadMoreTrash}
              onEmptyAccount={handleEmptyTrashAccount}
              onEmptyAllAccounts={handleEmptyAllTrash}
              onDeleteSelected={handleDeleteFromTrash}
              onRestoreSelected={handleRestoreFromTrash}
            />
          </div>
        ) : view === "memo" ? (
          <MemoView
            memos={memos}
            onCreate={handleCreateMemo}
            onUpdateContent={handleUpdateMemoContent}
            onDelete={handleDeleteMemo}
          />
        ) : view === "folder" || view === "archive" ? (
          isFolderLoading && folderMails.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="text-muted-foreground size-6 animate-spin" />
            </div>
          ) : isMobile ? (
            <div className="min-h-0 flex-1">
              {selectedMailId || composeState ? folderDetailPane : folderListPane}
            </div>
          ) : (
            <ResizablePanelGroup orientation="horizontal" className="flex-1">
              <ResizablePanel defaultSize="38" minSize="25" maxSize="55" className="overflow-hidden">
                {folderListPane}
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize="62" className="overflow-hidden">
                {folderDetailPane}
              </ResizablePanel>
            </ResizablePanelGroup>
          )
        ) : isMobile ? (
          <div className="min-h-0 flex-1">
            {selectedMailId || composeState ? mailDetailPane : mailListPane}
          </div>
        ) : (
          <ResizablePanelGroup orientation="horizontal" className="flex-1">
            <ResizablePanel defaultSize="38" minSize="25" maxSize="55" className="overflow-hidden">
              {mailListPane}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="62" className="overflow-hidden">
              {mailDetailPane}
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </SidebarInset>
      {failedAccountIds.length > 0 && (() => {
        const failedAccounts = realAccounts.filter((a) => failedAccountIds.includes(a.id))
        const hasImapOrNaver = failedAccounts.some((a) => a.provider === "naver" || a.provider === "daum" || a.provider === "imap")
        if (!hasImapOrNaver) return null
        const names = failedAccounts.map((a) => a.email ?? a.label).join(", ")
        return (
          <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 max-w-sm w-full mx-4 rounded-md bg-amber-500 px-4 py-2.5 text-sm text-white shadow-lg">
            <p className="font-medium">{names} — 일시적 연결 오류</p>
            <p className="mt-0.5 text-amber-100">사이트 문제가 아니라 메일 서버가 잠시 응답하지 않는 것으로, 시간이 지나면 자동으로 복구됩니다.</p>
          </div>
        )
      })()}
      {errorMessage && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md bg-destructive px-4 py-2 text-sm text-destructive-foreground shadow-lg">
          {errorMessage}
        </div>
      )}
    </SidebarProvider>
  )
}

export default App
