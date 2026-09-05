import { ArrowUpRight, Check, Palette, Pin, PinOff, Plus, Search, StickyNote, X } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { MemoPatch } from "@/lib/api"
import type { MemoItem } from "@/types/mail"

interface MemoViewProps {
  memos: MemoItem[]
  onCreate: () => Promise<string | null>
  onUpdateMemo: (id: string, patch: MemoPatch) => void
  onDelete: (id: string) => void
  onJumpToMail: (mailId: string, accountId: string) => void
}

function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diffMs < minute) return "방금"
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}분 전`
  if (diffMs < day) return `${Math.floor(diffMs / hour)}시간 전`
  if (diffMs < 2 * day) return "어제"
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}일 전`
  return new Date(ts).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })
}

const MEMO_COLORS: { key: string; swatch: string; card: string }[] = [
  { key: "default", swatch: "bg-white border", card: "bg-card" },
  { key: "amber", swatch: "bg-amber-300", card: "bg-amber-50 dark:bg-amber-500/10" },
  { key: "rose", swatch: "bg-rose-300", card: "bg-rose-50 dark:bg-rose-500/10" },
  { key: "violet", swatch: "bg-violet-300", card: "bg-violet-50 dark:bg-violet-500/10" },
  { key: "sky", swatch: "bg-sky-300", card: "bg-sky-50 dark:bg-sky-500/10" },
  { key: "emerald", swatch: "bg-emerald-300", card: "bg-emerald-50 dark:bg-emerald-500/10" },
]

function cardTint(color: string | undefined): string {
  return MEMO_COLORS.find((c) => c.key === color)?.card ?? "bg-card"
}

const SAVE_DEBOUNCE_MS = 500

function MemoCard({
  memo,
  autoFocus,
  checked,
  onToggleCheck,
  onUpdateMemo,
  onDelete,
  onJumpToMail,
}: {
  memo: MemoItem
  autoFocus: boolean
  checked: boolean
  onToggleCheck: (id: string) => void
  onUpdateMemo: (id: string, patch: MemoPatch) => void
  onDelete: (id: string) => void
  onJumpToMail: (mailId: string, accountId: string) => void
}) {
  const [title, setTitle] = useState(memo.title ?? "")
  const [content, setContent] = useState(memo.content)
  const [updatedAt, setUpdatedAt] = useState(memo.updatedAt)
  const [colorOpen, setColorOpen] = useState(false)
  const colorRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus()
  }, [autoFocus])

  // textarea가 고정 높이를 채우지 못하고 내용에 맞춰 자라도록 — scrollHeight 기준으로 직접 조정.
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [content])

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!colorOpen) return
    const handler = (e: MouseEvent) => {
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) setColorOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [colorOpen])

  const scheduleSave = (patch: MemoPatch) => {
    setUpdatedAt(Date.now())
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => onUpdateMemo(memo.id, patch), SAVE_DEBOUNCE_MS)
  }

  const isProtected = !!memo.pinned || !!memo.linkedMail
  const deleteTitle = memo.pinned
    ? "고정을 해제하면 삭제할 수 있습니다"
    : memo.linkedMail
      ? "연결된 메일을 먼저 해제하면 삭제할 수 있습니다"
      : "메모 삭제"

  const handleDelete = () => {
    if (isProtected) return
    const hasContent = title.trim().length > 0 || content.trim().length > 0
    if (hasContent && !window.confirm("이 메모를 삭제할까요? 되돌릴 수 없습니다.")) return
    onDelete(memo.id)
  }

  return (
    <div className={`group relative mb-4 flex min-h-40 flex-col rounded-lg border p-3 shadow-sm break-inside-avoid ${cardTint(memo.color)}`}>
      <div className="mb-1 flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onToggleCheck(memo.id)}
          aria-label={checked ? "선택 해제" : "선택"}
          className={cn(
            "border-input flex size-4 items-center justify-center rounded-sm border transition-opacity",
            checked ? "bg-primary border-primary opacity-100" : "bg-background opacity-0 group-hover:opacity-100",
          )}
        >
          {checked && <Check className="text-primary-foreground size-2.5" />}
        </button>
        <div ref={colorRef} className="relative">
          <button
            type="button"
            aria-label="색상 선택"
            onClick={() => setColorOpen((v) => !v)}
            className="text-muted-foreground hover:text-foreground rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          >
            <Palette className="size-3.5" />
          </button>
          {colorOpen && (
            <div className="bg-background absolute top-full left-0 z-20 mt-1 flex items-center gap-1.5 rounded-md border p-2 shadow-md">
              {MEMO_COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  aria-label={c.key}
                  onClick={() => {
                    onUpdateMemo(memo.id, { color: c.key === "default" ? null : c.key })
                    setColorOpen(false)
                  }}
                  className={`flex size-5 items-center justify-center rounded-full ${c.swatch}`}
                >
                  {memo.color === c.key || (!memo.color && c.key === "default") ? <Check className="size-3" /> : null}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label={memo.pinned ? "고정 해제" : "상단 고정"}
          onClick={() => onUpdateMemo(memo.id, { pinned: !memo.pinned })}
          className={`rounded p-1 transition-opacity ${memo.pinned ? "text-primary opacity-100" : "text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}`}
        >
          {memo.pinned ? <Pin className="size-3.5 fill-current" /> : <PinOff className="size-3.5" />}
        </button>
        <button
          type="button"
          aria-label="메모 삭제"
          title={deleteTitle}
          disabled={isProtected}
          onClick={handleDelete}
          className={cn(
            "ml-auto rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
            isProtected ? "text-muted-foreground/40 cursor-not-allowed" : "text-muted-foreground hover:text-destructive",
          )}
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="border-border/60 mb-1.5 shrink-0 border-b pb-1.5">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            scheduleSave({ title: e.target.value })
          }}
          placeholder="제목 없음"
          className="placeholder:text-muted-foreground/50 text-foreground w-full bg-transparent text-[15px] font-semibold outline-none"
        />
      </div>
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => {
          setContent(e.target.value)
          scheduleSave({ content: e.target.value })
        }}
        placeholder="메모를 입력하세요..."
        rows={1}
        className="placeholder:text-muted-foreground min-h-[3.5rem] shrink-0 resize-none overflow-hidden bg-transparent text-sm leading-relaxed outline-none"
      />
      {memo.linkedMail && (
        <div className="border-input mt-2 flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs">
          <button
            type="button"
            onClick={() => onJumpToMail(memo.linkedMail!.mailId, memo.linkedMail!.accountId)}
            className="hover:bg-accent flex min-w-0 flex-1 items-center gap-1.5 rounded text-left"
          >
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">{memo.linkedMail.fromName}</span>{" "}
              <span className="text-muted-foreground">{memo.linkedMail.subject}</span>
            </span>
            <ArrowUpRight className="text-muted-foreground size-3 shrink-0" />
          </button>
          <button
            type="button"
            aria-label="메일 연결 해제"
            title="메일 연결 해제"
            onClick={() => onUpdateMemo(memo.id, { linkedMail: null })}
            className="text-muted-foreground hover:text-destructive shrink-0 rounded p-0.5"
          >
            <X className="size-3" />
          </button>
        </div>
      )}
      <p className="text-muted-foreground mt-2 shrink-0 text-xs">수정됨 {formatRelativeTime(updatedAt)}</p>
    </div>
  )
}

export function MemoView({ memos, onCreate, onUpdateMemo, onDelete, onJumpToMail }: MemoViewProps) {
  const [focusId, setFocusId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [query, setQuery] = useState("")
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())

  const handleCreate = async () => {
    setIsCreating(true)
    const id = await onCreate()
    setIsCreating(false)
    setFocusId(id)
  }

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBulkDelete = () => {
    const targets = memos.filter((m) => checkedIds.has(m.id))
    const deletable = targets.filter((m) => !m.pinned && !m.linkedMail)
    const skipped = targets.length - deletable.length
    if (deletable.length === 0) {
      window.alert("선택한 메모가 모두 고정되었거나 메일에 연결되어 있어 삭제할 수 없습니다.")
      return
    }
    const message =
      skipped > 0
        ? `메모 ${deletable.length}개를 삭제합니다. 고정되었거나 메일에 연결된 ${skipped}개는 건너뜁니다. 계속할까요?`
        : `메모 ${deletable.length}개를 삭제할까요? 되돌릴 수 없습니다.`
    if (!window.confirm(message)) return
    for (const m of deletable) onDelete(m.id)
    setCheckedIds(new Set())
  }

  const q = query.trim().toLowerCase()
  const filtered = q
    ? memos.filter((m) => (m.title ?? "").toLowerCase().includes(q) || m.content.toLowerCase().includes(q))
    : memos
  const sorted = [...filtered].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
    return b.updatedAt - a.updatedAt
  })

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">메모</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="메모 검색"
              className="bg-muted/50 h-9 w-44 rounded-lg border border-transparent py-1.5 pr-3 pl-8 text-sm outline-none focus:border-border sm:w-56"
            />
          </div>
          <Button size="sm" className="gap-2" onClick={handleCreate} disabled={isCreating}>
            <Plus className="size-4" />
            새 메모
          </Button>
        </div>
      </div>
      {checkedIds.size > 0 && (
        <div className="bg-muted/40 mb-4 flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
          <span>{checkedIds.size}개 선택됨</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCheckedIds(new Set())}>
              선택 해제
            </Button>
            <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
              삭제
            </Button>
          </div>
        </div>
      )}
      {memos.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 py-16 text-sm">
          <StickyNote className="size-8" />
          아직 메모가 없어요. "새 메모"로 시작해보세요.
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center text-sm">"{query}"와 일치하는 메모가 없습니다.</p>
      ) : (
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
          {sorted.map((memo) => (
            <MemoCard
              key={memo.id}
              memo={memo}
              autoFocus={memo.id === focusId}
              checked={checkedIds.has(memo.id)}
              onToggleCheck={toggleCheck}
              onUpdateMemo={onUpdateMemo}
              onDelete={onDelete}
              onJumpToMail={onJumpToMail}
            />
          ))}
        </div>
      )}
    </div>
  )
}
