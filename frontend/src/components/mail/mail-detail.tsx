import { Star } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import type { Account, Mail } from "@/types/mail"

interface MailDetailProps {
  mail: Mail | null
  accounts: Account[]
  isLoadingBody?: boolean
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

export function MailDetail({ mail, accounts, isLoadingBody }: MailDetailProps) {
  if (!mail) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        메일을 선택하세요
      </div>
    )
  }

  const account = accounts.find((a) => a.id === mail.accountId)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-3 p-6">
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
              {account.provider === "gmail" ? account.email : account.label}
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
