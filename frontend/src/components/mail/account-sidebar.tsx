import { AlarmClock, Archive, ChevronDown, FileEdit, Folder, FolderPlus, Inbox, LogOut, Pencil, Plus, Settings, Sparkles, Star, StickyNote, Trash2, VolumeX } from "lucide-react"
import { useState } from "react"
import type { DragEvent } from "react"
import { Button } from "@/components/ui/button"
import { ProviderIcon } from "@/components/mail/provider-icon"
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
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
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
  unreadCountByFolder: Record<string, number>
  selectedAccountId: string | null
  isInboxView: boolean
  isStarredView: boolean
  isCleanupView: boolean
  isTrashView: boolean
  isArchiveView: boolean
  isMemoView: boolean
  isDraftsView: boolean
  draftCount: number
  isSnoozeView: boolean
  snoozeCount: number
  isMutedView: boolean
  folders: MailFolder[]
  selectedFolderId: string | null
  isFolderView: boolean
  onSelectAccount: (accountId: string | null) => void
  onGoHome: () => void
  onGoCleanup: () => void
  onGoTrash: () => void
  onGoArchive: () => void
  onGoStarred: () => void
  onGoMemo: () => void
  onGoDrafts: () => void
  onGoSnooze: () => void
  onGoMuted: () => void
  onSelectFolder: (folderId: string) => void
  onCreateFolder: (name: string) => Promise<{ ok: boolean; error?: string }>
  onRenameFolder: (folderId: string, name: string, color: string) => Promise<{ ok: boolean; error?: string }>
  onDeleteFolder: (folderId: string) => void
  onReorderFolders: (order: string[]) => void
  onReorderAccounts: (order: string[]) => void
  onLogout: () => void
  onCompose?: () => void
  onOpenSettings: () => void
}

export function AccountSidebar({
  accounts,
  unreadCountByAccount,
  unreadCountByFolder,
  selectedAccountId,
  isInboxView,
  isStarredView,
  isCleanupView,
  isTrashView,
  isArchiveView,
  isMemoView,
  isDraftsView,
  draftCount,
  isSnoozeView,
  snoozeCount,
  isMutedView,
  folders,
  selectedFolderId,
  isFolderView,
  onSelectAccount,
  onGoHome,
  onGoCleanup,
  onGoTrash,
  onGoArchive,
  onGoStarred,
  onGoMemo,
  onGoDrafts,
  onGoSnooze,
  onGoMuted,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onReorderFolders,
  onReorderAccounts,
  onLogout,
  onCompose,
  onOpenSettings,
}: AccountSidebarProps) {
  const { isMobile, setOpenMobile } = useSidebar()
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
  const [mailMenuOpen, setMailMenuOpen] = useState(true)
  const [accountsOpen, setAccountsOpen] = useState(true)
  const [foldersOpen, setFoldersOpen] = useState(true)
  const accountDrag = useDragReorder(accounts.map((a) => a.id), onReorderAccounts)
  const folderDrag = useDragReorder(folders.map((f) => f.id), onReorderFolders)
  const hasRealAccounts = accounts.some((a) => a.id.includes(":"))
  const totalUnread = Object.values(unreadCountByAccount).reduce(
    (sum, count) => sum + count,
    0,
  )

  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false)
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
      setCreateFolderError(result.error ?? "분류 메일함 생성에 실패했습니다.")
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
      setRenameError(result.error ?? "분류 메일함 변경에 실패했습니다.")
      return
    }
    setPendingRenameFolder(null)
  }

  return (
    <Sidebar className="border-r bg-sidebar/95">
      <SidebarHeader className="gap-4 border-b border-sidebar-border px-4 py-5">
        <button
          type="button"
          onClick={() => {
            onGoHome()
            closeOnMobile()
          }}
          className="flex cursor-pointer items-center gap-2 rounded-md text-xl font-bold tracking-tight outline-none transition-opacity hover:opacity-75 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-orange-500 text-white shadow-md shadow-orange-500/25">
            <Inbox className="size-4.5" />
          </span>
          <span>Mail<span className="text-primary">Roost</span></span>
        </button>
        {onCompose && (
          <Button className="h-10 w-full justify-start gap-2 rounded-lg shadow-sm" onClick={onCompose}>
            <Plus className="size-4" />
            새 메일 작성
          </Button>
        )}
      </SidebarHeader>
      <SidebarContent className="px-2 py-2">
        <SidebarGroup>
          <button type="button" onClick={() => setMailMenuOpen((open) => !open)} className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between px-2 py-1 text-xs font-medium">
            <span>메일</span>
            <ChevronDown className={cn("size-3.5 transition-transform", !mailMenuOpen && "-rotate-90")} />
          </button>
          {mailMenuOpen && <SidebarGroupContent>
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
                  isActive={isSnoozeView}
                  onClick={() => {
                    onGoSnooze()
                    closeOnMobile()
                  }}
                >
                  <AlarmClock />
                  <span>스누즈</span>
                </SidebarMenuButton>
                {snoozeCount > 0 && <SidebarMenuBadge>{snoozeCount}</SidebarMenuBadge>}
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isStarredView}
                  onClick={() => {
                    onGoStarred()
                    closeOnMobile()
                  }}
                >
                  <Star />
                  <span>중요 메일</span>
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
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isMutedView}
                  onClick={() => {
                    onGoMuted()
                    closeOnMobile()
                  }}
                >
                  <VolumeX />
                  <span>뮤트</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem className="mt-2 border-t pt-2">
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
          </SidebarGroupContent>}
        </SidebarGroup>
        <SidebarGroup>
          <button type="button" onClick={() => setAccountsOpen((open) => !open)} className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between px-2 py-1 text-xs font-medium">
            <span>계정</span>
            <span className="flex items-center gap-2">
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">{accounts.length}</span>
              <ChevronDown className={cn("size-3.5 transition-transform", !accountsOpen && "-rotate-90")} />
            </span>
          </button>
          {accountsOpen && <SidebarGroupContent>
            <SidebarMenu>
              {accounts.map((account) => {
                const unread = unreadCountByAccount[account.id] ?? 0
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
                      <ProviderIcon provider={account.provider} className="size-6 rounded-md" label={account.email} />
                      <span className="truncate">{displayText}</span>
                    </SidebarMenuButton>
                    {unread > 0 && <SidebarMenuBadge>{unread}</SidebarMenuBadge>}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>}
        </SidebarGroup>
        <SidebarGroup>
          <div className="flex items-center justify-between px-2">
            <button type="button" onClick={() => setFoldersOpen((open) => !open)} className="text-muted-foreground hover:text-foreground flex min-w-0 flex-1 items-center justify-between py-1 pr-1 text-xs font-medium">
              <span>분류 메일함</span>
              <span className="flex items-center gap-2">
                {folders.length > 0 && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">{folders.length}</span>}
                <ChevronDown className={cn("size-3.5 transition-transform", !foldersOpen && "-rotate-90")} />
              </span>
            </button>
            <button
              type="button"
              aria-label="새 분류 메일함"
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
          {foldersOpen && <SidebarGroupContent>
            <SidebarMenu>
              {folders.map((folder) => {
                const unread = unreadCountByFolder[folder.id] ?? 0
                return (
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
                  {unread > 0 && (
                    <SidebarMenuBadge className="group-hover/item:hidden">{unread}</SidebarMenuBadge>
                  )}
                  <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover/item:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      aria-label="분류 메일함 편집"
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
                      aria-label="분류 메일함 삭제"
                      onClick={() => setPendingDeleteFolder(folder)}
                      className="hover:text-destructive rounded p-0.5"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </SidebarMenuItem>
                )
              })}
              {folders.length === 0 && (
                <p className="text-muted-foreground px-2 py-1 text-xs">분류 메일함이 없습니다.</p>
              )}
            </SidebarMenu>
          </SidebarGroupContent>}
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="flex-col gap-2 p-3">
        <Button variant="ghost" size="sm" className="text-muted-foreground w-full justify-start gap-2" onClick={onOpenSettings}>
          <Settings className="size-4" />
          설정
        </Button>
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

      <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
        <DialogContent>
          <form onSubmit={handleCreateFolder}>
            <DialogHeader>
              <DialogTitle>새 분류 메일함 만들기</DialogTitle>
              <DialogDescription>
                MailRoost 안에서만 사용하는 분류 메일함이에요. 메일 서버에는 반영되지 않아요.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5 py-4">
              <Label htmlFor="folder-name">분류 메일함 이름</Label>
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
              <DialogTitle>분류 메일함 편집</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="folder-rename">분류 메일함 이름</Label>
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
            <DialogTitle>분류 메일함 삭제</DialogTitle>
            <DialogDescription>
              <strong>{pendingDeleteFolder?.name}</strong> 분류 메일함을 삭제합니다. 이 분류 메일함에 있던 메일은
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

      {/* 필터 UI는 메일 검색창 옆 MailFilterMenu로 이동했다.
      <Dialog
        open={isCreateFilterOpen}
        onOpenChange={(open) => {
          setIsCreateFilterOpen(open)
          if (!open) resetFilterForm()
        }}
      >
        <DialogContent>
          <form onSubmit={handleCreateFilter}>
            <DialogHeader>
              <DialogTitle>필터 저장</DialogTitle>
              <DialogDescription>
                조건을 지정해두면 사이드바에서 클릭 한 번으로 그 조건의 메일만 볼 수 있어요.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="filter-name">필터 이름</Label>
                <Input
                  id="filter-name"
                  value={filterName}
                  onChange={(e) => setFilterName(e.target.value)}
                  placeholder="예: 이번 주 미확인 첨부파일"
                  maxLength={40}
                  required
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="filter-account">계정</Label>
                <select
                  id="filter-account"
                  value={filterAccountId}
                  onChange={(e) => setFilterAccountId(e.target.value)}
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm focus:outline-none"
                >
                  <option value="all">전체 계정</option>
                  {accounts.filter((a) => a.id.includes(":")).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.provider === "gmail" || a.provider === "naver" || a.provider === "daum" ? a.email : a.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="filter-from">보낸사람 포함</Label>
                <Input
                  id="filter-from"
                  value={filterFrom}
                  onChange={(e) => setFilterFrom(e.target.value)}
                  placeholder="예: boss@company.com (비워두면 상관없음)"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="filter-subject">제목 포함</Label>
                <Input
                  id="filter-subject"
                  value={filterSubject}
                  onChange={(e) => setFilterSubject(e.target.value)}
                  placeholder="비워두면 상관없음"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="filter-read-state">읽음 여부</Label>
                <select
                  id="filter-read-state"
                  value={filterReadState}
                  onChange={(e) => setFilterReadState(e.target.value as "all" | "unread" | "read")}
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm focus:outline-none"
                >
                  <option value="all">전체</option>
                  <option value="unread">읽지 않음만</option>
                  <option value="read">읽음만</option>
                </select>
              </div>
              {folders.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="filter-folder">분류 메일함</Label>
                  <select
                    id="filter-folder"
                    value={filterFolderId}
                    onChange={(e) => setFilterFolderId(e.target.value)}
                    className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm focus:outline-none"
                  >
                    <option value="all">전체</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={filterStarredOnly}
                    onChange={(e) => setFilterStarredOnly(e.target.checked)}
                    className="size-4"
                  />
                  별표 표시된 메일만
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={filterHasAttachment}
                    onChange={(e) => setFilterHasAttachment(e.target.checked)}
                    className="size-4"
                  />
                  첨부파일이 있는 메일만
                </label>
              </div>
              {createFilterError && <p className="text-destructive text-sm">{createFilterError}</p>}
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" disabled={isCreatingFilter} />}>
                취소
              </DialogClose>
              <Button type="submit" disabled={isCreatingFilter}>
                {isCreatingFilter ? "저장 중..." : "저장"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      */}
    </Sidebar>
  )
}
