import { AlarmClock, ChevronDown, Inbox, VolumeX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Account, Mail } from "@/types/mail"
import { cn } from "@/lib/utils"

interface SnoozeMuteViewProps {
  activeTab: "snoozed" | "muted"
  mails: Mail[]
  accounts: Account[]
  snoozed: Record<string, number>
  muted: string[]
  onTabChange: (tab: "snoozed" | "muted") => void
  onUnsnooze: (mailId: string, accountId: string) => void
  onUnmute: (email: string) => void
  onSelectMail: (mailId: string, accountId: string) => void
}

function formatUntil(timestamp: number) {
  const date = new Date(timestamp)
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  const time = date.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })

  if (date.toDateString() === now.toDateString()) return `오늘 ${time}`
  if (date.toDateString() === tomorrow.toDateString()) return `내일 ${time}`
  return date.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", weekday: "short" })
}

const avatarColors = [
  "bg-sky-100 text-sky-600",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
]

function initials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean)
  if (words.length > 1) return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase()
  return value.slice(0, 2).toUpperCase()
}

export function SnoozeMuteView({
  activeTab,
  mails,
  accounts,
  snoozed,
  muted,
  onTabChange,
  onUnsnooze,
  onUnmute,
  onSelectMail,
}: SnoozeMuteViewProps) {
  const now = Date.now()
  const snoozedItems = Object.entries(snoozed)
    .filter(([, until]) => until > now)
    .map(([key, until]) => {
      const [accountId, ...mailIdParts] = key.split("||")
      const mailId = mailIdParts.join("||")
      const mail = mails.find((item) => item.accountId === accountId && item.id === mailId)
      return mail ? { key, accountId, mailId, until, mail } : null
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.until - b.until)

  const mutedSenders = muted.map((email) => {
    const senderMails = mails
      .filter((mail) => mail.fromEmail === email)
      .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
    return { email, latestMail: senderMails[0], count: senderMails.length }
  })

  return (
    <div className="min-h-0 flex-1 bg-muted/20 p-3 sm:p-5">
      <div className="mx-auto flex h-full max-w-[1240px] min-h-0 flex-col gap-4">
        <div className="grid h-11 shrink-0 grid-cols-2 rounded-xl bg-muted p-0.5 sm:max-w-md">
          {(["snoozed", "muted"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              className={cn(
                "rounded-[10px] text-sm font-medium transition-colors",
                activeTab === tab
                  ? "border border-primary/60 bg-background text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab === "snoozed" ? "스누즈" : "뮤트"}
            </button>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1.45fr_1fr]">
          <section className={cn("min-h-0 overflow-hidden rounded-xl border bg-background", activeTab !== "snoozed" && "hidden lg:block")}>
            <div className="flex h-[78px] items-center justify-between border-b px-5">
              <div>
                <h2 className="text-lg font-semibold">나중에 다시 알림</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{snoozedItems.length}개의 메일</p>
              </div>
              <button type="button" className="flex items-center gap-1 text-sm text-muted-foreground">
                정렬: 알림 시간 순 <ChevronDown className="size-4" />
              </button>
            </div>
            <ScrollArea className="h-[calc(100%-78px)]">
              <div className="space-y-3 p-3 sm:p-4">
                {snoozedItems.map(({ key, accountId, mailId, until, mail }, index) => {
                  const account = accounts.find((item) => item.id === accountId)
                  return (
                    <article
                      key={key}
                      onClick={() => onSelectMail(mailId, accountId)}
                      className="group flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/20"
                    >
                      <span className={cn("mt-4 size-2 shrink-0 rounded-full", account?.color ?? "bg-primary")} />
                      <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-full text-base", avatarColors[index % avatarColors.length])}>
                        {initials(mail.fromName || mail.fromEmail)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{mail.fromName || mail.fromEmail}</p>
                        <p className={cn("mt-2 truncate text-sm", !mail.isRead && "font-medium")}>{mail.subject || "(제목 없음)"}</p>
                        <p className="mt-2 line-clamp-1 text-sm text-muted-foreground">{mail.snippet}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end justify-between gap-4">
                        <span className="flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-600">
                          <AlarmClock className="size-3.5" /> {formatUntil(until)}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-primary/30 text-primary hover:bg-primary/5 hover:text-primary"
                          onClick={(event) => {
                            event.stopPropagation()
                            onUnsnooze(mailId, accountId)
                          }}
                        >
                          지금 복원
                        </Button>
                      </div>
                    </article>
                  )
                })}
                {snoozedItems.length === 0 && (
                  <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                    <Inbox className="size-11 opacity-35" />
                    <p>스누즈된 메일이 없습니다</p>
                  </div>
                )}
                {snoozedItems.length > 0 && (
                  <div className="flex flex-col items-center gap-4 py-9 text-sm text-muted-foreground">
                    <p>모든 스누즈 메일을 확인했습니다.</p>
                    <Inbox className="size-11 opacity-50" />
                  </div>
                )}
              </div>
            </ScrollArea>
          </section>

          <section className={cn("min-h-0 overflow-hidden rounded-xl border bg-background", activeTab !== "muted" && "hidden lg:block")}>
            <div className="flex h-[78px] items-center border-b px-5">
              <div>
                <h2 className="text-lg font-semibold">뮤트한 발신자</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{mutedSenders.length}개의 발신자</p>
              </div>
            </div>
            <ScrollArea className="h-[calc(100%-78px)]">
              <div className="flex min-h-[calc(100vh-250px)] flex-col">
                <div>
                  {mutedSenders.map(({ email, latestMail }, index) => (
                    <div key={email} className="flex min-h-28 items-center gap-3 border-b px-5 py-4">
                      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full text-lg", avatarColors[(index + 3) % avatarColors.length])}>
                        {initials(latestMail?.fromName || email)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{email}</p>
                        <p className="mt-2 truncate text-sm text-muted-foreground">{latestMail?.fromName || "뮤트한 발신자"}</p>
                      </div>
                      <Button variant="outline" size="sm" className="border-primary/50 text-primary hover:bg-primary/5 hover:text-primary" onClick={() => onUnmute(email)}>
                        뮤트 해제
                      </Button>
                    </div>
                  ))}
                  {mutedSenders.length === 0 && (
                    <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                      <VolumeX className="size-11 opacity-35" />
                      <p>뮤트된 발신자가 없습니다</p>
                    </div>
                  )}
                </div>
                <div className="mt-auto flex items-start justify-center gap-3 px-6 py-9 text-sm text-muted-foreground">
                  <VolumeX className="mt-0.5 size-6 shrink-0 opacity-60" />
                  <p>뮤트한 발신자의 메일은 새 메일 알림에서 제외됩니다.</p>
                </div>
              </div>
            </ScrollArea>
          </section>
        </div>
      </div>
    </div>
  )
}
