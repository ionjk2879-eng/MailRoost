import { AlertTriangle, Bell, RotateCw, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AppNotification } from "@/types/mail"

interface NotificationBellProps {
  notifications: AppNotification[]
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
  onDismiss: (id: string) => void
}

function timeAgo(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (diffSec < 60) return "방금 전"
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}분 전`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}시간 전`
  return `${Math.floor(diffHour / 24)}일 전`
}

export function NotificationBell({ notifications, onMarkRead, onMarkAllRead, onDismiss }: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const unreadCount = notifications.filter((n) => !n.read).length

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative size-8"
        title="알림"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span className="bg-destructive text-destructive-foreground absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>
      {open && (
        <div className="bg-background absolute top-full right-0 z-30 mt-1 max-h-96 w-80 overflow-y-auto rounded-md border shadow-md">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-medium">알림</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                모두 읽음
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="text-muted-foreground px-3 py-8 text-center text-sm">알림이 없습니다.</p>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn("flex items-start gap-2 px-3 py-2.5", !n.read && "bg-primary/5")}
                  onClick={() => !n.read && onMarkRead(n.id)}
                >
                  {n.type === "scheduled-failed" ? (
                    <AlertTriangle className="text-destructive mt-0.5 size-3.5 shrink-0" />
                  ) : (
                    <RotateCw className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm whitespace-pre-wrap">{n.message}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">{timeAgo(n.createdAt)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDismiss(n.id)
                    }}
                    aria-label="알림 삭제"
                    className="hover:bg-accent flex size-5 shrink-0 items-center justify-center rounded"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
