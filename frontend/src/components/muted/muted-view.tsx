import { VolumeX, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import type { Account, Mail } from "@/types/mail"
import { cn } from "@/lib/utils"

interface MutedViewProps {
  mails: Mail[]
  accounts: Account[]
  muted: string[]
  onUnmute: (email: string) => void
  onSelectMail: (mailId: string, accountId: string) => void
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (isToday) return date.toLocaleString("ko-KR", { hour: "2-digit", minute: "2-digit" })
  return date.toLocaleString("ko-KR", { month: "numeric", day: "numeric" })
}

export function MutedView({ mails, accounts, muted, onUnmute, onSelectMail }: MutedViewProps) {
  const mutedSet = new Set(muted)
  const mutedMails = mails
    .filter((m) => mutedSet.has(m.fromEmail))
    .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-6">
          {/* 뮤트된 발신자 목록 */}
          <div className="mb-6">
            <h2 className="mb-3 text-sm font-semibold">뮤트된 발신자</h2>
            {muted.length === 0 ? (
              <p className="text-muted-foreground text-sm">뮤트된 발신자가 없습니다.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {muted.map((email) => (
                  <div
                    key={email}
                    className="bg-muted flex items-center gap-1.5 rounded-full px-3 py-1 text-sm"
                  >
                    <VolumeX className="text-muted-foreground size-3.5" />
                    <span>{email}</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground ml-0.5 transition-colors"
                      title="뮤트 해제"
                      onClick={() => onUnmute(email)}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {muted.length > 0 && (
            <>
              <Separator className="mb-6" />
              {/* 뮤트된 발신자의 메일 목록 */}
              <h2 className="mb-3 text-sm font-semibold">
                받은 메일
                {mutedMails.length > 0 && (
                  <span className="text-muted-foreground ml-1.5 font-normal">({mutedMails.length})</span>
                )}
              </h2>
              {mutedMails.length === 0 ? (
                <p className="text-muted-foreground text-sm">받은 메일이 없습니다.</p>
              ) : (
                <div className="max-w-2xl space-y-1">
                  {mutedMails.map((mail) => {
                    const account = accounts.find((a) => a.id === mail.accountId)
                    return (
                      <div
                        key={`${mail.accountId}:${mail.id}`}
                        className="hover:bg-muted/30 group flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors"
                        onClick={() => onSelectMail(mail.id, mail.accountId)}
                      >
                        {account && (
                          <span
                            className={cn("mt-1 size-2 shrink-0 rounded-full", account.color)}
                            title={account.email ?? account.label}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className={cn("truncate text-sm", !mail.isRead && "font-semibold")}>
                            {mail.subject || "(제목 없음)"}
                          </p>
                          <p className="text-muted-foreground mt-0.5 truncate text-xs">
                            {mail.fromName} &lt;{mail.fromEmail}&gt;
                          </p>
                          {mail.snippet && (
                            <p className="text-muted-foreground mt-1 line-clamp-1 text-xs">{mail.snippet}</p>
                          )}
                        </div>
                        <span className="text-muted-foreground shrink-0 text-xs">
                          {formatDate(mail.receivedAt)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {muted.length === 0 && (
            <div className="text-muted-foreground flex flex-col items-center gap-3 py-20 text-sm">
              <VolumeX className="size-10 opacity-30" />
              <p>뮤트된 발신자가 없습니다</p>
              <p className="text-xs opacity-70">메일 상세에서 발신자를 뮤트할 수 있습니다</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
