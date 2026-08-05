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
import { fetchAccounts, fetchMailDetail, fetchMails } from "@/lib/api"
import { mockAccounts, mockMails } from "@/lib/mock-data"
import type { Account, Mail, MailCategory } from "@/types/mail"

const REAL_ACCOUNT_PREFIX = "gmail:"

function App() {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<MailCategory | null>(null)
  const [selectedMailId, setSelectedMailId] = useState<string | null>(null)
  const [realAccounts, setRealAccounts] = useState<Account[]>([])
  const [realMails, setRealMails] = useState<Mail[]>([])
  const [mailDetails, setMailDetails] = useState<Record<string, Mail>>({})

  useEffect(() => {
    fetchAccounts().then((accounts) => {
      setRealAccounts(accounts)
      if (accounts.length > 0) {
        fetchMails().then(setRealMails)
      }
    })
  }, [])

  const isGmailConnected = realAccounts.some((a) => a.provider === "gmail")

  const accounts = useMemo(() => {
    const mockWithoutGmail = isGmailConnected
      ? mockAccounts.filter((a) => a.provider !== "gmail")
      : mockAccounts
    return [...realAccounts, ...mockWithoutGmail]
  }, [realAccounts, isGmailConnected])

  const allMails = useMemo(() => {
    const mockWithoutGmail = isGmailConnected
      ? mockMails.filter((m) => !m.accountId.startsWith("acc-gmail"))
      : mockMails
    return [...realMails, ...mockWithoutGmail]
  }, [realMails, isGmailConnected])

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
    if (!selectedMailStub || !selectedMailStub.accountId.startsWith(REAL_ACCOUNT_PREFIX)) return
    if (mailDetails[selectedMailStub.id]) return
    fetchMailDetail(selectedMailStub.id, selectedMailStub.accountId).then((detail) => {
      if (detail) setMailDetails((prev) => ({ ...prev, [detail.id]: detail }))
    })
  }, [selectedMailStub, mailDetails])

  const isLoadingDetail =
    selectedMailStub !== null &&
    selectedMailStub.accountId.startsWith(REAL_ACCOUNT_PREFIX) &&
    !mailDetails[selectedMailStub.id]

  const selectedMail = selectedMailStub
    ? (mailDetails[selectedMailStub.id] ?? selectedMailStub)
    : null

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AccountSidebar
        accounts={accounts}
        unreadCountByAccount={unreadCountByAccount}
        selectedAccountId={selectedAccountId}
        onSelectAccount={(accountId) => {
          setSelectedAccountId(accountId)
          setSelectedCategory(null)
          setSelectedMailId(null)
        }}
      />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <span className="text-sm font-medium">
            {selectedAccountId
              ? (() => {
                  const account = accounts.find((a) => a.id === selectedAccountId)
                  return account?.provider === "gmail" ? account.email : account?.label
                })()
              : "전체 받은편지함"}
          </span>
        </header>
        <ResizablePanelGroup orientation="horizontal" className="flex-1">
          <ResizablePanel defaultSize="38" minSize="25" maxSize="55" className="overflow-hidden">
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
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="62" className="overflow-hidden">
            <MailDetail mail={selectedMail} accounts={accounts} isLoadingBody={isLoadingDetail} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default App
