import { Inbox, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConnectNaverDialog } from "@/components/mail/connect-naver-dialog"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { gmailLoginUrl } from "@/lib/api"
import type { Account } from "@/types/mail"

interface AccountSidebarProps {
  accounts: Account[]
  unreadCountByAccount: Record<string, number>
  selectedAccountId: string | null
  isInboxView: boolean
  onSelectAccount: (accountId: string | null) => void
  onGoHome: () => void
  onAccountConnected: () => void
}

export function AccountSidebar({
  accounts,
  unreadCountByAccount,
  selectedAccountId,
  isInboxView,
  onSelectAccount,
  onGoHome,
  onAccountConnected,
}: AccountSidebarProps) {
  const { isMobile, setOpenMobile } = useSidebar()
  const connectedGmailCount = accounts.filter((a) => a.provider === "gmail").length
  const connectedNaverCount = accounts.filter((a) => a.provider === "naver").length
  const totalUnread = Object.values(unreadCountByAccount).reduce(
    (sum, count) => sum + count,
    0,
  )

  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-3">
        <button
          type="button"
          onClick={() => {
            onGoHome()
            closeOnMobile()
          }}
          className="cursor-pointer rounded-md text-lg font-semibold outline-none transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring"
        >
          MailRoost
        </button>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isInboxView && selectedAccountId === null}
                  onClick={() => {
                    onSelectAccount(null)
                    closeOnMobile()
                  }}
                >
                  <Inbox />
                  <span>전체 받은편지함</span>
                </SidebarMenuButton>
                {totalUnread > 0 && (
                  <SidebarMenuBadge>{totalUnread}</SidebarMenuBadge>
                )}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>계정</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {accounts.map((account) => {
                const unread = unreadCountByAccount[account.id] ?? 0
                const displayText =
                  account.provider === "gmail" || account.provider === "naver"
                    ? account.email
                    : account.label
                return (
                  <SidebarMenuItem key={account.id}>
                    <SidebarMenuButton
                      isActive={isInboxView && selectedAccountId === account.id}
                      onClick={() => {
                        onSelectAccount(account.id)
                        closeOnMobile()
                      }}
                      title={account.email}
                    >
                      <span
                        className={`size-2 shrink-0 rounded-full ${account.color}`}
                      />
                      <span className="truncate">{displayText}</span>
                    </SidebarMenuButton>
                    {unread > 0 && (
                      <SidebarMenuBadge>{unread}</SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="flex-col gap-2 p-3">
        <Button
          render={<a href={gmailLoginUrl} />}
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
        >
          <Plus className="size-4" />
          {connectedGmailCount > 0 ? "Gmail 계정 추가" : "Gmail 계정 연결"}
        </Button>
        <ConnectNaverDialog
          label={connectedNaverCount > 0 ? "네이버 계정 추가" : "네이버 계정 연결"}
          onConnected={onAccountConnected}
        />
      </SidebarFooter>
    </Sidebar>
  )
}
