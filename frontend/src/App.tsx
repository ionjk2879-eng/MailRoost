import { useEffect, useMemo, useState } from "react"
import { AccountSidebar } from "@/components/mail/account-sidebar"
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
import type { Account, Mail } from "@/types/mail"

const REAL_ACCOUNT_PREFIX = "gmail:"

function App() {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
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

  const visibleMails = useMemo(() => {
    const mails = selectedAccountId
      ? allMails.filter((mail) => mail.accountId === selectedAccountId)
      : allMails
    return [...mails].sort(
      (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
    )
  }, [allMails, selectedAccountId])

  const selectedMailStub = visibleMails.find((mail) => mail.id === selectedMailId) ?? null

  useEffect(() => {
    if (!selectedMailStub || !selectedMailStub.accountId.startsWith(REAL_ACCOUNT_PREFIX)) return
    if (mailDetails[selectedMailStub.id]) return
    fetchMailDetail(selectedMailStub.id, selectedMailStub.accountId).then((detail) => {
      if (detail) setMailDetails((prev) => ({ ...prev, [detail.id]: detail }))
    })
  }, [selectedMailStub, mailDetails])

  const selectedMail = selectedMailStub
    ? (mailDetails[selectedMailStub.id] ?? selectedMailStub)
    : null

  return (
    <SidebarProvider>
      <AccountSidebar
        accounts={accounts}
        unreadCountByAccount={unreadCountByAccount}
        selectedAccountId={selectedAccountId}
        onSelectAccount={(accountId) => {
          setSelectedAccountId(accountId)
          setSelectedMailId(null)
        }}
        isGmailConnected={isGmailConnected}
      />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <span className="text-sm font-medium">
            {selectedAccountId
              ? accounts.find((a) => a.id === selectedAccountId)?.label
              : "전체 받은편지함"}
          </span>
        </header>
        <ResizablePanelGroup orientation="horizontal" className="flex-1">
          <ResizablePanel defaultSize="38" minSize="25" maxSize="55">
            <MailList
              mails={visibleMails}
              accounts={accounts}
              selectedMailId={selectedMailId}
              onSelectMail={setSelectedMailId}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="62">
            <MailDetail mail={selectedMail} accounts={accounts} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default App
