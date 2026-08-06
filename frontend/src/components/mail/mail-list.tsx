import { Loader2, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Account, Mail } from "@/types/mail"
import { cn } from "@/lib/utils"

interface MailListProps {
  mails: Mail[]
  accounts: Account[]
  selectedMailId: string | null
  onSelectMail: (mailId: string) => void
  onToggleStar: (mailId: string, accountId: string, starred: boolean) => void
  isLoadingMore?: boolean
  hasMore?: boolean
  onLoadMore?: () => void
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function MailList({
  mails,
  accounts,
  selectedMailId,
  onSelectMail,
  onToggleStar,
  isLoadingMore,
  hasMore,
  onLoadMore,
}: MailListProps) {
  return (
    <ScrollArea className="h-full w-full">
      <div className="flex w-full min-w-0 flex-col">
        {mails.length === 0 && (
          <p className="text-muted-foreground p-6 text-sm">메일이 없습니다.</p>
        )}
        {mails.map((mail) => {
          const account = accounts.find((a) => a.id === mail.accountId)
          return (
            <button
              key={mail.id}
              type="button"
              onClick={() => onSelectMail(mail.id)}
              className={cn(
                "group flex w-full min-w-0 flex-col items-start gap-1 border-b px-4 py-3 text-left text-sm transition-colors",
                "hover:bg-accent/50",
                selectedMailId === mail.id && "bg-accent",
              )}
            >
              <div className="flex w-full min-w-0 items-center gap-2">
                {account && (
                  <span
                    className={cn("size-2 shrink-0 rounded-full", account.color)}
                    title={
                      account.provider === "gmail" || account.provider === "naver" || account.provider === "daum"
                        ? account.email
                        : account.label
                    }
                  />
                )}
                <span className={cn("min-w-0 flex-1 truncate", !mail.isRead && "font-semibold")}>
                  {mail.fromName}
                </span>
                <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                  {formatTime(mail.receivedAt)}
                </span>
              </div>
              <div className="flex w-full min-w-0 items-center gap-2">
                <span className={cn("min-w-0 flex-1 truncate", !mail.isRead && "font-semibold")}>
                  {mail.subject}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleStar(mail.id, mail.accountId, !mail.isStarred)
                  }}
                  className={cn(
                    "shrink-0 rounded p-0.5 transition-opacity",
                    mail.isStarred
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-40 hover:!opacity-60",
                  )}
                  aria-label={mail.isStarred ? "별표 해제" : "별표 추가"}
                >
                  <Star
                    className={cn(
                      "size-3.5",
                      mail.isStarred ? "fill-amber-400 text-amber-400" : "text-muted-foreground",
                    )}
                  />
                </button>
              </div>
              <span className="text-muted-foreground w-full min-w-0 truncate text-xs">
                {mail.snippet}
              </span>
            </button>
          )
        })}
        {hasMore && (
          <div className="flex justify-center p-4">
            <Button variant="outline" size="sm" onClick={onLoadMore} disabled={isLoadingMore}>
              {isLoadingMore ? (
                <>
                  <Loader2 className="mr-2 size-3.5 animate-spin" />
                  불러오는 중...
                </>
              ) : (
                "더 불러오기"
              )}
            </Button>
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
