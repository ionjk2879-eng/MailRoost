import { Inbox, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
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
} from "@/components/ui/sidebar"
import { gmailLoginUrl } from "@/lib/api"
import type { Account } from "@/types/mail"

interface AccountSidebarProps {
  accounts: Account[]
  unreadCountByAccount: Record<string, number>
  selectedAccountId: string | null
  onSelectAccount: (accountId: string | null) => void
  isGmailConnected: boolean
}

export function AccountSidebar({
  accounts,
  unreadCountByAccount,
  selectedAccountId,
  onSelectAccount,
  isGmailConnected,
}: AccountSidebarProps) {
  const totalUnread = Object.values(unreadCountByAccount).reduce(
    (sum, count) => sum + count,
    0,
  )

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-3">
        <span className="text-lg font-semibold">MailRoost</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={selectedAccountId === null}
                  onClick={() => onSelectAccount(null)}
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
                return (
                  <SidebarMenuItem key={account.id}>
                    <SidebarMenuButton
                      isActive={selectedAccountId === account.id}
                      onClick={() => onSelectAccount(account.id)}
                    >
                      <span
                        className={`size-2 shrink-0 rounded-full ${account.color}`}
                      />
                      <span className="truncate">{account.label}</span>
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
      {!isGmailConnected && (
        <SidebarFooter className="p-3">
          <Button
            render={<a href={gmailLoginUrl} />}
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
          >
            <Plus className="size-4" />
            Gmail 계정 연결
          </Button>
        </SidebarFooter>
      )}
    </Sidebar>
  )
}
