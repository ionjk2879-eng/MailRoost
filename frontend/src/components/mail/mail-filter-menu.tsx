import { Check, Filter, Plus, Trash2, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Account, MailFolder, SavedFilter } from "@/types/mail"

interface MailFilterMenuProps {
  accounts: Account[]
  folders: MailFolder[]
  savedFilters: SavedFilter[]
  activeFilterId: string | null
  onApply: (filter: SavedFilter) => void
  onClear: () => void
  onCreate: (input: Omit<SavedFilter, "id" | "createdAt">) => Promise<{ ok: boolean; error?: string }>
  onDelete: (filterId: string) => void
}

export function MailFilterMenu({ accounts, folders, savedFilters, activeFilterId, onApply, onClear, onCreate, onDelete }: MailFilterMenuProps) {
  const [open, setOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState("")
  const [accountId, setAccountId] = useState("all")
  const [from, setFrom] = useState("")
  const [subject, setSubject] = useState("")
  const [readState, setReadState] = useState<"all" | "unread" | "read">("all")
  const [starred, setStarred] = useState(false)
  const [hasAttachment, setHasAttachment] = useState(false)
  const [folderId, setFolderId] = useState("all")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [open])

  const reset = () => {
    setName("")
    setAccountId("all")
    setFrom("")
    setSubject("")
    setReadState("all")
    setStarred(false)
    setHasAttachment(false)
    setFolderId("all")
    setError(null)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    const result = await onCreate({
      name: name.trim(),
      accountId: accountId === "all" ? null : accountId,
      from: from.trim(),
      subject: subject.trim(),
      isUnread: readState === "all" ? null : readState === "unread",
      isStarred: starred ? true : null,
      hasAttachment: hasAttachment ? true : null,
      folderId: folderId === "all" ? null : folderId,
    })
    setSaving(false)
    if (!result.ok) {
      setError(result.error ?? "필터 저장에 실패했습니다.")
      return
    }
    setCreateOpen(false)
    reset()
  }

  return (
    <>
      <div ref={menuRef} className="relative">
        <Button variant={activeFilterId ? "secondary" : "outline"} size="icon" className="size-10 rounded-lg" title="필터" onClick={() => setOpen((value) => !value)}>
          <Filter className="size-4" />
        </Button>
        {open && (
          <div className="bg-popover absolute top-full right-0 z-30 mt-2 w-72 overflow-hidden rounded-xl border shadow-lg">
            <div className="flex items-center justify-between border-b px-3 py-2.5">
              <span className="text-sm font-semibold">저장된 필터</span>
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => { reset(); setCreateOpen(true); setOpen(false) }}>
                <Plus className="size-3.5" />새 필터
              </Button>
            </div>
            <div className="max-h-72 overflow-y-auto p-1.5">
              {savedFilters.length === 0 ? (
                <p className="text-muted-foreground px-3 py-6 text-center text-xs">저장된 필터가 없습니다.</p>
              ) : savedFilters.map((filter) => (
                <div key={filter.id} className="group flex items-center rounded-lg hover:bg-accent">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm" onClick={() => { onApply(filter); setOpen(false) }}>
                    <span className="flex size-4 shrink-0 items-center justify-center">{activeFilterId === filter.id && <Check className="text-primary size-4" />}</span>
                    <span className="truncate">{filter.name}</span>
                  </button>
                  <button type="button" aria-label={`${filter.name} 삭제`} className="text-muted-foreground hover:text-destructive mr-1 rounded p-1.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => onDelete(filter.id)}>
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {activeFilterId && (
              <button type="button" onClick={() => { onClear(); setOpen(false) }} className="text-muted-foreground hover:text-foreground flex w-full items-center justify-center gap-1.5 border-t px-3 py-2 text-xs">
                <X className="size-3.5" />필터 해제
              </button>
            )}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={(value) => { setCreateOpen(value); if (!value) reset() }}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>필터 저장</DialogTitle>
              <DialogDescription>자주 사용하는 검색 조건을 저장해 메일 목록에서 바로 적용합니다.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><Label htmlFor="saved-filter-name">필터 이름</Label><Input id="saved-filter-name" className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></div>
              <div><Label htmlFor="saved-filter-account">계정</Label><select id="saved-filter-account" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="border-input bg-background mt-1.5 h-9 w-full rounded-md border px-3 text-sm"><option value="all">전체 계정</option>{accounts.filter((a) => a.id.includes(":")).map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}</select></div>
              <div><Label htmlFor="saved-filter-read">읽음 여부</Label><select id="saved-filter-read" value={readState} onChange={(e) => setReadState(e.target.value as typeof readState)} className="border-input bg-background mt-1.5 h-9 w-full rounded-md border px-3 text-sm"><option value="all">전체</option><option value="unread">읽지 않음</option><option value="read">읽음</option></select></div>
              <div><Label htmlFor="saved-filter-from">보낸사람 포함</Label><Input id="saved-filter-from" className="mt-1.5" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div><Label htmlFor="saved-filter-subject">제목 포함</Label><Input id="saved-filter-subject" className="mt-1.5" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
              {folders.length > 0 && <div className="sm:col-span-2"><Label htmlFor="saved-filter-folder">분류 메일함</Label><select id="saved-filter-folder" value={folderId} onChange={(e) => setFolderId(e.target.value)} className="border-input bg-background mt-1.5 h-9 w-full rounded-md border px-3 text-sm"><option value="all">전체</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></div>}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={starred} onChange={(e) => setStarred(e.target.checked)} />별표 메일만</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hasAttachment} onChange={(e) => setHasAttachment(e.target.checked)} />첨부파일 있음</label>
              {error && <p className="text-destructive sm:col-span-2 text-sm">{error}</p>}
            </div>
            <DialogFooter><DialogClose render={<Button type="button" variant="outline" disabled={saving} />}>취소</DialogClose><Button type="submit" disabled={saving}>{saving ? "저장 중..." : "저장"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
