import { AlarmClock, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Account, Mail } from "@/types/mail"
import { cn } from "@/lib/utils"

interface SnoozedViewProps {
  mails: Mail[]           // 전체 메일 목록 (원본)
  accounts: Account[]
  snoozed: Record<string, number>  // key: accountId||mailId, value: until timestamp
  onUnsnooze: (mailId: string, accountId: string) => void
  onSelectMail: (mailId: string, accountId: string) => void
}

function snoozeKey(accountId: string, mailId: string) {
  return `${accountId}||${mailId}`
}

function formatUntil(ts: number): string {
  const date = new Date(ts)
  const now = new Date()
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  const isTomorrow =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate() + 1

  const time = date.toLocaleString("ko-KR", { hour: "2-digit", minute: "2-digit" })
  if (isToday) return `오늘 ${time}`
  if (isTomorrow) return `내일 ${time}`
  return date.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

export function SnoozedView({ mails, accounts, snoozed, onUnsnooze, onSelectMail }: SnoozedViewProps) {
  const now = Date.now()

  // snoozed 맵에서 아직 유효한 항목만 추려 메일 데이터와 합치기
  const snoozedItems = Object.entries(snoozed)
    .filter(([, until]) => until > now)
    .map(([key, until]) => {
      const [accountId, ...mailIdParts] = key.split("||")
      const mailId = mailIdParts.join("||")
      const mail = mails.find((m) => m.accountId === accountId && m.id === mailId)
      return { key, accountId, mailId, until, mail }
    })
    .filter((item) => item.mail !== undefined)
    .sort((a, b) => a.until - b.until) as Array<{
      key: string
      accountId: string
      mailId: string
      until: number
      mail: Mail
    }>

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-6">
          {snoozedItems.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-3 py-20 text-sm">
              <AlarmClock className="size-10 opacity-30" />
              <p>스누즈된 메일이 없습니다</p>
            </div>
          ) : (
            <div className="max-w-2xl space-y-2">
              {snoozedItems.map(({ key, accountId, mailId, until, mail }) => {
                const account = accounts.find((a) => a.id === mail.accountId)
                return (
                  <div
                    key={key}
                    className="hover:bg-muted/30 group flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors"
                    onClick={() => onSelectMail(mailId, accountId)}
                  >
                    {/* 계정 색상 dot */}
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
                        {mail.fromName}
                        {account && (
                          <span className="ml-1 opacity-60">
                            · {account.provider === "gmail" || account.provider === "naver" || account.provider === "daum"
                              ? account.email
                              : account.label}
                          </span>
                        )}
                      </p>
                      {mail.snippet && (
                        <p className="text-muted-foreground mt-1 line-clamp-1 text-xs">{mail.snippet}</p>
                      )}
                    </div>

                    {/* 스누즈 시각 + 해제 버튼 */}
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <div className="text-muted-foreground flex items-center gap-1 text-xs">
                        <AlarmClock className="size-3" />
                        {formatUntil(until)}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 opacity-0 group-hover:opacity-100"
                        title="스누즈 해제"
                        onClick={(e) => {
                          e.stopPropagation()
                          onUnsnooze(mailId, accountId)
                        }}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
