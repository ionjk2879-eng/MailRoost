import { Inbox, LogOut, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { deleteAccount, gmailLoginUrl } from "@/lib/api"
import type { Account } from "@/types/mail"

interface AccountSidebarProps {
  accounts: Account[]
  unreadCountByAccount: Record<string, number>
  selectedAccountId: string | null
  isInboxView: boolean
  onSelectAccount: (accountId: string | null) => void
  onGoHome: () => void
  onAccountConnected: () => void
  onDeleteAccount: (accountId: string) => void
  onLogout: () => void
}

export function AccountSidebar({
  accounts,
  unreadCountByAccount,
  selectedAccountId,
  isInboxView,
  onSelectAccount,
  onGoHome,
  onAccountConnected,
  onDeleteAccount,
  onLogout,
}: AccountSidebarProps) {
  const { isMobile, setOpenMobile } = useSidebar()
  const [pendingDelete, setPendingDelete] = useState<Account | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const connectedGmailCount = accounts.filter((a) => a.provider === "gmail").length
  const connectedNaverCount = accounts.filter((a) => a.provider === "naver").length
  const hasRealAccounts = accounts.some((a) => a.id.includes(":"))
  const totalUnread = Object.values(unreadCountByAccount).reduce(
    (sum, count) => sum + count,
    0,
  )

  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false)
  }

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return
    setIsDeleting(true)
    setDeleteError(null)
    const result = await deleteAccount(pendingDelete.id)
    setIsDeleting(false)
    if (!result.ok) {
      setDeleteError(result.error ?? "삭제에 실패했습니다.")
      return
    }
    setPendingDelete(null)
    onDeleteAccount(pendingDelete.id)
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
                const isReal = account.id.includes(":")
                const displayText =
                  account.provider === "gmail" || account.provider === "naver"
                    ? account.email
                    : account.label
                return (
                  <SidebarMenuItem key={account.id} className="group/item">
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
                    {isReal ? (
                      <button
                        type="button"
                        aria-label="계정 삭제"
                        onClick={() => {
                          setDeleteError(null)
                          setPendingDelete(account)
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 opacity-0 transition-opacity hover:text-destructive group-hover/item:opacity-100 focus-visible:opacity-100"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : (
                      unread > 0 && <SidebarMenuBadge>{unread}</SidebarMenuBadge>
                    )}
                    {isReal && unread > 0 && (
                      <SidebarMenuBadge className="group-hover/item:hidden">{unread}</SidebarMenuBadge>
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
        {hasRealAccounts && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground w-full justify-start gap-2"
            onClick={onLogout}
          >
            <LogOut className="size-4" />
            로그아웃
          </Button>
        )}
      </SidebarFooter>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null) }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>계정 연결 해제</DialogTitle>
            <DialogDescription>
              <strong>{pendingDelete?.email}</strong> 계정을 MailRoost에서 삭제합니다.
              저장된 토큰이 제거되며, 다시 연결하려면 계정을 다시 추가해야 합니다.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-destructive text-sm">{deleteError}</p>}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={isDeleting} />}>
              취소
            </DialogClose>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={isDeleting}>
              {isDeleting ? "삭제 중..." : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sidebar>
  )
}
