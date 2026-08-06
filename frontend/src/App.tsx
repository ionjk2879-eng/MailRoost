import { Loader2 } from "lucide-react"
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
import { fetchAccounts, fetchMailDetail, fetchMails, logout } from "@/lib/api"
import type { Account, Mail, MailCategory } from "@/types/mail"

function isRealAccountId(accountId: string): boolean {
  return accountId.includes(":")
}

function App() {
  const isMobile = useIsMobile()
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [view, setView] = useState<"home" | "inbox">("home")
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<MailCategory | null>(null)
  const [selectedMailId, setSelectedMailId] = useState<string | null>(null)
  const [realAccounts, setRealAccounts] = useState<Account[]>([])
  const [realMails, setRealMails] = useState<Mail[]>([])
  const [mailDetails, setMailDetails] = useState<Record<string, Mail>>({})

  const loadAccountsAndMails = () => {
    return fetchAccounts().then((accounts) => {
      setRealAccounts(accounts)
      if (accounts.length > 0) {
        return fetchMails().then(setRealMails)
      }
    })
  }

  useEffect(() => {
    loadAccountsAndMails().finally(() => setIsBootstrapping(false))
  }, [])

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
      primary: 0,
      social: 0,
      promotions: 0,
      updates: 0,
      forums: 0,
    }
    for (const mail of accountMails) {
      counts[mail.category] += 1
    }
    return counts
  }, [accountMails])

  const visibleMails = useMemo(() => {
    const mails = selectedCategory
      ? accountMails.filter((mail) => mail.category === selectedCategory)
      : accountMails
    return [...mails].sort(
      (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
    )
  }, [accountMails, selectedCategory])

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

  const goToInbox = (accountId: string | null) => {
    setView("inbox")
    setSelectedAccountId(accountId)
    setSelectedCategory(null)
    setSelectedMailId(null)
  }

  const goHome = () => {
    setView("home")
    setSelectedAccountId(null)
    setSelectedCategory(null)
    setSelectedMailId(null)
  }

  const handleLogout = async () => {
    await logout()
    setRealAccounts([])
    setRealMails([])
    setMailDetails({})
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

  if (realAccounts.length === 0) {
    return <LandingView onConnected={loadAccountsAndMails} />
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
      <div className="min-h-0 flex-1">
        <MailList
          mails={visibleMails}
          accounts={accounts}
          selectedMailId={selectedMailId}
          onSelectMail={setSelectedMailId}
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
                    return account?.provider === "gmail" || account?.provider === "naver"
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
