import { Undo2 } from "lucide-react"
import { useEffect, useState } from "react"

export interface PendingSend {
  id: string
  subject: string
  sendAt: number
}

function useCountdownSeconds(expiresAt: number): number {
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)))
  useEffect(() => {
    const interval = window.setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)))
    }, 250)
    return () => window.clearInterval(interval)
  }, [expiresAt])
  return remaining
}

function UndoSendItem({ pending, onUndo }: { pending: PendingSend; onUndo: (id: string) => void }) {
  const remaining = useCountdownSeconds(pending.sendAt)
  return (
    <div className="bg-foreground text-background flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm shadow-xl">
      <span className="max-w-[240px] truncate">
        {pending.subject.trim() ? `"${pending.subject}" ` : ""}메일을 보냈습니다
      </span>
      <button
        type="button"
        onClick={() => onUndo(pending.id)}
        className="flex shrink-0 items-center gap-1 font-medium underline underline-offset-2 hover:opacity-80"
      >
        <Undo2 className="size-3.5" />
        실행취소 {remaining > 0 && `(${remaining}초)`}
      </button>
    </div>
  )
}

export function UndoSendToast({
  pendingSends,
  onUndo,
}: {
  pendingSends: PendingSend[]
  onUndo: (id: string) => void
}) {
  if (pendingSends.length === 0) return null
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2">
      {pendingSends.map((p) => (
        <div key={p.id} className="pointer-events-auto">
          <UndoSendItem pending={p} onUndo={onUndo} />
        </div>
      ))}
    </div>
  )
}
