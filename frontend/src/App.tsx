import { Filter, Loader2, Pencil, RefreshCw, Search, Settings, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { GroupImperativeHandle, Layout } from "react-resizable-panels"
import { AccountSidebar } from "@/components/mail/account-sidebar"
import { CategoryTabs } from "@/components/mail/category-tabs"
import { COMPOSE_SUPPORTED, ComposeView } from "@/components/mail/compose-view"
import { MailDetail } from "@/components/mail/mail-detail"
import { MailList } from "@/components/mail/mail-list"
import { CleanupView, SHORTCUTS } from "@/components/cleanup/cleanup-view"
import { TrashView } from "@/components/trash/trash-view"
import { MemoView } from "@/components/memo/memo-view"
import { DraftsView } from "@/components/drafts/drafts-view"
import { SnoozedView } from "@/components/snoozed/snoozed-view"
import { MutedView } from "@/components/muted/muted-view"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { SettingsSheet } from "@/components/settings/settings-sheet"
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
  applyRuleToExisting as apiApplyRuleToExisting,
  bulkDeleteMails,
  bulkMarkRead,
  createFolder as apiCreateFolder,
  createMemo,
  createQuickReply,
  createRule as apiCreateRule,
  createSavedFilter as apiCreateSavedFilter,
  deleteDraft,
  deleteFolder as apiDeleteFolder,
  deleteMemo,
  deleteQuickReply,
  deleteRule as apiDeleteRule,
  deleteSavedFilter as apiDeleteSavedFilter,
  dismissNotification,
  emptyAllTrash,
  emptyTrash,
  fetchAccounts,
  fetchCurrentUser,
  fetchDrafts,
  fetchFolderMails,
  fetchFolders,
  fetchMailDetail,
  fetchMails,
  fetchMemos,
  fetchNotifications,
  fetchQuickReplies,
  fetchRules,
  fetchSavedFilters,
  fetchTrashMails,
  logout,
  markAllNotificationsRead,
  markAsRead,
  markAsUnread,
  markNotificationRead,
  moveMails,
  permanentDeleteFromTrash,
  renameFolder as apiRenameFolder,
  reorderAccounts as apiReorderAccounts,
  reorderFolders as apiReorderFolders,
  restoreFromTrash,
  searchMails,
  toggleMailFolder,
  toggleStar,
  updateAccountSignature,
  updateMemo,
  updateQuickReply,
  updateRule as apiUpdateRule,
} from "@/lib/api"
import { ARCHIVE_FOLDER_ID } from "@/types/mail"
import type { Account, AppNotification, AutoClassifyRule, Draft, ForwardedAttachmentRef, Mail, MailCategory, MailFolder, MemoItem, QuickReply, SavedFilter } from "@/types/mail"
import { getSoundPreference, notifyNewMail, playNotificationSound } from "@/lib/push"
import { applyTheme, getStoredTheme, watchSystemTheme } from "@/lib/theme"
import { fetchSnoozed, snoozeKey, snoozeMail, unsnoozeMail, fetchMuted, markAllMailsRead, muteSender, unmuteSender } from "@/lib/api"

const SNAP_SIZE = 45
const SNAP_ZONE = 3

function useSnapPanel() {
  const groupRef = useRef<GroupImperativeHandle | null>(null)
  const onLayoutChange = useCallback((layout: Layout) => {
    const leftSize = layout["list-panel"]
    if (leftSize === undefined) return
    if (Math.abs(leftSize - SNAP_SIZE) < SNAP_ZONE && Math.abs(leftSize - SNAP_SIZE) > 0.01) {
      groupRef.current?.setLayout({ "list-panel": SNAP_SIZE, "detail-panel": 100 - SNAP_SIZE })
    }
  }, [])
  return { groupRef, onLayoutChange }
}

// 캐시 미스일 때 매번 새 배열 리터럴([])을 리턴하면 참조가 매 렌더링마다 바뀌어서, 이 값에
// 의존하는 useEffect들이 불필요하게 다시 실행된다 — 안정적인 참조 하나를 재사용한다.
const EMPTY_MAILS: Mail[] = []

function isRealAccountId(accountId: string): boolean {
  return accountId.includes(":")
}

function matchesSavedFilter(mail: Mail, filter: SavedFilter): boolean {
  if (filter.accountId && mail.accountId !== filter.accountId) return false
  if (filter.from && !`${mail.fromName} ${mail.fromEmail}`.toLowerCase().includes(filter.from.toLowerCase())) return false
  if (filter.subject && !mail.subject.toLowerCase().includes(filter.subject.toLowerCase())) return false
  if (filter.isUnread === true && mail.isRead) return false
  if (filter.isUnread === false && !mail.isRead) return false
  if (filter.isStarred === true && !mail.isStarred) return false
  if (filter.hasAttachment === true && !(mail.attachments && mail.attachments.length > 0)) return false
  if (filter.folderId && !(mail.folderIds ?? []).includes(filter.folderId)) return false
  return true
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
  const mailSnap = useSnapPanel()
  const folderSnap = useSnapPanel()
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string } | null>(null)
  const [view, setView] = useState<"home" | "inbox" | "cleanup" | "trash" | "folder" | "archive" | "memo" | "drafts" | "snoozed" | "muted">("home")
  const [trashMails, setTrashMails] = useState<Mail[]>([])
  const [trashCursor, setTrashCursor] = useState<string | null>(null)
  const [isTrashLoading, setIsTrashLoading] = useState(false)
  const [isTrashLoadingMore, setIsTrashLoadingMore] = useState(false)
  const [folders, setFolders] = useState<MailFolder[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  // folderId별로 캐싱해둬서, 이미 열어본 분류 메일함/보관함으로 다시 전환할 때 네트워크 왕복 없이 바로 보여준다.
  const [folderMailsCache, setFolderMailsCache] = useState<Record<string, Mail[]>>({})
  const folderMails = selectedFolderId ? (folderMailsCache[selectedFolderId] ?? EMPTY_MAILS) : EMPTY_MAILS
  const setFolderMails = (updater: Mail[] | ((prev: Mail[]) => Mail[])) => {
    if (!selectedFolderId) return
    setFolderMailsCache((prev) => {
      const current = prev[selectedFolderId] ?? []
      const next = typeof updater === "function" ? (updater as (p: Mail[]) => Mail[])(current) : updater
      return { ...prev, [selectedFolderId]: next }
    })
  }
  const [isFolderLoading, setIsFolderLoading] = useState(false)
  const [rules, setRules] = useState<AutoClassifyRule[]>([])
  const [memos, setMemos] = useState<MemoItem[]>([])
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([])
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [drafts, setDrafts] = useState<Draft[]>([])
  const pendingSendTimers = useRef<Record<string, number>>({})
  const [composeState, setComposeState] = useState<{
    accountId?: string
    to?: string
    cc?: string
    bcc?: string
    subject?: string
    body?: string
    title?: string
    forwardedAttachments?: ForwardedAttachmentRef[]
    draftId?: string
  } | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<MailCategory | null>(null)
  const [selectedMailId, setSelectedMailId] = useState<string | null>(null)
  // J/K 키보드 탐색 포커스 (열려있는 메일과는 별개)
  const [focusedMailId, setFocusedMailId] = useState<string | null>(null)
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false)
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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [snoozed, setSnoozed] = useState<Record<string, number>>({})
  const [muted, setMuted] = useState<string[]>([])
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([])
  const [activeFilter, setActiveFilter] = useState<SavedFilter | null>(null)

  // 이미 알고 있는 메일 ID 집합 — 새 메일 감지용 (초기 로드 시에는 트리거 안 함)
  const knownMailKeysRef = useRef<Set<string> | null>(null)
  // 뮤트 집합 — 폴링 클로저에서 최신 값 참조용
  const mutedSetRef = useRef<Set<string>>(new Set())

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
      const freshMails = filterOutDeleted(mails)

      // 새 메일 감지: 이전에 알고 있던 키에 없는 메일이 왔을 때 소리 + 푸시
      const freshKeys = new Set(freshMails.map((m) => `${m.accountId}:${m.id}`))
      if (knownMailKeysRef.current !== null) {
        const newKeys = [...freshKeys].filter((k) => !knownMailKeysRef.current!.has(k))
        const newNonMuted = newKeys.filter((k) => {
          const mail = freshMails.find((m) => `${m.accountId}:${m.id}` === k)
          return mail && !mutedSetRef.current.has(mail.fromEmail)
        })
        if (newNonMuted.length > 0) {
          playNotificationSound(getSoundPreference())
          notifyNewMail()
        }
      }
      knownMailKeysRef.current = freshKeys

      setRealMails((prev) => {
        if (failedSet.size === 0) return freshMails
        // 실패한 계정의 기존 메일은 그대로 유지하고 성공한 계정 메일만 교체
        const kept = prev.filter((m) => failedSet.has(m.accountId))
        const freshIds = new Set(freshMails.map((m) => `${m.accountId}:${m.id}`))
        return [...freshMails, ...kept.filter((m) => !freshIds.has(`${m.accountId}:${m.id}`))]
      })
      setNextCursor(cursor)
    })
  }

  // 앱 시작 시 저장된 테마 적용 + 시스템 다크 모드 감지 구독
  useEffect(() => {
    applyTheme(getStoredTheme())
    return watchSystemTheme()
  }, [])

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
            fetchQuickReplies().then(setQuickReplies),
            fetchNotifications().then(setNotifications),
            fetchDrafts().then(setDrafts),
            fetchSnoozed().then(setSnoozed),
            fetchMuted().then(setMuted),
            fetchSavedFilters().then(setSavedFilters),
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

  // 예약발송 재시도/실패 알림은 cron이 백그라운드에서 쌓으므로 1분마다 폴링해서 반영한다
  // (cron 주기와 동일하게 맞춤).
  useEffect(() => {
    if (!currentUser) return
    const poll = () => { if (!document.hidden) fetchNotifications().then(setNotifications) }
    const interval = setInterval(poll, 60_000)
    document.addEventListener("visibilitychange", poll)
    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", poll)
    }
  }, [currentUser])

  const accounts = realAccounts
  const allMails = realMails
  const sendableAccounts = accounts.filter((a) => COMPOSE_SUPPORTED.includes(a.provider))

  const mutedSet = useMemo(() => {
    const s = new Set(muted)
    mutedSetRef.current = s
    return s
  }, [muted])

  const unreadCountByAccount = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const mail of allMails) {
      if (!mail.isRead && !mutedSet.has(mail.fromEmail)) {
        counts[mail.accountId] = (counts[mail.accountId] ?? 0) + 1
      }
    }
    return counts
  }, [allMails, mutedSet])

  const unreadCountByFolder = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const mail of allMails) {
      if (mail.isRead) continue
      for (const folderId of mail.folderIds ?? []) {
        counts[folderId] = (counts[folderId] ?? 0) + 1
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

  const categoryMails = useMemo(
    () => (selectedCategory ? accountMails.filter((mail) => mail.category === selectedCategory) : accountMails),
    [accountMails, selectedCategory],
  )

  // 검색어를 입력하면 이미 불러온 메일 안에서는 바로 필터링해 보여주고(즉각 반응),
  // 잠시 후(디바운스) 서버(Gmail 검색 / IMAP SEARCH)에서도 검색해 결과를 합친다.
  const [serverSearchResults, setServerSearchResults] = useState<Mail[] | null>(null)
  const [isServerSearching, setIsServerSearching] = useState(false)
  const searchGenerationRef = useRef(0)

  useEffect(() => {
    const query = searchQuery.trim()
    if (!query) {
      setServerSearchResults(null)
      setIsServerSearching(false)
      return
    }
    const generation = ++searchGenerationRef.current
    setIsServerSearching(true)
    const timer = window.setTimeout(() => {
      searchMails(query).then(({ mails }) => {
        if (searchGenerationRef.current !== generation) return // 이미 검색어가 바뀐 뒤 늦게 도착한 응답은 버린다
        setServerSearchResults(mails)
        setIsServerSearching(false)
      })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [searchQuery])

  const visibleMails = useMemo(() => {
    const now = Date.now()

    if (activeFilter) {
      return allMails
        .filter((m) => matchesSavedFilter(m, activeFilter))
        .filter((m) => {
          const until = snoozed[snoozeKey(m.accountId, m.id)]
          return (!until || until <= now) && !mutedSet.has(m.fromEmail)
        })
        .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
    }

    const q = searchQuery.trim().toLowerCase()

    if (!q) {
      // 스누즈 + 뮤트 필터 적용 후 정렬
      return [...categoryMails]
        .filter((m) => {
          const until = snoozed[snoozeKey(m.accountId, m.id)]
          return (!until || until <= now) && !mutedSet.has(m.fromEmail)
        })
        .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
    }

    // 검색 중: 계정·카테고리 필터 무시하고 전체 메일에서 검색 (통합검색)
    const clientMatches = allMails.filter(
      (m) =>
        m.fromName.toLowerCase().includes(q) ||
        m.fromEmail.toLowerCase().includes(q) ||
        m.subject.toLowerCase().includes(q) ||
        m.snippet.toLowerCase().includes(q),
    )
    const merged = new Map<string, Mail>()
    for (const m of [...clientMatches, ...(serverSearchResults ?? [])]) merged.set(`${m.accountId}:${m.id}`, m)
    return [...merged.values()].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
  }, [allMails, categoryMails, searchQuery, serverSearchResults, snoozed, mutedSet, activeFilter])

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

  // 보관/받은편지함 이동: 실제 서버에서는 옮기지 않고 앱 내부 배정만 바꾼다.
  // 분류 메일함 배정은 라벨처럼 동작해서(여러 개에 동시에 속할 수 있음) 추가하는 것만으로는 지금 보는
  // 목록에서 사라지지 않는다 — 받은편지함에서는 보관할 때만, 분류 메일함 화면에서는 그 배정을 뺄 때만 사라진다.
  const applyMove = async (
    targets: Mail[],
    folderId: string | null,
    origin: "inbox" | "folder",
    fromFolderId?: string | null,
  ) => {
    if (targets.length === 0) return
    const removeFromView = origin === "inbox" ? folderId === ARCHIVE_FOLDER_ID : folderId === null
    const setList = origin === "folder" ? setFolderMails : setRealMails
    const ids = new Set(targets.map((m) => m.id))

    if (removeFromView) {
      setList((prev) => prev.filter((m) => !ids.has(m.id)))
      setMailDetails((prev) => {
        const next = { ...prev }
        for (const id of ids) delete next[id]
        return next
      })
      if (selectedMailId && ids.has(selectedMailId)) setSelectedMailId(null)
    }

    const items = targets.map((m) => ({ accountId: m.accountId, mailId: m.id }))
    const result = await moveMails(items, folderId, fromFolderId)
    if (!result.ok) {
      if (removeFromView) setList((prev) => [...prev, ...targets])
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
    applyMove(targets, folderId, "folder", selectedFolderId)
  }

  const handleMoveMailFromInbox = (mailId: string, accountId: string, folderId: string | null) => {
    const target = allMails.find((m) => m.id === mailId && m.accountId === accountId)
    if (target) applyMove([target], folderId, "inbox")
  }

  const handleMoveMailFromFolder = (mailId: string, accountId: string, folderId: string | null) => {
    const target = folderMails.find((m) => m.id === mailId && m.accountId === accountId)
    if (target) applyMove([target], folderId, "folder", selectedFolderId)
  }

  // 분류 메일함 배정을 개별로 추가/제거한다 (메일 하나가 여러 분류 메일함에 동시에 속할 수 있다).
  const handleToggleMailFolder = async (mailId: string, accountId: string, folderId: string, assign: boolean) => {
    const patchFolderIds = (mail: Mail): Mail => {
      const current = mail.folderIds ?? []
      const next = assign ? [...new Set([...current, folderId])] : current.filter((id) => id !== folderId)
      return { ...mail, folderIds: next }
    }
    const isTarget = (m: Mail) => m.id === mailId && m.accountId === accountId

    setRealMails((prev) => prev.map((m) => (isTarget(m) ? patchFolderIds(m) : m)))
    setFolderMails((prev) => {
      // 지금 보고 있는 분류 메일함에서 배정을 빼면 그 목록에서도 사라져야 한다.
      if (!assign && folderId === selectedFolderId) return prev.filter((m) => !isTarget(m))
      return prev.map((m) => (isTarget(m) ? patchFolderIds(m) : m))
    })
    setMailDetails((prev) => {
      const detail = prev[mailId]
      if (!detail || detail.accountId !== accountId) return prev
      return { ...prev, [mailId]: patchFolderIds(detail) }
    })
    if (!assign && folderId === selectedFolderId && selectedMailId === mailId) setSelectedMailId(null)

    const result = await toggleMailFolder(accountId, mailId, folderId, assign)
    if (!result.ok) {
      showError(result.error ?? "분류 메일함 배정 변경에 실패했습니다.")
      loadAccountsAndMails()
      if (selectedFolderId) loadFolderMails(selectedFolderId)
    }
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
    // 로컬 상태 즉시 반영
    setRealMails((prev) => prev.map((m) => {
      if (!m.isRead && (accountId === undefined || m.accountId === accountId)) return { ...m, isRead: true }
      return m
    }))
    // 서버에서 전체 미읽은 메일 처리 (페이지에 로드되지 않은 메일 포함)
    const targetAccounts = accountId
      ? [accountId]
      : [...new Set(realMails.filter((m) => !m.isRead).map((m) => m.accountId))]
    await Promise.all(targetAccounts.map((id) => markAllMailsRead(id)))
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
    setFocusedMailId(null)
    setSearchQuery("")
    setCheckedMailIds(new Set())
    setComposeState(null)
    setActiveFilter(null)
  }

  const handleApplyFilter = (filter: SavedFilter) => {
    setView("inbox")
    setSelectedAccountId(filter.accountId)
    setSelectedCategory(null)
    setSelectedMailId(null)
    setFocusedMailId(null)
    setSearchQuery("")
    setCheckedMailIds(new Set())
    setComposeState(null)
    setActiveFilter(filter)
  }

  const handleCreateFilter = async (input: Omit<SavedFilter, "id" | "createdAt">) => {
    const result = await apiCreateSavedFilter(input)
    if (!result.ok) return result
    setSavedFilters((prev) => [...prev, result.filter])
    return { ok: true }
  }

  const handleDeleteFilter = async (filterId: string) => {
    setSavedFilters((prev) => prev.filter((f) => f.id !== filterId))
    if (activeFilter?.id === filterId) setActiveFilter(null)
    await apiDeleteSavedFilter(filterId)
  }

  const goHome = () => {
    setView("home")
    setSelectedAccountId(null)
    setSelectedCategory(null)
    setSelectedMailId(null)
    setFocusedMailId(null)
    setSearchQuery("")
    setCheckedMailIds(new Set())
    setComposeState(null)
  }

  const goToCleanup = () => {
    setView("cleanup")
    setSelectedMailId(null)
    setFocusedMailId(null)
    setCheckedMailIds(new Set())
    setComposeState(null)
  }

  const goToMemo = () => {
    setView("memo")
    setSelectedMailId(null)
    setFocusedMailId(null)
    setCheckedMailIds(new Set())
    setComposeState(null)
  }

  const goToDrafts = () => {
    setView("drafts")
    setSelectedMailId(null)
    setFocusedMailId(null)
    setCheckedMailIds(new Set())
    setComposeState(null)
  }

  const goToSnooze = () => {
    setView("snoozed")
    setSelectedMailId(null)
    setFocusedMailId(null)
    setCheckedMailIds(new Set())
    setComposeState(null)
  }

  const goToMuted = () => {
    setView("muted")
    setSelectedMailId(null)
    setFocusedMailId(null)
    setCheckedMailIds(new Set())
    setComposeState(null)
  }

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

  const handleSnoozedMailSelect = (mailId: string, accountId: string) => {
    goToInbox(accountId)
    setSelectedMailId(mailId)
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
    setFocusedMailId(null)
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
    // 이미 캐시된 폴더면 로딩 스피너 없이 캐시를 그대로 보여주고, 최신 상태로 조용히 갱신만 한다.
    const isCached = folderId in folderMailsCache
    if (!isCached) setIsFolderLoading(true)
    return fetchFolderMails(folderId)
      .then((mails) => setFolderMailsCache((prev) => ({ ...prev, [folderId]: mails })))
      .finally(() => setIsFolderLoading(false))
  }

  const goToFolder = (folderId: string) => {
    setView("folder")
    setSelectedFolderId(folderId)
    setSelectedMailId(null)
    setFocusedMailId(null)
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
    setFocusedMailId(null)
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
      showError(result.error ?? "분류 메일함 순서 변경에 실패했습니다.")
    }
  }

  // "기존 메일에 적용": 규칙은 원래 새로 도착하는 메일에만 적용되므로, 이미 받은 메일까지 옮기고
  // 싶으면 계정 서버(Gmail 검색 / IMAP SEARCH)에서 직접 찾아서 배정한다 — 화면에 로드돼 있는 메일만
  // 훑으면 아직 안 불러온 오래된 메일은 찾지 못하기 때문.
  const applyRuleToExistingAndRefresh = async (
    ruleId: string,
    targetFolderId: string,
  ): Promise<{ ok: boolean; error?: string; count?: number }> => {
    const result = await apiApplyRuleToExisting(ruleId)
    if (!result.ok) return { ok: false, error: result.error }
    if (result.count > 0) {
      await loadAccountsAndMails()
      if (selectedFolderId === targetFolderId) await loadFolderMails(targetFolderId)
    }
    return { ok: true, count: result.count }
  }

  const handleApplyRuleToExisting = async (
    ruleId: string,
  ): Promise<{ ok: boolean; error?: string; count?: number }> => {
    const rule = rules.find((r) => r.id === ruleId)
    if (!rule?.targetFolderId) return { ok: false, error: "규칙을 찾을 수 없습니다." }
    return applyRuleToExistingAndRefresh(ruleId, rule.targetFolderId)
  }

  const handleCreateRule = async (
    field: "from" | "subject",
    keyword: string,
    targetFolderId: string | null,
    category: MailCategory | null,
    applyToExisting?: boolean,
  ): Promise<{ ok: boolean; error?: string }> => {
    const result = await apiCreateRule(field, keyword, targetFolderId, category)
    if (!result.ok) return { ok: false, error: result.error }
    setRules((prev) => [...prev, result.rule])
    if (applyToExisting && targetFolderId) await applyRuleToExistingAndRefresh(result.rule.id, targetFolderId)
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

  const handleUpdateSignature = async (accountId: string, signature: string): Promise<{ ok: boolean; error?: string }> => {
    const result = await updateAccountSignature(accountId, signature)
    if (!result.ok) return { ok: false, error: result.error }
    setRealAccounts((prev) =>
      prev.map((a) => (a.id === accountId ? { ...a, signature: signature.trim() || undefined } : a)),
    )
    return { ok: true }
  }

  const handleSnooze = async (mailId: string, accountId: string, until: number) => {
    setSnoozed((prev) => ({ ...prev, [snoozeKey(accountId, mailId)]: until }))
    setSelectedMailId(null)
    await snoozeMail(accountId, mailId, until)
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
      title: "답장",
    })
  }

  const handleReplyAll = (mail: Mail) => {
    const account = accounts.find((a) => a.id === mail.accountId)
    const selfEmail = account?.email.toLowerCase()
    const others = [...(mail.toRecipients ?? []), ...(mail.ccRecipients ?? [])]
      .map((addr) => addr.trim())
      .filter((addr) => addr && addr.toLowerCase() !== mail.fromEmail.toLowerCase() && addr.toLowerCase() !== selfEmail)
    const uniqueOthers = [...new Set(others)]
    setComposeState({
      accountId: mail.accountId,
      to: mail.fromEmail,
      cc: uniqueOthers.length > 0 ? uniqueOthers.join(", ") : undefined,
      subject: mail.subject.startsWith("Re:") ? mail.subject : `Re: ${mail.subject}`,
      title: "전체답장",
    })
  }

  const handleForward = (mail: Mail) => {
    const headerLines = [
      "",
      "",
      "---------- 원본 메일 ----------",
      `보낸사람: ${mail.fromName} <${mail.fromEmail}>`,
      `날짜: ${new Date(mail.receivedAt).toLocaleString("ko-KR")}`,
      `제목: ${mail.subject}`,
      ...(mail.toRecipients?.length ? [`받는사람: ${mail.toRecipients.join(", ")}`] : []),
      "",
    ]
    setComposeState({
      accountId: mail.accountId,
      subject: mail.subject.startsWith("Fwd:") ? mail.subject : `Fwd: ${mail.subject}`,
      body: headerLines.join("\n") + (mail.body || ""),
      title: "전달",
      forwardedAttachments: mail.attachments?.map((att) => ({
        accountId: mail.accountId,
        mailId: mail.id,
        attachmentId: att.id,
        filename: att.filename,
        mimeType: att.mimeType,
        size: att.size,
      })),
    })
  }

  const handleCancelCompose = () => setComposeState(null)

  const handleComposeSent = () => {
    setComposeState(null)
    loadAccountsAndMails()
  }

  const handleOpenDraft = (draft: Draft) => {
    setComposeState({
      accountId: draft.accountId,
      to: draft.to,
      cc: draft.cc,
      bcc: draft.bcc,
      subject: draft.subject,
      body: draft.body,
      forwardedAttachments: draft.forwardedAttachments,
      title: "임시보관 이어쓰기",
      draftId: draft.id,
    })
    setSelectedMailId(null)
  }

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

  // 정리하기 > 단축키에 안내된 목록을 실제로 동작하게 한다. 입력창/textarea/select에
  // 포커스가 있거나 작성 중일 때는 타이핑을 방해하지 않도록 전부 무시한다.
  useEffect(() => {
    const activeList = view === "folder" || view === "archive" ? folderMails : view === "inbox" ? visibleMails : []

    const moveFocus = (direction: 1 | -1) => {
      if (activeList.length === 0) return
      const currentIndex = focusedMailId ? activeList.findIndex((m) => m.id === focusedMailId) : -1
      const nextIndex =
        currentIndex === -1
          ? direction === 1 ? 0 : activeList.length - 1
          : Math.min(activeList.length - 1, Math.max(0, currentIndex + direction))
      const next = activeList[nextIndex]
      if (next) {
        setFocusedMailId(next.id)
        document.getElementById(`mail-row-${next.id}`)?.scrollIntoView({ block: "nearest" })
      }
    }

    const handler = (e: KeyboardEvent) => {
      if (composeState) return
      const target = e.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault()
        setShortcutsHelpOpen((v) => !v)
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return

      if (e.key === "Escape") {
        if (shortcutsHelpOpen) setShortcutsHelpOpen(false)
        else if (selectedMailId) setSelectedMailId(null)
        else if (checkedMailIds.size > 0) setCheckedMailIds(new Set())
        else if (focusedMailId) setFocusedMailId(null)
        return
      }

      if (activeList.length === 0) return

      if (e.key === "j" || e.key === "J") {
        e.preventDefault()
        moveFocus(1)
        return
      }
      if (e.key === "k" || e.key === "K") {
        e.preventDefault()
        moveFocus(-1)
        return
      }
      if (e.key === "Enter") {
        const target = focusedMailId ? activeList.find((m) => m.id === focusedMailId) : activeList[0]
        if (target) handleSelectMail(target.id)
        return
      }

      const relevant = selectedMail ?? (focusedMailId ? activeList.find((m) => m.id === focusedMailId) ?? null : null)
      if (!relevant) return

      if (e.key === "Backspace") {
        e.preventDefault()
        handleDeleteMail(relevant.id, relevant.accountId)
      } else if (e.key === "r" || e.key === "R") {
        handleReply(relevant)
      } else if (e.key === "s" || e.key === "S") {
        handleToggleStar(relevant.id, relevant.accountId, !relevant.isStarred)
      } else if ((e.key === "u" || e.key === "U") && relevant.isRead) {
        handleMarkAsUnread(relevant.id, relevant.accountId)
      }
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [composeState, view, visibleMails, folderMails, selectedMailId, selectedMail, focusedMailId, checkedMailIds, shortcutsHelpOpen])

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
    setFolderMailsCache({})
    setSelectedFolderId(null)
    setRules([])
    setMemos([])
    setQuickReplies([])
    setNotifications([])
    setDrafts([])
    setSnoozed({})
    setMuted([])
    for (const timer of Object.values(pendingSendTimers.current)) window.clearTimeout(timer)
    pendingSendTimers.current = {}
    goHome()
  }

  const handleDeleteAccount = (accountId: string) => {
    setRealAccounts((prev) => prev.filter((a) => a.id !== accountId))
    setRealMails((prev) => prev.filter((m) => m.accountId !== accountId))
    setTrashMails((prev) => prev.filter((m) => m.accountId !== accountId))
    setFolderMailsCache((prev) =>
      Object.fromEntries(Object.entries(prev).map(([id, mails]) => [id, mails.filter((m) => m.accountId !== accountId)])),
    )
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
          setActiveFilter(null)
        }}
      />
      {activeFilter && (
        <div className="bg-primary/5 flex items-center justify-between gap-2 border-b px-3 py-1.5 text-sm">
          <span className="flex min-w-0 items-center gap-1.5">
            <Filter className="text-primary size-3.5 shrink-0" />
            <span className="truncate">{activeFilter.name}</span>
          </span>
          <button
            type="button"
            onClick={() => setActiveFilter(null)}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label="필터 해제"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
      {/* 검색 바 */}
      <div className="relative border-b px-3 py-2">
        <Search className="text-muted-foreground absolute left-5 top-1/2 size-3.5 -translate-y-1/2" />
        <input
          type="text"
          placeholder="검색..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            if (activeFilter) setActiveFilter(null)
          }}
          className="bg-muted/50 focus:bg-muted w-full rounded-md py-1.5 pr-7 pl-7 text-sm outline-none transition-colors placeholder:text-muted-foreground"
        />
        {searchQuery && isServerSearching && (
          <Loader2 className="text-muted-foreground absolute right-5 top-1/2 size-3.5 -translate-y-1/2 animate-spin" />
        )}
        {searchQuery && !isServerSearching && (
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
          focusedMailId={focusedMailId}
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
      mails={allMails}
      quickReplies={quickReplies}
      title={composeState.title}
      defaultAccountId={composeState.accountId}
      defaultTo={composeState.to}
      defaultCc={composeState.cc}
      defaultBcc={composeState.bcc}
      defaultSubject={composeState.subject}
      defaultBody={composeState.body}
      defaultForwardedAttachments={composeState.forwardedAttachments}
      defaultDraftId={composeState.draftId}
      onDraftSaved={handleDraftSaved}
      onDraftDeleted={handleDraftDeleted}
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
      onReplyAll={handleReplyAll}
      onForward={handleForward}
      folders={folders}
      onMove={handleMoveMailFromInbox}
      onToggleFolder={handleToggleMailFolder}
      onSnooze={handleSnooze}
      onMute={handleMuteSender}
      isMuted={!!selectedMailStub && mutedSet.has(selectedMailStub.fromEmail)}
    />
  )

  const folderListPane = (
    <MailList
      mails={folderMails}
      accounts={accounts}
      selectedMailId={selectedMailId}
      focusedMailId={focusedMailId}
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
      mails={allMails}
      quickReplies={quickReplies}
      title={composeState.title}
      defaultAccountId={composeState.accountId}
      defaultTo={composeState.to}
      defaultCc={composeState.cc}
      defaultBcc={composeState.bcc}
      defaultSubject={composeState.subject}
      defaultBody={composeState.body}
      defaultForwardedAttachments={composeState.forwardedAttachments}
      defaultDraftId={composeState.draftId}
      onDraftSaved={handleDraftSaved}
      onDraftDeleted={handleDraftDeleted}
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
      onReplyAll={handleReplyAll}
      onForward={handleForward}
      folders={folders}
      currentFolderId={selectedFolderId ?? undefined}
      onMove={handleMoveMailFromFolder}
      onToggleFolder={handleToggleMailFolder}
    />
  )

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AccountSidebar
        accounts={accounts}
        unreadCountByAccount={unreadCountByAccount}
        unreadCountByFolder={unreadCountByFolder}
        selectedAccountId={selectedAccountId}
        isInboxView={view === "inbox"}
        isCleanupView={view === "cleanup"}
        isTrashView={view === "trash"}
        isArchiveView={view === "archive"}
        isMemoView={view === "memo"}
        isDraftsView={view === "drafts"}
        draftCount={drafts.length}
        isSnoozeView={view === "snoozed"}
        snoozeCount={Object.values(snoozed).filter((until) => until > Date.now()).length}
        isMutedView={view === "muted"}
        folders={folders}
        selectedFolderId={selectedFolderId}
        isFolderView={view === "folder"}
        savedFilters={savedFilters}
        activeFilterId={activeFilter?.id ?? null}
        onSelectAccount={goToInbox}
        onGoHome={goHome}
        onGoCleanup={goToCleanup}
        onGoTrash={goToTrash}
        onGoArchive={goToArchive}
        onGoMemo={goToMemo}
        onGoDrafts={goToDrafts}
        onGoSnooze={goToSnooze}
        onGoMuted={goToMuted}
        onSelectFolder={goToFolder}
        onCreateFolder={handleCreateFolder}
        onRenameFolder={handleRenameFolder}
        onDeleteFolder={handleDeleteFolder}
        onReorderFolders={handleReorderFolders}
        onApplyFilter={handleApplyFilter}
        onCreateFilter={handleCreateFilter}
        onDeleteFilter={handleDeleteFilter}
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
                      : view === "drafts"
                      ? "임시보관함"
                      : view === "snoozed"
                      ? "스누즈"
                      : view === "muted"
                      ? "뮤트"
                      : view === "folder"
                      ? (folders.find((f) => f.id === selectedFolderId)?.name ?? "분류 메일함")
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
          <NotificationBell
            notifications={notifications}
            onMarkRead={handleMarkNotificationRead}
            onMarkAllRead={handleMarkAllNotificationsRead}
            onDismiss={handleDismissNotification}
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            title="설정"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="size-4" />
          </Button>
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
              onUpdateSignature={handleUpdateSignature}
              folders={folders}
              rules={rules}
              onCreateRule={handleCreateRule}
              onToggleRule={handleToggleRule}
              onDeleteRule={handleDeleteRule}
              onApplyRuleToExisting={handleApplyRuleToExisting}
              quickReplies={quickReplies}
              onCreateQuickReply={handleCreateQuickReply}
              onUpdateQuickReply={handleUpdateQuickReply}
              onDeleteQuickReply={handleDeleteQuickReply}
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
        ) : view === "drafts" ? (
          composeState ? (
            <div className="min-h-0 flex-1">{mailDetailPane}</div>
          ) : (
            <DraftsView
              drafts={drafts}
              accounts={accounts}
              onOpenDraft={handleOpenDraft}
              onDeleteDraft={handleDeleteDraft}
            />
          )
        ) : view === "snoozed" ? (
          <SnoozedView
            mails={allMails}
            accounts={accounts}
            snoozed={snoozed}
            onUnsnooze={handleUnsnooze}
            onSelectMail={handleSnoozedMailSelect}
          />
        ) : view === "muted" ? (
          <MutedView
            mails={allMails}
            accounts={accounts}
            muted={muted}
            onUnmute={(email) => handleMuteSender(email)}
            onSelectMail={handleSnoozedMailSelect}
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
            <ResizablePanelGroup groupRef={folderSnap.groupRef} onLayoutChange={folderSnap.onLayoutChange} orientation="horizontal" className="flex-1">
              <ResizablePanel id="list-panel" defaultSize="45" minSize="35" maxSize="60" className="overflow-hidden">
                {folderListPane}
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel id="detail-panel" defaultSize="55" minSize="35" className="overflow-hidden">
                {folderDetailPane}
              </ResizablePanel>
            </ResizablePanelGroup>
          )
        ) : isMobile ? (
          <div className="min-h-0 flex-1">
            {selectedMailId || composeState ? mailDetailPane : mailListPane}
          </div>
        ) : (
          <ResizablePanelGroup groupRef={mailSnap.groupRef} onLayoutChange={mailSnap.onLayoutChange} orientation="horizontal" className="flex-1">
            <ResizablePanel id="list-panel" defaultSize="45" minSize="35" maxSize="60" className="overflow-hidden">
              {mailListPane}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel id="detail-panel" defaultSize="55" minSize="35" className="overflow-hidden">
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
      {shortcutsHelpOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShortcutsHelpOpen(false)}
        >
          <div
            className="bg-background mx-4 w-full max-w-sm rounded-lg border p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 font-semibold">단축키</h3>
            <div className="space-y-2">
              {SHORTCUTS.map((s) => (
                <div key={s.keys} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{s.desc}</span>
                  <kbd className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">{s.keys}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </SidebarProvider>
  )
}

export default App
