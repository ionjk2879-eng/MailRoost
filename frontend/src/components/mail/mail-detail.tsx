import { Star } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import type { Account, Mail } from "@/types/mail"

interface MailDetailProps {
  mail: Mail | null
  accounts: Account[]
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

export function MailDetail({ mail, accounts }: MailDetailProps) {
  if (!mail) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        메일을 선택하세요
      </div>
    )
  }

  const account = accounts.find((a) => a.id === mail.accountId)

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-3 p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-balance">{mail.subject}</h2>
          {mail.isStarred && (
            <Star className="size-4 shrink-0 fill-amber-400 text-amber-400" />
          )}
        </div>
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>{mail.fromName.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <div className="flex flex-1 flex-col text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium">{mail.fromName}</span>
              <span className="text-muted-foreground">&lt;{mail.fromEmail}&gt;</span>
            </div>
            <span className="text-muted-foreground text-xs">
              {formatFullDate(mail.receivedAt)}
            </span>
          </div>
          {account && (
            <Badge variant="secondary" className="gap-1.5">
              <span className={`size-2 rounded-full ${account.color}`} />
              {account.label}
            </Badge>
          )}
        </div>
      </div>
      <Separator />
      <div className="flex-1 overflow-auto p-6">
        <p className="text-sm whitespace-pre-wrap">{mail.body}</p>
      </div>
    </div>
  )
}
