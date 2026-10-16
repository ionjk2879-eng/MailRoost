import { ShieldX } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { Mail } from "@/types/mail"

interface SpamViewProps {
  mails: Mail[]
  muted: string[]
  onSelectMail: (mailId: string, accountId: string) => void
}

function formatDate(receivedAt: string) {
  const date = new Date(receivedAt)
  const now = new Date()
  if (date.toDateString() === now.toDateString())
    return date.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })
  return date.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })
}

export function SpamView({ mails, muted, onSelectMail }: SpamViewProps) {
  const groups = muted
    .map((email) => ({
      email,
      mails: mails
        .filter((m) => m.fromEmail === email)
        .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()),
    }))
    .filter((g) => g.mails.length > 0)

  if (groups.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <ShieldX className="size-12 opacity-30" />
        <p className="text-sm">뮤트된 메일이 없습니다</p>
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1">
      <div className="mx-auto max-w-3xl px-4 py-6">
        {groups.map(({ email, mails: senderMails }) => (
          <div key={email} className="mb-8">
            <div className="flex items-center gap-3 py-2">
              <div className="h-px flex-1 bg-border" />
              <span className="select-all px-1 text-xs font-medium text-muted-foreground">{email}</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="overflow-hidden rounded-xl border divide-y">
              {senderMails.map((mail) => (
                <button
                  key={`${mail.accountId}:${mail.id}`}
                  type="button"
                  onClick={() => onSelectMail(mail.id, mail.accountId)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
                >
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-sm", !mail.isRead && "font-medium")}>{mail.subject || "(제목 없음)"}</p>
                    {mail.snippet && <p className="mt-0.5 truncate text-xs text-muted-foreground">{mail.snippet}</p>}
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{formatDate(mail.receivedAt)}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}
