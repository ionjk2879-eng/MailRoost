import { Archive, FolderPlus, Inbox, LogOut, Pencil, Plus, Sparkles, Trash2 } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ConnectNaverDialog } from "@/components/mail/connect-naver-dialog"
import { ConnectDaumDialog } from "@/components/mail/connect-daum-dialog"
import { ConnectImapDialog } from "@/components/mail/connect-imap-dialog"
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
import type { Account, MailFolder } from "@/types/mail"

interface AccountSidebarProps {
  accounts: Account[]
  unreadCountByAccount: Record<string, number>
  selectedAccountId: string | null
  isInboxView: boolean
  isCleanupView: boolean
  isTrashView: boolean
  isArchiveView: boolean
  folders: MailFolder[]
  selectedFolderId: string | null
  isFolderView: boolean
  onSelectAccount: (accountId: string | null) => void
  onGoHome: () => void
  onGoCleanup: () => void
  onGoTrash: () => void
  onGoArchive: () => void
  onSelectFolder: (folderId: string) => void
  onCreateFolder: (name: string) => Promise<{ ok: boolean; error?: string }>
  onRenameFolder: (folderId: string, name: string) => Promise<{ ok: boolean; error?: string }>
  onDeleteFolder: (folderId: string) => void
  onAccountConnected: () => void
  onDeleteAccount: (accountId: string) => void
  onLogout: () => void
}

export function AccountSidebar({
  accounts,
  unreadCountByAccount,
  selectedAccountId,
  isInboxView,
  isCleanupView,
  isTrashView,
  isArchiveView,
  folders,
  selectedFolderId,
  isFolderView,
  onSelectAccount,
  onGoHome,
  onGoCleanup,
  onGoTrash,
  onGoArchive,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onAccountConnected,
  onDeleteAccount,
  onLogout,
}: AccountSidebarProps) {
  const { isMobile, setOpenMobile } = useSidebar()
  const [pendingDelete, setPendingDelete] = useState<Account | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [createFolderError, setCreateFolderError] = useState<string | null>(null)
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [pendingDeleteFolder, setPendingDeleteFolder] = useState<MailFolder | null>(null)
  const [pendingRenameFolder, setPendingRenameFolder] = useState<MailFolder | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [renameError, setRenameError] = useState<string | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const connectedGmailCount = accounts.filter((a) => a.provider === "gmail").length
  const connectedNaverCount = accounts.filter((a) => a.provider === "naver").length
  const connectedDaumCount = accounts.filter((a) => a.provider === "daum").length
  const connectedImapCount = accounts.filter((a) => a.provider === "imap").length
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

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newFolderName.trim()
    if (!name) return
    setIsCreatingFolder(true)
    setCreateFolderError(null)
    const result = await onCreateFolder(name)
    setIsCreatingFolder(false)
    if (!result.ok) {
      setCreateFolderError(result.error ?? "메일함 생성에 실패했습니다.")
      return
    }
    setIsCreateFolderOpen(false)
    setNewFolderName("")
  }

  const handleRenameFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pendingRenameFolder) return
    const name = renameValue.trim()
    if (!name) return
    setIsRenaming(true)
    setRenameError(null)
    const result = await onRenameFolder(pendingRenameFolder.id, name)
    setIsRenaming(false)
    if (!result.ok) {
      setRenameError(result.error ?? "메일함 이름 변경에 실패했습니다.")
      return
    }
    setPendingRenameFolder(null)
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
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isCleanupView}
                  onClick={() => {
                    onGoCleanup()
                    closeOnMobile()
                  }}
                >
                  <Sparkles />
                  <span>정리하기</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isArchiveView}
                  onClick={() => {
                    onGoArchive()
                    closeOnMobile()
                  }}
                >
                  <Archive />
                  <span>보관함</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isTrashView}
                  onClick={() => {
                    onGoTrash()
                    closeOnMobile()
                  }}
                >
                  <Trash2 />
                  <span>휴지통</span>
                </SidebarMenuButton>
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
        <SidebarGroup>
          <div className="flex items-center justify-between px-2">
            <SidebarGroupLabel className="px-0">메일함</SidebarGroupLabel>
            <button
              type="button"
              aria-label="새 메일함"
              onClick={() => {
                setCreateFolderError(null)
                setNewFolderName("")
                setIsCreateFolderOpen(true)
              }}
              className="text-muted-foreground hover:text-foreground rounded p-1"
            >
              <FolderPlus className="size-3.5" />
            </button>
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {folders.map((folder) => (
                <SidebarMenuItem key={folder.id} className="group/item">
                  <SidebarMenuButton
                    isActive={isFolderView && selectedFolderId === folder.id}
                    onClick={() => {
                      onSelectFolder(folder.id)
                      closeOnMobile()
                    }}
                    title={folder.name}
                  >
                    <span className={`size-2 shrink-0 rounded-full ${folder.color}`} />
                    <span className="truncate">{folder.name}</span>
                  </SidebarMenuButton>
                  <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover/item:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      aria-label="메일함 이름 변경"
                      onClick={() => {
                        setRenameError(null)
                        setRenameValue(folder.name)
                        setPendingRenameFolder(folder)
                      }}
                      className="hover:text-foreground rounded p-0.5"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="메일함 삭제"
                      onClick={() => setPendingDeleteFolder(folder)}
                      className="hover:text-destructive rounded p-0.5"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </SidebarMenuItem>
              ))}
              {folders.length === 0 && (
                <p className="text-muted-foreground px-2 py-1 text-xs">메일함이 없습니다.</p>
              )}
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
        <ConnectDaumDialog
          label={connectedDaumCount > 0 ? "다음 계정 추가" : "다음 메일 연결"}
          onConnected={onAccountConnected}
        />
        <ConnectImapDialog
          label={connectedImapCount > 0 ? "IMAP 계정 추가" : "IMAP 계정 연결"}
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

      <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
        <DialogContent>
          <form onSubmit={handleCreateFolder}>
            <DialogHeader>
              <DialogTitle>새 메일함 만들기</DialogTitle>
              <DialogDescription>
                MailRoost 안에서만 사용하는 메일함이에요. 메일 서버에는 반영되지 않아요.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5 py-4">
              <Label htmlFor="folder-name">메일함 이름</Label>
              <Input
                id="folder-name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                maxLength={40}
                required
                autoFocus
              />
              {createFolderError && <p className="text-destructive text-sm">{createFolderError}</p>}
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" disabled={isCreatingFolder} />}>
                취소
              </DialogClose>
              <Button type="submit" disabled={isCreatingFolder}>
                {isCreatingFolder ? "만드는 중..." : "만들기"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingRenameFolder !== null}
        onOpenChange={(open) => { if (!open) setPendingRenameFolder(null) }}
      >
        <DialogContent>
          <form onSubmit={handleRenameFolder}>
            <DialogHeader>
              <DialogTitle>메일함 이름 변경</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-1.5 py-4">
              <Label htmlFor="folder-rename">메일함 이름</Label>
              <Input
                id="folder-rename"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                maxLength={40}
                required
                autoFocus
              />
              {renameError && <p className="text-destructive text-sm">{renameError}</p>}
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" disabled={isRenaming} />}>
                취소
              </DialogClose>
              <Button type="submit" disabled={isRenaming}>
                {isRenaming ? "변경 중..." : "변경"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingDeleteFolder !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteFolder(null) }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>메일함 삭제</DialogTitle>
            <DialogDescription>
              <strong>{pendingDeleteFolder?.name}</strong> 메일함을 삭제합니다. 이 메일함에 있던 메일은
              받은편지함으로 돌아갑니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>취소</DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingDeleteFolder) onDeleteFolder(pendingDeleteFolder.id)
                setPendingDeleteFolder(null)
              }}
            >
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sidebar>
  )
}
