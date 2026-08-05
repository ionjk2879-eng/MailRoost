import { Star } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Account, Mail } from "@/types/mail"
import { cn } from "@/lib/utils"

interface MailListProps {
  mails: Mail[]
  accounts: Account[]
  selectedMailId: string | null
  onSelectMail: (mailId: string) => void
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

export function MailList({ mails, accounts, selectedMailId, onSelectMail }: MailListProps) {
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col">
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
                "flex flex-col items-start gap-1 border-b px-4 py-3 text-left text-sm transition-colors",
                "hover:bg-accent/50",
                selectedMailId === mail.id && "bg-accent",
              )}
            >
              <div className="flex w-full items-center gap-2">
                {account && (
                  <span
                    className={cn("size-2 shrink-0 rounded-full", account.color)}
                    title={account.label}
                  />
                )}
                <span
                  className={cn(
                    "truncate",
                    !mail.isRead && "font-semibold",
                  )}
                >
                  {mail.fromName}
                </span>
                <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                  {formatTime(mail.receivedAt)}
                </span>
              </div>
              <div className="flex w-full items-center gap-2">
                <span
                  className={cn(
                    "truncate",
                    !mail.isRead && "font-semibold",
                  )}
                >
                  {mail.subject}
                </span>
                {mail.isStarred && (
                  <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />
                )}
              </div>
              <span className="text-muted-foreground w-full truncate text-xs">
                {mail.snippet}
              </span>
            </button>
          )
        })}
      </div>
    </ScrollArea>
  )
}
