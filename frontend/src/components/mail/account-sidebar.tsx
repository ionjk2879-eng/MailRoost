import { Archive, FileEdit, Folder, FolderPlus, Inbox, LogOut, Pencil, Plus, Sparkles, StickyNote, Trash2 } from "lucide-react"
import { useState } from "react"
import type { DragEvent } from "react"
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
import { cn } from "@/lib/utils"
import type { Account, MailFolder } from "@/types/mail"

// 목록을 드래그로 재정렬하기 위한 최소한의 네이티브 HTML5 DnD 헬퍼.
// 리스트마다 독립적인 인스턴스를 써야 하므로 훅으로 분리했다.
function useDragReorder(ids: string[], onReorder: (order: string[]) => void) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  const handleDragStart = (id: string) => (e: DragEvent) => {
    setDraggingId(id)
    e.dataTransfer.effectAllowed = "move"
  }

  const handleDragOver = (id: string) => (e: DragEvent) => {
    e.preventDefault()
    if (id !== draggingId) setOverId(id)
  }

  const handleDrop = (id: string) => (e: DragEvent) => {
    e.preventDefault()
    setOverId(null)
    if (!draggingId || draggingId === id) return
    const from = ids.indexOf(draggingId)
    const to = ids.indexOf(id)
    setDraggingId(null)
    if (from === -1 || to === -1) return
    const next = [...ids]
    next.splice(from, 1)
    next.splice(to, 0, draggingId)
    onReorder(next)
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setOverId(null)
  }

  return { draggingId, overId, handleDragStart, handleDragOver, handleDrop, handleDragEnd }
}

function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100
  const lNorm = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = sNorm * Math.min(lNorm, 1 - lNorm)
  const f = (n: number) => lNorm - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0")
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`
}

// 분류 색상 빠른 선택용 프리셋. 색상환을 고르게 돌면서 채도/명도는 백엔드의 랜덤 배정과 같은
// 범위(너무 탁하거나 형광색이지 않고, 너무 어둡거나 밝지 않은)로 고정해 한눈에 잘 들어오게 한다.
const FOLDER_COLOR_PRESETS = Array.from({ length: 18 }, (_, i) => {
  const hue = Math.round((360 / 18) * i)
  const lightness = i % 2 === 0 ? 52 : 60 // 색상마다 명도를 살짝 번갈아 더 잘 구분되게 함
  return hslToHex(hue, 65, lightness)
})

interface AccountSidebarProps {
  accounts: Account[]
  unreadCountByAccount: Record<string, number>
  selectedAccountId: string | null
  isInboxView: boolean
  isCleanupView: boolean
  isTrashView: boolean
  isArchiveView: boolean
  isMemoView: boolean
  isDraftsView: boolean
  draftCount: number
  folders: MailFolder[]
  selectedFolderId: string | null
  isFolderView: boolean
  onSelectAccount: (accountId: string | null) => void
  onGoHome: () => void
  onGoCleanup: () => void
  onGoTrash: () => void
  onGoArchive: () => void
  onGoMemo: () => void
  onGoDrafts: () => void
  onSelectFolder: (folderId: string) => void
  onCreateFolder: (name: string) => Promise<{ ok: boolean; error?: string }>
  onRenameFolder: (folderId: string, name: string, color: string) => Promise<{ ok: boolean; error?: string }>
  onDeleteFolder: (folderId: string) => void
  onReorderFolders: (order: string[]) => void
  onAccountConnected: () => void
  onDeleteAccount: (accountId: string) => void
  onReorderAccounts: (order: string[]) => void
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
  isMemoView,
  isDraftsView,
  draftCount,
  folders,
  selectedFolderId,
  isFolderView,
  onSelectAccount,
  onGoHome,
  onGoCleanup,
  onGoTrash,
  onGoArchive,
  onGoMemo,
  onGoDrafts,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onReorderFolders,
  onAccountConnected,
  onDeleteAccount,
  onReorderAccounts,
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
  const [renameColor, setRenameColor] = useState("#8b5cf6")
  const [renameError, setRenameError] = useState<string | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const accountDrag = useDragReorder(accounts.map((a) => a.id), onReorderAccounts)
  const folderDrag = useDragReorder(folders.map((f) => f.id), onReorderFolders)
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
      setCreateFolderError(result.error ?? "분류 생성에 실패했습니다.")
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
    const result = await onRenameFolder(pendingRenameFolder.id, name, renameColor)
    setIsRenaming(false)
    if (!result.ok) {
      setRenameError(result.error ?? "분류 변경에 실패했습니다.")
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
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isMemoView}
                  onClick={() => {
                    onGoMemo()
                    closeOnMobile()
                  }}
                >
                  <StickyNote />
                  <span>메모</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isDraftsView}
                  onClick={() => {
                    onGoDrafts()
                    closeOnMobile()
                  }}
                >
                  <FileEdit />
                  <span>임시보관함</span>
                </SidebarMenuButton>
                {draftCount > 0 && <SidebarMenuBadge>{draftCount}</SidebarMenuBadge>}
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
                  <SidebarMenuItem
                    key={account.id}
                    className={cn(
                      "group/item cursor-grab active:cursor-grabbing",
                      accountDrag.draggingId === account.id && "opacity-40",
                      accountDrag.overId === account.id && "border-primary border-t-2",
                    )}
                    draggable
                    onDragStart={accountDrag.handleDragStart(account.id)}
                    onDragOver={accountDrag.handleDragOver(account.id)}
                    onDrop={accountDrag.handleDrop(account.id)}
                    onDragEnd={accountDrag.handleDragEnd}
                  >
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
            <SidebarGroupLabel className="px-0">분류</SidebarGroupLabel>
            <button
              type="button"
              aria-label="새 분류"
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
                <SidebarMenuItem
                  key={folder.id}
                  className={cn(
                    "group/item cursor-grab active:cursor-grabbing",
                    folderDrag.draggingId === folder.id && "opacity-40",
                    folderDrag.overId === folder.id && "border-primary border-t-2",
                  )}
                  draggable
                  onDragStart={folderDrag.handleDragStart(folder.id)}
                  onDragOver={folderDrag.handleDragOver(folder.id)}
                  onDrop={folderDrag.handleDrop(folder.id)}
                  onDragEnd={folderDrag.handleDragEnd}
                >
                  <SidebarMenuButton
                    isActive={isFolderView && selectedFolderId === folder.id}
                    onClick={() => {
                      onSelectFolder(folder.id)
                      closeOnMobile()
                    }}
                    title={folder.name}
                  >
                    <Folder
                      className="size-4 shrink-0"
                      style={{ color: folder.color, fill: folder.color, fillOpacity: 0.25 }}
                    />
                    <span className="truncate">{folder.name}</span>
                  </SidebarMenuButton>
                  <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover/item:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      aria-label="분류 편집"
                      onClick={() => {
                        setRenameError(null)
                        setRenameValue(folder.name)
                        setRenameColor(folder.color)
                        setPendingRenameFolder(folder)
                      }}
                      className="hover:text-foreground rounded p-0.5"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="분류 삭제"
                      onClick={() => setPendingDeleteFolder(folder)}
                      className="hover:text-destructive rounded p-0.5"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </SidebarMenuItem>
              ))}
              {folders.length === 0 && (
                <p className="text-muted-foreground px-2 py-1 text-xs">분류가 없습니다.</p>
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
              <DialogTitle>새 분류 만들기</DialogTitle>
              <DialogDescription>
                MailRoost 안에서만 사용하는 분류예요. 메일 서버에는 반영되지 않아요.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5 py-4">
              <Label htmlFor="folder-name">분류 이름</Label>
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
              <DialogTitle>분류 편집</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="folder-rename">분류 이름</Label>
                <Input
                  id="folder-rename"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  maxLength={40}
                  required
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="folder-color">색상</Label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {FOLDER_COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRenameColor(preset)}
                      aria-label={`색상 ${preset}`}
                      className={cn(
                        "size-6 shrink-0 rounded-full ring-offset-background transition-transform hover:scale-110",
                        renameColor.toLowerCase() === preset && "ring-2 ring-offset-2",
                      )}
                      style={{ backgroundColor: preset, "--tw-ring-color": preset } as React.CSSProperties}
                    />
                  ))}
                  <input
                    id="folder-color"
                    type="color"
                    value={renameColor}
                    onChange={(e) => setRenameColor(e.target.value)}
                    aria-label="직접 색상 선택"
                    className="border-input bg-background h-6 w-8 shrink-0 cursor-pointer rounded-md border p-0.5"
                  />
                  <span className="text-muted-foreground text-sm">{renameColor}</span>
                </div>
              </div>
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
            <DialogTitle>분류 삭제</DialogTitle>
            <DialogDescription>
              <strong>{pendingDeleteFolder?.name}</strong> 분류를 삭제합니다. 이 분류에 있던 메일은
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
