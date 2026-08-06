import { Loader2, Search, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { AccountSidebar } from "@/components/mail/account-sidebar"
import { CategoryTabs } from "@/components/mail/category-tabs"
import { MailDetail } from "@/components/mail/mail-detail"
import { MailList } from "@/components/mail/mail-list"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { useIsMobile } from "@/hooks/use-mobile"
import { HomeView } from "@/components/home/home-view"
import { LandingView } from "@/components/home/landing-view"
import {
  fetchAccounts,
  fetchCurrentUser,
  fetchMailDetail,
  fetchMails,
  logout,
  markAsRead,
  toggleStar,
} from "@/lib/api"
import type { Account, Mail, MailCategory } from "@/types/mail"

function isRealAccountId(accountId: string): boolean {
  return accountId.includes(":")
}

function App() {
  const isMobile = useIsMobile()
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string } | null>(null)
  const [view, setView] = useState<"home" | "inbox">("home")
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<MailCategory | null>(null)
  const [selectedMailId, setSelectedMailId] = useState<string | null>(null)
  const [realAccounts, setRealAccounts] = useState<Account[]>([])
  const [realMails, setRealMails] = useState<Mail[]>([])
  const [mailDetails, setMailDetails] = useState<Record<string, Mail>>({})
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const loadAccountsAndMails = () => {
    return fetchAccounts().then((accounts) => {
      setRealAccounts(accounts)
      if (accounts.length > 0) {
        return fetchMails().then(({ mails, nextCursor: cursor }) => {
          setRealMails(mails)
          setNextCursor(cursor)
        })
      }
    })
  }

  useEffect(() => {
    fetchCurrentUser()
      .then((user) => {
        setCurrentUser(user)
        if (user) return loadAccountsAndMails()
      })
      .finally(() => setIsBootstrapping(false))
  }, [])

  // 탭이 보일 때만 60초마다 자동 새로고침
  useEffect(() => {
    if (!currentUser) return
    const poll = () => { if (!document.hidden) loadAccountsAndMails() }
    const interval = setInterval(poll, 60_000)
    document.addEventListener("visibilitychange", poll)
    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", poll)
    }
  }, [currentUser])

  const accounts = realAccounts
  const allMails = realMails

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

  const selectedMailStub = visibleMails.find((mail) => mail.id === selectedMailId) ?? null

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
    setSelectedMailId(mailId)
    if (!mailId) return
    const mail = allMails.find((m) => m.id === mailId)
    if (mail && !mail.isRead) {
      setRealMails((prev) => prev.map((m) => (m.id === mailId ? { ...m, isRead: true } : m)))
      markAsRead(mailId, mail.accountId)
    }
  }

  const handleToggleStar = (mailId: string, accountId: string, starred: boolean) => {
    setRealMails((prev) =>
      prev.map((m) => (m.id === mailId && m.accountId === accountId ? { ...m, isStarred: starred } : m)),
    )
    setMailDetails((prev) => {
      const detail = prev[mailId]
      if (!detail) return prev
      return { ...prev, [mailId]: { ...detail, isStarred: starred } }
    })
    toggleStar(mailId, accountId, starred)
  }

  const handleLoadMore = async () => {
    if (!nextCursor || isLoadingMore) return
    setIsLoadingMore(true)
    try {
      const { mails, nextCursor: newCursor } = await fetchMails(nextCursor)
      setRealMails((prev) => {
        const existingIds = new Set(prev.map((m) => `${m.accountId}:${m.id}`))
        const fresh = mails.filter((m) => !existingIds.has(`${m.accountId}:${m.id}`))
        return [...prev, ...fresh]
      })
      setNextCursor(newCursor)
    } finally {
      setIsLoadingMore(false)
    }
  }

  const goToInbox = (accountId: string | null) => {
    setView("inbox")
    setSelectedAccountId(accountId)
    setSelectedCategory(null)
    setSelectedMailId(null)
    setSearchQuery("")
  }

  const goHome = () => {
    setView("home")
    setSelectedAccountId(null)
    setSelectedCategory(null)
    setSelectedMailId(null)
    setSearchQuery("")
  }

  const handleLogout = async () => {
    await logout()
    setCurrentUser(null)
    setRealAccounts([])
    setRealMails([])
    setMailDetails({})
    setNextCursor(null)
    goHome()
  }

  const handleDeleteAccount = (accountId: string) => {
    setRealAccounts((prev) => prev.filter((a) => a.id !== accountId))
    setRealMails((prev) => prev.filter((m) => m.accountId !== accountId))
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
          hasMore={!searchQuery && !!nextCursor}
          isLoadingMore={isLoadingMore}
          onLoadMore={handleLoadMore}
        />
      </div>
    </div>
  )

  const mailDetailPane = (
    <MailDetail
      mail={selectedMail}
      accounts={accounts}
      isLoadingBody={isLoadingDetail}
      onBack={isMobile ? () => setSelectedMailId(null) : undefined}
      onToggleStar={handleToggleStar}
    />
  )

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AccountSidebar
        accounts={accounts}
        unreadCountByAccount={unreadCountByAccount}
        selectedAccountId={selectedAccountId}
        isInboxView={view === "inbox"}
        onSelectAccount={goToInbox}
        onGoHome={goHome}
        onAccountConnected={loadAccountsAndMails}
        onDeleteAccount={handleDeleteAccount}
        onLogout={handleLogout}
      />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <span className="truncate text-sm font-medium">
            {view === "home"
              ? "홈"
              : selectedAccountId
                ? (() => {
                    const account = accounts.find((a) => a.id === selectedAccountId)
                    return account?.provider === "gmail" || account?.provider === "naver" || account?.provider === "daum"
                      ? account.email
                      : account?.label
                  })()
                : "전체 받은편지함"}
          </span>
        </header>
        {view === "home" ? (
          <HomeView
            accounts={accounts}
            mails={allMails}
            unreadCountByAccount={unreadCountByAccount}
            onSelectAccount={goToInbox}
          />
        ) : isMobile ? (
          <div className="min-h-0 flex-1">
            {selectedMailId ? mailDetailPane : mailListPane}
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
    </SidebarProvider>
  )
}

export default App
