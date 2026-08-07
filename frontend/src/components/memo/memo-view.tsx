import { Plus, StickyNote, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import type { MemoItem } from "@/types/mail"

interface MemoViewProps {
  memos: MemoItem[]
  onCreate: () => Promise<string | null>
  onUpdateContent: (id: string, content: string) => void
  onDelete: (id: string) => void
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

const SAVE_DEBOUNCE_MS = 500

function MemoCard({
  memo,
  autoFocus,
  onUpdateContent,
  onDelete,
}: {
  memo: MemoItem
  autoFocus: boolean
  onUpdateContent: (id: string, content: string) => void
  onDelete: (id: string) => void
}) {
  const [value, setValue] = useState(memo.content)
  const [updatedAt, setUpdatedAt] = useState(memo.updatedAt)
  const timerRef = useRef<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value
    setValue(next)
    setUpdatedAt(Date.now())
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      onUpdateContent(memo.id, next)
    }, SAVE_DEBOUNCE_MS)
  }

  return (
    <div className="bg-card group relative flex h-72 flex-col rounded-lg border p-3 shadow-sm">
      <button
        type="button"
        aria-label="메모 삭제"
        onClick={() => onDelete(memo.id)}
        className="text-muted-foreground hover:text-destructive absolute top-2 right-2 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <X className="size-3.5" />
      </button>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        placeholder="메모를 입력하세요..."
        className="placeholder:text-muted-foreground min-h-0 flex-1 resize-none bg-transparent pr-6 text-sm outline-none"
      />
      <p className="text-muted-foreground mt-2 shrink-0 text-xs">수정됨 {formatRelativeTime(updatedAt)}</p>
    </div>
  )
}

export function MemoView({ memos, onCreate, onUpdateContent, onDelete }: MemoViewProps) {
  const [focusId, setFocusId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const handleCreate = async () => {
    setIsCreating(true)
    const id = await onCreate()
    setIsCreating(false)
    setFocusId(id)
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">메모</h2>
        <Button size="sm" className="gap-2" onClick={handleCreate} disabled={isCreating}>
          <Plus className="size-4" />
          새 메모
        </Button>
      </div>
      {memos.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 py-16 text-sm">
          <StickyNote className="size-8" />
          아직 메모가 없어요. "새 메모"로 시작해보세요.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {memos.map((memo) => (
            <MemoCard
              key={memo.id}
              memo={memo}
              autoFocus={memo.id === focusId}
              onUpdateContent={onUpdateContent}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
