import { ChevronLeft, FolderInput, Inbox, MailOpen, Reply, Star, Trash2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { ComposeDialog } from "@/components/mail/compose-dialog"
import { cn } from "@/lib/utils"
import type { Account, Mail, MailFolder } from "@/types/mail"

interface MailDetailProps {
  mail: Mail | null
  accounts: Account[]
  isLoadingBody?: boolean
  onBack?: () => void
  onToggleStar?: (mailId: string, accountId: string, starred: boolean) => void
  onMarkAsUnread?: (mailId: string, accountId: string) => void
  onDelete?: (mailId: string, accountId: string) => void
  folders?: MailFolder[]
  currentFolderId?: string
  onMove?: (mailId: string, accountId: string, folderId: string | null) => void
}

function formatFullDate(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function buildIframeDoc(bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light"><style>
body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;line-height:1.6;word-wrap:break-word;overflow-wrap:break-word;margin:0;padding:16px;color:#1a1a1a;background:#fff}
img{max-width:100%;height:auto}
table{max-width:100%;border-collapse:collapse}
a{color:#2563eb}
</style></head><body>${bodyHtml}</body></html>`
}

export function MailDetail({
  mail,
  accounts,
  isLoadingBody,
  onBack,
  onToggleStar,
  onMarkAsUnread,
  onDelete,
  folders,
  currentFolderId,
  onMove,
}: MailDetailProps) {
  const [moveOpen, setMoveOpen] = useState(false)
  const moveRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!moveOpen) return
    const handler = (e: MouseEvent) => {
      if (moveRef.current && !moveRef.current.contains(e.target as Node)) {
        setMoveOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [moveOpen])

  if (!mail) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col">
        {onBack && <BackButton onBack={onBack} />}
        <div className="text-muted-foreground flex min-h-0 w-full flex-1 items-center justify-center text-sm">
          메일을 선택하세요
        </div>
      </div>
    )
  }

  const account = accounts.find((a) => a.id === mail.accountId)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-3 p-6">
        {onBack && <BackButton onBack={onBack} />}
        <div className="flex min-w-0 items-start justify-between gap-4">
          <h2 className="min-w-0 flex-1 text-lg font-semibold break-words">{mail.subject}</h2>
          <div className="flex shrink-0 items-center gap-1">
            <ComposeDialog
              accounts={accounts}
              defaultAccountId={mail.accountId}
              defaultTo={mail.fromEmail}
              defaultSubject={mail.subject.startsWith("Re:") ? mail.subject : `Re: ${mail.subject}`}
              trigger={
                <Button variant="ghost" size="icon" className="size-8" title="답장">
                  <Reply className="size-4" />
                </Button>
              }
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              title={mail.isRead ? "읽지 않음으로 표시" : "이미 읽지 않은 메일"}
              onClick={() => onMarkAsUnread?.(mail.id, mail.accountId)}
              disabled={!mail.isRead}
            >
              <MailOpen className="size-4" />
            </Button>
            <button
              type="button"
              onClick={() => onToggleStar?.(mail.id, mail.accountId, !mail.isStarred)}
              className="hover:bg-accent flex size-8 items-center justify-center rounded-md transition-colors"
              aria-label={mail.isStarred ? "별표 해제" : "별표 추가"}
              title={mail.isStarred ? "별표 해제" : "별표 추가"}
            >
              <Star
                className={
                  mail.isStarred ? "size-4 fill-amber-400 text-amber-400" : "size-4 text-muted-foreground"
                }
              />
            </button>
            {onMove && (
              <div ref={moveRef} className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  title="메일함으로 이동"
                  onClick={() => setMoveOpen((v) => !v)}
                >
                  <FolderInput className="size-4" />
                </Button>
                {moveOpen && (
                  <div className="bg-background absolute top-full right-0 z-20 mt-1 min-w-[140px] rounded-md border shadow-md">
                    {currentFolderId && (
                      <button
                        type="button"
                        onClick={() => {
                          onMove(mail.id, mail.accountId, null)
                          setMoveOpen(false)
                        }}
                        className="hover:bg-accent flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
                      >
                        <Inbox className="text-muted-foreground size-3.5" />
                        받은편지함으로
                      </button>
                    )}
                    {(folders ?? [])
                      .filter((f) => f.id !== currentFolderId)
                      .map((folder) => (
                        <button
                          key={folder.id}
                          type="button"
                          onClick={() => {
                            onMove(mail.id, mail.accountId, folder.id)
                            setMoveOpen(false)
                          }}
                          className="hover:bg-accent flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
                        >
                          <span className={cn("size-2 shrink-0 rounded-full", folder.color)} />
                          <span className="truncate">{folder.name}</span>
                        </button>
                      ))}
                    {(!folders || folders.length === 0) && !currentFolderId && (
                      <p className="text-muted-foreground px-3 py-1.5 text-xs">메일함이 없습니다.</p>
                    )}
                  </div>
                )}
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="hover:text-destructive size-8"
              title="삭제"
              onClick={() => onDelete?.(mail.id, mail.accountId)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="shrink-0">
            <AvatarFallback>{mail.fromName.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col text-sm">
            <span className="truncate">
              <span className="font-medium">{mail.fromName}</span>{" "}
              <span className="text-muted-foreground">&lt;{mail.fromEmail}&gt;</span>
            </span>
            <span className="text-muted-foreground text-xs">
              {formatFullDate(mail.receivedAt)}
            </span>
          </div>
          {account && (
            <Badge variant="secondary" className="max-w-[45%] shrink-0 gap-1.5">
              <span className={`size-2 shrink-0 rounded-full ${account.color}`} />
              <span className="truncate">
                {account.provider === "gmail" || account.provider === "naver" || account.provider === "daum"
                  ? account.email
                  : account.label}
              </span>
            </Badge>
          )}
        </div>
      </div>
      <Separator />
      <div className="min-h-0 flex-1 overflow-hidden">
        {isLoadingBody ? (
          <div className="flex flex-col gap-3 p-6">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : mail.bodyHtml ? (
          <iframe
            key={mail.id}
            title={mail.subject}
            srcDoc={buildIframeDoc(mail.bodyHtml)}
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            className="h-full w-full border-0"
          />
        ) : (
          <div className="h-full overflow-auto p-6">
            <p className="text-sm whitespace-pre-wrap">{mail.body}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="-ml-2 w-fit gap-1" onClick={onBack}>
      <ChevronLeft className="size-4" />
      목록으로
    </Button>
  )
}
