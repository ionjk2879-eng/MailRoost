import { Filter, Loader2, Pencil, RefreshCw, Search, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { GroupImperativeHandle, Layout } from "react-resizable-panels"
import { AccountSidebar } from "@/components/mail/account-sidebar"
import { CategoryTabs } from "@/components/mail/category-tabs"
import { COMPOSE_SUPPORTED, ComposeView } from "@/components/mail/compose-view"
import { MailDetail } from "@/components/mail/mail-detail"
import { MailList } from "@/components/mail/mail-list"
import { MailFilterMenu } from "@/components/mail/mail-filter-menu"
import { CleanupView, SHORTCUTS } from "@/components/cleanup/cleanup-view"
import { TrashView } from "@/components/trash/trash-view"
import { MemoView } from "@/components/memo/memo-view"
import { DraftsView } from "@/components/drafts/drafts-view"
import { SnoozeMuteView } from "@/components/snoozed/snooze-mute-view"
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
import { useMailWorkspace } from "@/hooks/use-mail-workspace"
import type { AppView } from "@/hooks/use-mail-workspace"
import { useMailOrg } from "@/hooks/use-mail-org"
import { cn } from "@/lib/utils"
import { HomeView } from "@/components/home/home-view"
import { LandingView } from "@/components/home/landing-view"
import { fetchCurrentUser, fetchMailDetail, logout, snoozeKey } from "@/lib/api"
import { ARCHIVE_FOLDER_ID } from "@/types/mail"
import type { Draft, ForwardedAttachmentRef, Mail, MailCategory, SavedFilter } from "@/types/mail"
import { applyTheme, getStoredTheme, watchSystemTheme } from "@/lib/theme"

const SNAP_SIZE = 45
const SNAP_ZONE = 3

interface MailRoostHistoryState {
  mailRoost: true
  view: AppView
  accountId: string | null
  folderId: string | null
  mailId: string | null
}

function readInitialHistoryState(): MailRoostHistoryState | null {
  const state = window.history.state as Partial<MailRoostHistoryState> | null
  if (!state?.mailRoost || typeof state.view !== "string") return null
  return state as MailRoostHistoryState
}

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

function App() {
  const initialHistoryStateRef = useRef<MailRoostHistoryState | null>(readInitialHistoryState())
  const isMobile = useIsMobile()
  const mailSnap = useSnapPanel()
  const folderSnap = useSnapPanel()
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string } | null>(null)
  const [view, setView] = useState<AppView>(() => initialHistoryStateRef.current?.view ?? "home")
  const historyInitializedRef = useRef(false)
  const restoringHistoryRef = useRef(false)
  const historyWrittenSynchronouslyRef = useRef(false)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(() => initialHistoryStateRef.current?.folderId ?? null)
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
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(() => initialHistoryStateRef.current?.accountId ?? null)
  const [selectedCategory, setSelectedCategory] = useState<MailCategory | null>(null)
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const showError = (message: string) => {
    setErrorMessage(message)
    window.setTimeout(() => setErrorMessage((prev) => (prev === message ? null : prev)), 5000)
  }

  // 두 훅 사이의 순환 의존 해소: useMailOrg는 useMailWorkspace가 소유한 새로고침 함수(값이 아니라
  // 함수 자체는 workspace 내부 상태에만 의존하므로 mailOrg 없이도 먼저 만들 수 있다)를 필요로 하고,
  // useMailWorkspace는 useMailOrg가 소유한 mutedSet(뮤트 판단용)을 필요로 한다. 그래서 워크스페이스를
  // 먼저 만들고, mailOrg에는 워크스페이스의 새로고침 함수를 주입하고, mutedSet은 반대 방향으로
  // (mailOrg가 만들어진 뒤) ref를 통해 다리를 놓아 동기화한다 — 아래 useEffect 참고.
  const workspace = useMailWorkspace({ currentUser, view, selectedFolderId, showError })

  // 홈으로 이동 — mailOrg가 "분류 메일함 삭제 시 지금 보고 있던 메일함이면 홈으로" 판단에 쓴다.
  const goHome = () => {
    setView("home")
    setSelectedAccountId(null)
    setSelectedCategory(null)
    workspace.setSelectedMailId(null)
    workspace.setFocusedMailId(null)
    workspace.setSearchQuery("")
    workspace.setCheckedMailIds(new Set())
    setComposeState(null)
  }

  const mailOrg = useMailOrg({
    currentUser,
    showError,
    selectedFolderId,
    refreshMails: workspace.loadAccountsAndMails,
    refreshFolderMails: workspace.loadFolderMails,
  })

  // mutedSet은 mailOrg가 소유하지만, 폴링 클로저(useMailWorkspace 내부)에서는 매 렌더링을 새로
  // 구독할 수 없으니 ref로 최신 값을 반영해준다.
  useEffect(() => {
    workspace.updateMutedSet(mailOrg.mutedSet)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mailOrg.mutedSet])

  const accounts = workspace.accounts
  const allMails = workspace.allMails
  const sendableAccounts = accounts.filter((a) => COMPOSE_SUPPORTED.includes(a.provider))

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
          const saved = initialHistoryStateRef.current
          if (saved?.mailId) workspace.setSelectedMailId(saved.mailId)
          const loads: Promise<unknown>[] = [workspace.loadAccountsAndMails(), mailOrg.loadInitialData()]
          if ((saved?.view === "folder" || saved?.view === "archive") && saved.folderId) {
            loads.push(workspace.loadFolderMails(saved.folderId))
          } else if (saved?.view === "trash") {
            loads.push(workspace.loadTrash())
          }
          return Promise.all(loads)
        }
      })
      .finally(() => setIsBootstrapping(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 예약발송 재시도/실패 알림은 cron이 백그라운드에서 쌓으므로 1분마다 폴링해서 반영한다
  // (cron 주기와 동일하게 맞춤). 알림 자체는 mailOrg가 소유하므로 fetch만 여기서 반복한다.
  useEffect(() => {
    if (!currentUser) return
    const poll = () => { if (!document.hidden) mailOrg.refreshNotifications() }
    const interval = setInterval(poll, 60_000)
    document.addEventListener("visibilitychange", poll)
    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", poll)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser])

  const unreadCountByAccount = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const mail of allMails) {
      if (!mail.isRead && !mailOrg.mutedSet.has(mail.fromEmail)) {
        counts[mail.accountId] = (counts[mail.accountId] ?? 0) + 1
      }
    }
    return counts
  }, [allMails, mailOrg.mutedSet])

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
    const scoped = selectedAccountId
      ? allMails.filter((mail) => mail.accountId === selectedAccountId)
      : allMails
    return view === "starred" ? scoped.filter((mail) => mail.isStarred) : scoped
  }, [allMails, selectedAccountId, view])

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

  // mutedSet/snoozed/activeFilter는 mailOrg 소관이라, 순환 의존을 피하려고 이 계산은
  // useMailWorkspace 안이 아니라 여기서 두 훅의 결과를 합쳐서 한다.
  const visibleMails = useMemo(() => {
    const now = Date.now()

    if (mailOrg.activeFilter) {
      const filter = mailOrg.activeFilter
      return allMails
        .filter((m) => matchesSavedFilter(m, filter))
        .filter((m) => {
          const until = mailOrg.snoozed[snoozeKey(m.accountId, m.id)]
          return (!until || until <= now) && !mailOrg.mutedSet.has(m.fromEmail)
        })
        .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
    }

    const q = workspace.searchQuery.trim().toLowerCase()

    if (!q) {
      // 스누즈 + 뮤트 필터 적용 후 정렬
      return [...categoryMails]
        .filter((m) => {
          const until = mailOrg.snoozed[snoozeKey(m.accountId, m.id)]
          return (!until || until <= now) && !mailOrg.mutedSet.has(m.fromEmail)
        })
        .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
    }

    // 검색 중: 계정·카테고리 필터 무시하고 전체 메일에서 검색 (통합검색)
    const searchScope = view === "starred" ? allMails.filter((mail) => mail.isStarred) : allMails
    const clientMatches = searchScope.filter(
      (m) =>
        m.fromName.toLowerCase().includes(q) ||
        m.fromEmail.toLowerCase().includes(q) ||
        m.subject.toLowerCase().includes(q) ||
        m.snippet.toLowerCase().includes(q),
    )
    const merged = new Map<string, Mail>()
    const serverMatches = (workspace.serverSearchResults ?? []).filter((mail) => view !== "starred" || mail.isStarred)
    for (const m of [...clientMatches, ...serverMatches]) merged.set(`${m.accountId}:${m.id}`, m)
    return [...merged.values()].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
  }, [allMails, categoryMails, workspace.searchQuery, workspace.serverSearchResults, mailOrg.snoozed, mailOrg.mutedSet, mailOrg.activeFilter, view])

  const selectedMailStub =
    visibleMails.find((mail) => mail.id === workspace.selectedMailId)
    ?? workspace.folderMails.find((mail) => mail.id === workspace.selectedMailId)
    ?? null

  useEffect(() => {
    if (!selectedMailStub || !isRealAccountId(selectedMailStub.accountId)) return
    if (workspace.mailDetails[selectedMailStub.id]) return
    fetchMailDetail(selectedMailStub.id, selectedMailStub.accountId).then((detail) => {
      if (detail) workspace.setMailDetail(detail)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMailStub, workspace.mailDetails])

  const isLoadingDetail =
    selectedMailStub !== null &&
    isRealAccountId(selectedMailStub.accountId) &&
    !workspace.mailDetails[selectedMailStub.id]

  const selectedMail = selectedMailStub
    ? (workspace.mailDetails[selectedMailStub.id] ?? selectedMailStub)
    : null

  // 메일 선택 자체(읽음 처리 포함)는 useMailWorkspace 소관이지만, 브라우저 히스토리 기록은
  // view/selectedAccountId/selectedFolderId 같은 App.tsx의 네비게이션 상태와 히스토리 ref에
  // 의존하므로 여기서 감싼다.
  const handleSelectMail = (mailId: string | null) => {
    if (currentUser && mailId && mailId !== workspace.selectedMailId) {
      const listState: MailRoostHistoryState = {
        mailRoost: true,
        view,
        accountId: selectedAccountId,
        folderId: selectedFolderId,
        mailId: workspace.selectedMailId,
      }
      const detailState: MailRoostHistoryState = { ...listState, mailId }

      if (!historyInitializedRef.current) {
        window.history.replaceState(listState, "")
        historyInitializedRef.current = true
      }
      // 목록에서 상세를 처음 열 때만 새 기록을 만든다. 상세가 열린 채 다른
      // 메일을 고르면 현재 상세 기록만 교체해 첫 뒤로가기가 항상 목록으로 간다.
      if (workspace.selectedMailId === null) window.history.pushState(detailState, "")
      else window.history.replaceState(detailState, "")
      historyWrittenSynchronouslyRef.current = true
    }
    setComposeState(null)
    workspace.handleSelectMail(mailId)
  }

  const handleSelectByFilter = (filter: "all" | "none" | "read" | "unread" | "starred" | "unstarred") =>
    workspace.selectByFilter(visibleMails, filter)

  const handleBulkMarkRead = () => workspace.bulkMarkRead(visibleMails, true)
  const handleBulkMarkUnread = () => workspace.bulkMarkRead(visibleMails, false)
  const handleBulkDelete = () => workspace.bulkDelete(visibleMails)
  const handleBulkMoveFromInbox = (folderId: string | null) => workspace.bulkMoveFromInbox(visibleMails, folderId)

  const goToInbox = (accountId: string | null) => {
    setView("inbox")
    setSelectedAccountId(accountId)
    setSelectedCategory(null)
    workspace.setSelectedMailId(null)
    workspace.setFocusedMailId(null)
    workspace.setSearchQuery("")
    workspace.setCheckedMailIds(new Set())
    setComposeState(null)
    mailOrg.setActiveFilter(null)
  }

  const handleApplyFilter = (filter: SavedFilter) => {
    setView("inbox")
    setSelectedAccountId(filter.accountId)
    setSelectedCategory(null)
    workspace.setSelectedMailId(null)
    workspace.setFocusedMailId(null)
    workspace.setSearchQuery("")
    workspace.setCheckedMailIds(new Set())
    setComposeState(null)
    mailOrg.setActiveFilter(filter)
  }

  const goToCleanup = () => {
    setView("cleanup")
    workspace.setSelectedMailId(null)
    workspace.setFocusedMailId(null)
    workspace.setCheckedMailIds(new Set())
    setComposeState(null)
  }

  const goToMemo = () => {
    setView("memo")
    workspace.setSelectedMailId(null)
    workspace.setFocusedMailId(null)
    workspace.setCheckedMailIds(new Set())
    setComposeState(null)
  }

  const goToDrafts = () => {
    setView("drafts")
    workspace.setSelectedMailId(null)
    workspace.setFocusedMailId(null)
    workspace.setCheckedMailIds(new Set())
    setComposeState(null)
  }

  const goToSnooze = () => {
    setView("snoozed")
    workspace.setSelectedMailId(null)
    workspace.setFocusedMailId(null)
    workspace.setCheckedMailIds(new Set())
    setComposeState(null)
  }

  const goToMuted = () => {
    setView("muted")
    workspace.setSelectedMailId(null)
    workspace.setFocusedMailId(null)
    workspace.setCheckedMailIds(new Set())
    setComposeState(null)
  }

  const handleSnoozedMailSelect = (mailId: string, accountId: string) => {
    goToInbox(accountId)
    workspace.setSelectedMailId(mailId)
  }

  const goToTrash = () => {
    setView("trash")
    workspace.setSelectedMailId(null)
    workspace.setFocusedMailId(null)
    workspace.setCheckedMailIds(new Set())
    setComposeState(null)
    workspace.loadTrash()
  }

  const goToFolder = (folderId: string) => {
    setView("folder")
    setSelectedFolderId(folderId)
    workspace.setSelectedMailId(null)
    workspace.setFocusedMailId(null)
    workspace.setCheckedMailIds(new Set())
    setComposeState(null)
    workspace.loadFolderMails(folderId)
  }

  // 보관함은 사용자 정의 분류와 동일한 배정 메커니즘을 쓰는 예약된 가상 폴더라서
  // folderMails/selectedFolderId 상태를 그대로 재사용한다.
  const goToArchive = () => {
    setView("archive")
    setSelectedFolderId(ARCHIVE_FOLDER_ID)
    workspace.setSelectedMailId(null)
    workspace.setFocusedMailId(null)
    workspace.setCheckedMailIds(new Set())
    setComposeState(null)
    workspace.loadFolderMails(ARCHIVE_FOLDER_ID)
  }

  const goToStarred = () => {
    setView("starred")
    setSelectedAccountId(null)
    setSelectedCategory(null)
    workspace.setSelectedMailId(null)
    workspace.setFocusedMailId(null)
    workspace.setSearchQuery("")
    workspace.setCheckedMailIds(new Set())
    setComposeState(null)
    mailOrg.setActiveFilter(null)
  }

  // 앱 내부 화면 전환을 브라우저 히스토리와 동기화한다. 데스크톱 PWA에서도
  // 마우스 사이드 버튼과 Alt+Left/Alt+Right가 일반 웹페이지처럼 동작한다.
  useEffect(() => {
    if (!currentUser) {
      historyInitializedRef.current = false
      return
    }

    const state: MailRoostHistoryState = {
      mailRoost: true,
      view,
      accountId: selectedAccountId,
      folderId: selectedFolderId,
      mailId: workspace.selectedMailId,
    }

    if (!historyInitializedRef.current) {
      window.history.replaceState(state, "")
      historyInitializedRef.current = true
      return
    }
    if (restoringHistoryRef.current) {
      restoringHistoryRef.current = false
      return
    }
    if (historyWrittenSynchronouslyRef.current) {
      historyWrittenSynchronouslyRef.current = false
      return
    }
    window.history.pushState(state, "")
  }, [currentUser, view, selectedAccountId, selectedFolderId, workspace.selectedMailId])

  useEffect(() => {
    if (!currentUser) return
    const restore = (event: PopStateEvent) => {
      const state = event.state as MailRoostHistoryState | null
      if (!state?.mailRoost) return
      restoringHistoryRef.current = true
      setView(state.view)
      setSelectedAccountId(state.accountId)
      setSelectedFolderId(state.folderId)
      workspace.setSelectedMailId(state.mailId)
      workspace.setFocusedMailId(null)
      workspace.setCheckedMailIds(new Set())
      setComposeState(null)
      workspace.setSearchQuery("")
      mailOrg.setActiveFilter(null)
      if ((state.view === "folder" || state.view === "archive") && state.folderId) workspace.loadFolderMails(state.folderId)
      if (state.view === "trash") workspace.loadTrash()
    }
    window.addEventListener("popstate", restore)
    return () => window.removeEventListener("popstate", restore)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser])

  const handleOpenCompose = () => {
    setComposeState({})
    workspace.setSelectedMailId(null)
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
    workspace.loadAccountsAndMails()
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
    workspace.setSelectedMailId(null)
  }

  // "기존 메일에 적용" 진행 중 지금 보고 있는 분류 메일함이면 삭제 후 홈으로 보낸다.
  const handleDeleteFolder = async (folderId: string) => {
    if (selectedFolderId === folderId) goHome()
    await mailOrg.handleDeleteFolder(folderId)
  }

  const handleSnooze = async (mailId: string, accountId: string, until: number) => {
    await mailOrg.handleSnooze(mailId, accountId, until, () => workspace.setSelectedMailId(null))
  }

  const handleDeleteAccount = (accountId: string) => {
    workspace.handleDeleteAccount(accountId)
    if (selectedAccountId === accountId) {
      setSelectedAccountId(null)
      workspace.setSelectedMailId(null)
    }
  }

  // 정리하기 > 단축키에 안내된 목록을 실제로 동작하게 한다. 입력창/textarea/select에
  // 포커스가 있거나 작성 중일 때는 타이핑을 방해하지 않도록 전부 무시한다.
  useEffect(() => {
    const activeList = view === "folder" || view === "archive" ? workspace.folderMails : view === "inbox" || view === "starred" ? visibleMails : []

    const moveFocus = (direction: 1 | -1) => {
      if (activeList.length === 0) return
      const currentIndex = workspace.focusedMailId ? activeList.findIndex((m) => m.id === workspace.focusedMailId) : -1
      const nextIndex =
        currentIndex === -1
          ? direction === 1 ? 0 : activeList.length - 1
          : Math.min(activeList.length - 1, Math.max(0, currentIndex + direction))
      const next = activeList[nextIndex]
      if (next) {
        workspace.setFocusedMailId(next.id)
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
        else if (workspace.selectedMailId) {
          workspace.setSelectedMailId(null)
          workspace.setFocusedMailId(null)
        } else if (workspace.checkedMailIds.size > 0) workspace.setCheckedMailIds(new Set())
        else if (workspace.focusedMailId) workspace.setFocusedMailId(null)
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
        const target = workspace.focusedMailId ? activeList.find((m) => m.id === workspace.focusedMailId) : activeList[0]
        if (target) handleSelectMail(target.id)
        return
      }

      const relevant = selectedMail ?? (workspace.focusedMailId ? activeList.find((m) => m.id === workspace.focusedMailId) ?? null : null)
      if (!relevant) return

      if (e.key === "Backspace") {
        e.preventDefault()
        workspace.handleDeleteMail(relevant.id, relevant.accountId)
      } else if (e.key === "r" || e.key === "R") {
        handleReply(relevant)
      } else if (e.key === "s" || e.key === "S") {
        workspace.handleToggleStar(relevant.id, relevant.accountId, !relevant.isStarred)
      } else if ((e.key === "u" || e.key === "U") && relevant.isRead) {
        workspace.handleMarkAsUnread(relevant.id, relevant.accountId)
      }
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeState, view, visibleMails, workspace.folderMails, workspace.selectedMailId, selectedMail, workspace.focusedMailId, workspace.checkedMailIds, shortcutsHelpOpen])

  const handleLogout = async () => {
    await logout()
    setCurrentUser(null)
    workspace.reset()
    setSelectedFolderId(null)
    mailOrg.reset()
    for (const timer of Object.values(pendingSendTimers.current)) window.clearTimeout(timer)
    pendingSendTimers.current = {}
    goHome()
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
          workspace.setSelectedMailId(null)
          mailOrg.setActiveFilter(null)
        }}
      />
      {/* 검색 바 */}
      <div className="border-b bg-background px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <input
              type="text"
              placeholder="메일 검색"
              value={workspace.searchQuery}
              onChange={(e) => {
                workspace.setSearchQuery(e.target.value)
                if (mailOrg.activeFilter) mailOrg.setActiveFilter(null)
              }}
              className="bg-muted/50 focus:bg-background focus:ring-ring/40 h-10 w-full rounded-lg border border-transparent py-2 pr-9 pl-9 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-border focus:ring-2"
            />
            {workspace.searchQuery && workspace.isServerSearching && <Loader2 className="text-muted-foreground absolute right-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin" />}
            {workspace.searchQuery && !workspace.isServerSearching && <button type="button" onClick={() => workspace.setSearchQuery("")} className="text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2"><X className="size-3.5" /></button>}
          </div>
          <MailFilterMenu
            accounts={accounts}
            folders={mailOrg.folders}
            savedFilters={mailOrg.savedFilters}
            activeFilterId={mailOrg.activeFilter?.id ?? null}
            onApply={handleApplyFilter}
            onClear={() => mailOrg.setActiveFilter(null)}
            onCreate={mailOrg.handleCreateFilter}
            onDelete={mailOrg.handleDeleteFilter}
          />
        </div>
        {mailOrg.activeFilter && (
          <div className="mt-2 flex items-center">
            <span className="bg-primary/10 text-primary flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium">
              <Filter className="size-3" /><span className="truncate">{mailOrg.activeFilter.name}</span>
              <button type="button" onClick={() => mailOrg.setActiveFilter(null)} aria-label="필터 해제" className="hover:text-foreground"><X className="size-3" /></button>
            </span>
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <MailList
          mails={visibleMails}
          selectedMailId={workspace.selectedMailId}
          focusedMailId={workspace.focusedMailId}
          onSelectMail={handleSelectMail}
          onToggleStar={workspace.handleToggleStar}
          checkedIds={workspace.checkedMailIds}
          onToggleCheck={workspace.handleToggleCheck}
          onCheckRange={workspace.handleCheckRange}
          onSelectByFilter={handleSelectByFilter}
          onClearChecked={() => workspace.setCheckedMailIds(new Set())}
          onBulkMarkRead={handleBulkMarkRead}
          onBulkMarkUnread={handleBulkMarkUnread}
          onBulkDelete={handleBulkDelete}
          isBulkLoading={workspace.isBulkLoading}
          onBulkArchive={() => handleBulkMoveFromInbox(ARCHIVE_FOLDER_ID)}
          folders={mailOrg.folders}
          onBulkMove={handleBulkMoveFromInbox}
          hasMore={!workspace.searchQuery && !!workspace.nextCursor}
          isLoadingMore={workspace.isLoadingMore}
          onLoadMore={workspace.handleLoadMore}
        />
      </div>
    </div>
  )

  const mailDetailPane = composeState ? (
    <ComposeView
      accounts={accounts}
      mails={allMails}
      quickReplies={mailOrg.quickReplies}
      title={composeState.title}
      defaultAccountId={composeState.accountId}
      defaultTo={composeState.to}
      defaultCc={composeState.cc}
      defaultBcc={composeState.bcc}
      defaultSubject={composeState.subject}
      defaultBody={composeState.body}
      defaultForwardedAttachments={composeState.forwardedAttachments}
      defaultDraftId={composeState.draftId}
      onDraftSaved={mailOrg.handleDraftSaved}
      onDraftDeleted={mailOrg.handleDraftDeleted}
      onBack={isMobile ? handleCancelCompose : undefined}
      onCancel={handleCancelCompose}
      onSent={handleComposeSent}
    />
  ) : (
    <MailDetail
      mail={selectedMail}
      accounts={accounts}
      isLoadingBody={isLoadingDetail}
      onBack={isMobile ? () => workspace.setSelectedMailId(null) : undefined}
      onToggleStar={workspace.handleToggleStar}
      onMarkAsUnread={workspace.handleMarkAsUnread}
      onDelete={workspace.handleDeleteMail}
      onArchive={(mailId, accountId) => workspace.handleMoveMailFromInbox(mailId, accountId, ARCHIVE_FOLDER_ID)}
      onReply={handleReply}
      onReplyAll={handleReplyAll}
      onForward={handleForward}
      folders={mailOrg.folders}
      onMove={workspace.handleMoveMailFromInbox}
      onToggleFolder={workspace.handleToggleMailFolder}
      onSnooze={handleSnooze}
      onMute={mailOrg.handleMuteSender}
      isMuted={!!selectedMailStub && mailOrg.mutedSet.has(selectedMailStub.fromEmail)}
    />
  )

  const folderListPane = (
    <MailList
      mails={workspace.folderMails}
      selectedMailId={workspace.selectedMailId}
      focusedMailId={workspace.focusedMailId}
      onSelectMail={handleSelectMail}
      onToggleStar={workspace.handleToggleStar}
      checkedIds={workspace.checkedMailIds}
      onToggleCheck={workspace.handleToggleCheck}
      onCheckRange={workspace.handleCheckRange}
      onSelectByFilter={workspace.handleSelectByFilterInFolder}
      onClearChecked={() => workspace.setCheckedMailIds(new Set())}
      onBulkMarkRead={workspace.handleBulkMarkReadInFolder}
      onBulkMarkUnread={workspace.handleBulkMarkUnreadInFolder}
      onBulkDelete={workspace.handleBulkDeleteInFolder}
      isBulkLoading={workspace.isBulkLoading}
      onBulkArchive={view === "archive" ? undefined : () => workspace.handleBulkMoveFromFolder(ARCHIVE_FOLDER_ID)}
      folders={mailOrg.folders}
      currentFolderId={selectedFolderId ?? undefined}
      onBulkMove={workspace.handleBulkMoveFromFolder}
    />
  )

  const folderDetailPane = composeState ? (
    <ComposeView
      accounts={accounts}
      mails={allMails}
      quickReplies={mailOrg.quickReplies}
      title={composeState.title}
      defaultAccountId={composeState.accountId}
      defaultTo={composeState.to}
      defaultCc={composeState.cc}
      defaultBcc={composeState.bcc}
      defaultSubject={composeState.subject}
      defaultBody={composeState.body}
      defaultForwardedAttachments={composeState.forwardedAttachments}
      defaultDraftId={composeState.draftId}
      onDraftSaved={mailOrg.handleDraftSaved}
      onDraftDeleted={mailOrg.handleDraftDeleted}
      onBack={isMobile ? handleCancelCompose : undefined}
      onCancel={handleCancelCompose}
      onSent={handleComposeSent}
    />
  ) : (
    <MailDetail
      mail={selectedMail}
      accounts={accounts}
      isLoadingBody={isLoadingDetail}
      onBack={isMobile ? () => workspace.setSelectedMailId(null) : undefined}
      onToggleStar={workspace.handleToggleStar}
      onMarkAsUnread={workspace.handleMarkAsUnread}
      onDelete={workspace.handleDeleteMail}
      onArchive={
        view === "archive"
          ? undefined
          : (mailId, accountId) => workspace.handleMoveMailFromFolder(mailId, accountId, ARCHIVE_FOLDER_ID)
      }
      onReply={handleReply}
      onReplyAll={handleReplyAll}
      onForward={handleForward}
      folders={mailOrg.folders}
      currentFolderId={selectedFolderId ?? undefined}
      onMove={workspace.handleMoveMailFromFolder}
      onToggleFolder={workspace.handleToggleMailFolder}
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
        isStarredView={view === "starred"}
        isCleanupView={view === "cleanup"}
        isTrashView={view === "trash"}
        isArchiveView={view === "archive"}
        isMemoView={view === "memo"}
        isDraftsView={view === "drafts"}
        draftCount={mailOrg.drafts.length}
        isSnoozeView={view === "snoozed"}
        snoozeCount={Object.values(mailOrg.snoozed).filter((until) => until > Date.now()).length}
        isMutedView={view === "muted"}
        folders={mailOrg.folders}
        selectedFolderId={selectedFolderId}
        isFolderView={view === "folder"}
        onSelectAccount={goToInbox}
        onGoHome={goHome}
        onGoCleanup={goToCleanup}
        onGoTrash={goToTrash}
        onGoArchive={goToArchive}
        onGoStarred={goToStarred}
        onGoMemo={goToMemo}
        onGoDrafts={goToDrafts}
        onGoSnooze={goToSnooze}
        onGoMuted={goToMuted}
        onSelectFolder={goToFolder}
        onCreateFolder={mailOrg.handleCreateFolder}
        onRenameFolder={mailOrg.handleRenameFolder}
        onDeleteFolder={handleDeleteFolder}
        onReorderFolders={mailOrg.handleReorderFolders}
        onReorderAccounts={workspace.handleReorderAccounts}
        onLogout={handleLogout}
        onCompose={sendableAccounts.length > 0 ? handleOpenCompose : undefined}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-background px-5">
          <SidebarTrigger />
          <span className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight">
            {view === "home"
              ? "홈"
              : view === "cleanup"
                ? "정리하기"
                : view === "trash"
                  ? "휴지통"
                  : view === "archive"
                    ? "보관함"
                    : view === "starred"
                      ? "중요 메일"
                    : view === "memo"
                      ? "메모"
                      : view === "drafts"
                      ? "임시보관함"
                      : view === "snoozed"
                      ? "스누즈"
                      : view === "muted"
                      ? "뮤트"
                      : view === "folder"
                      ? (mailOrg.folders.find((f) => f.id === selectedFolderId)?.name ?? "분류 메일함")
                      : selectedAccountId
                      ? (() => {
                          const account = accounts.find((a) => a.id === selectedAccountId)
                          return account?.provider === "gmail" || account?.provider === "naver" || account?.provider === "daum"
                            ? account.email
                            : account?.label
                        })()
                      : "전체 받은편지함"}
          </span>
          {(view === "inbox" || view === "starred" || view === "trash" || view === "folder" || view === "archive") && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              title="새로고침"
              onClick={workspace.handleManualRefresh}
              disabled={workspace.isRefreshing}
            >
              <RefreshCw className={cn("size-4", workspace.isRefreshing && "animate-spin")} />
            </Button>
          )}
          <NotificationBell
            notifications={mailOrg.notifications}
            onMarkRead={mailOrg.handleMarkNotificationRead}
            onMarkAllRead={mailOrg.handleMarkAllNotificationsRead}
            onDismiss={mailOrg.handleDismissNotification}
          />
          {(view === "inbox" || view === "starred") && sendableAccounts.length > 0 && isMobile && (
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
            snoozedCount={Object.values(mailOrg.snoozed).filter((until) => until > Date.now()).length}
            trashCount={workspace.trashMails.length}
            currentUserEmail={currentUser?.email}
            onSelectAccount={goToInbox}
            onCompose={sendableAccounts.length > 0 ? handleOpenCompose : undefined}
            onGoToCleanup={goToCleanup}
            onGoToMemo={goToMemo}
            onGoToDrafts={goToDrafts}
            onGoToTrash={goToTrash}
            onGoToStarred={goToStarred}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        ) : view === "cleanup" ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            <CleanupView
              accounts={accounts}
              mails={allMails}
              onMarkAllRead={workspace.handleMarkAllRead}
              onDeleteBeforeDate={workspace.handleDeleteBeforeDate}
              onEmptyTrashAccount={workspace.handleEmptyTrashAccount}
              onUpdateSignature={workspace.handleUpdateSignature}
              folders={mailOrg.folders}
              rules={mailOrg.rules}
              onCreateRule={mailOrg.handleCreateRule}
              onToggleRule={mailOrg.handleToggleRule}
              onUpdateRule={mailOrg.handleUpdateRule}
              onDeleteRule={mailOrg.handleDeleteRule}
              onApplyRuleToExisting={mailOrg.handleApplyRuleToExisting}
              quickReplies={mailOrg.quickReplies}
              onCreateQuickReply={mailOrg.handleCreateQuickReply}
              onUpdateQuickReply={mailOrg.handleUpdateQuickReply}
              onDeleteQuickReply={mailOrg.handleDeleteQuickReply}
            />
          </div>
        ) : view === "trash" ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            <TrashView
              accounts={accounts}
              mails={workspace.trashMails}
              isLoading={workspace.isTrashLoading}
              hasMore={!!workspace.trashCursor}
              isLoadingMore={workspace.isTrashLoadingMore}
              onLoadMore={workspace.handleLoadMoreTrash}
              onEmptyAccount={workspace.handleEmptyTrashAccount}
              onEmptyAllAccounts={workspace.handleEmptyAllTrash}
              onDeleteSelected={workspace.handleDeleteFromTrash}
              onRestoreSelected={workspace.handleRestoreFromTrash}
            />
          </div>
        ) : view === "memo" ? (
          <MemoView
            memos={mailOrg.memos}
            onCreate={mailOrg.handleCreateMemo}
            onUpdateContent={mailOrg.handleUpdateMemoContent}
            onDelete={mailOrg.handleDeleteMemo}
          />
        ) : view === "drafts" ? (
          composeState ? (
            <div className="min-h-0 flex-1">{mailDetailPane}</div>
          ) : (
            <DraftsView
              drafts={mailOrg.drafts}
              accounts={accounts}
              onOpenDraft={handleOpenDraft}
              onDeleteDraft={mailOrg.handleDeleteDraft}
            />
          )
        ) : view === "snoozed" || view === "muted" ? (
          <SnoozeMuteView
            activeTab={view}
            mails={allMails}
            accounts={accounts}
            snoozed={mailOrg.snoozed}
            muted={mailOrg.muted}
            onTabChange={(tab) => tab === "snoozed" ? goToSnooze() : goToMuted()}
            onUnsnooze={mailOrg.handleUnsnooze}
            onUnmute={(email) => mailOrg.handleMuteSender(email)}
            onSelectMail={handleSnoozedMailSelect}
          />
        ) : view === "folder" || view === "archive" ? (
          workspace.isFolderLoading && workspace.folderMails.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="text-muted-foreground size-6 animate-spin" />
            </div>
          ) : isMobile ? (
            <div className="min-h-0 flex-1">
              {workspace.selectedMailId || composeState ? folderDetailPane : folderListPane}
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
            {workspace.selectedMailId || composeState ? mailDetailPane : mailListPane}
          </div>
        ) : (
          <ResizablePanelGroup groupRef={mailSnap.groupRef} onLayoutChange={mailSnap.onLayoutChange} orientation="horizontal" className="flex-1">
            <ResizablePanel id="list-panel" defaultSize="40" minSize="34" maxSize="54" className="overflow-hidden bg-background">
              {mailListPane}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel id="detail-panel" defaultSize="60" minSize="42" className="overflow-hidden bg-background">
              {mailDetailPane}
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </SidebarInset>
      {workspace.failedAccountIds.length > 0 && (() => {
        const failedAccounts = accounts.filter((a) => workspace.failedAccountIds.includes(a.id))
        const hasImapOrNaver = failedAccounts.some((a) => a.provider === "naver" || a.provider === "daum" || a.provider === "imap")
        if (!hasImapOrNaver) return null
        const names = failedAccounts.map((a) => a.email ?? a.label).join(", ")
        return (
          <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 max-w-sm w-full mx-4 rounded-md bg-amber-500 px-4 py-2.5 text-sm text-white shadow-lg">
            <p className="font-medium">{names} — 일시적 연결 오류</p>
            <p className="mt-0.5 text-amber-100">사이트 문제가 아니라 메일 서버가 잠시 응답하지 않는 것으로, 시간이 지나면 자동으로 복구됩니다.</p>
          </div>
        )
      })()}
      {errorMessage && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-md bg-destructive px-4 py-2 text-sm text-white shadow-lg">
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
      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        accounts={accounts}
        onAccountConnected={workspace.loadAccountsAndMails}
        onAccountDeleted={handleDeleteAccount}
      />
    </SidebarProvider>
  )
}

export default App
