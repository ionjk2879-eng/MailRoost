import { CalendarClock, Loader2, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { cancelScheduledMailSend, fetchScheduledMails } from "@/lib/api"
import type { Account, ScheduledMail } from "@/types/mail"

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

interface ScheduledViewProps {
  accounts: Account[]
}

export function ScheduledView({ accounts }: ScheduledViewProps) {
  const [mails, setMails] = useState<ScheduledMail[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchScheduledMails().then((data) => { setMails(data); setLoading(false) })
  }, [])

  const handleCancel = async (id: string) => {
    if (!confirm("예약 발송을 취소하시겠습니까?")) return
    const ok = await cancelScheduledMailSend(id)
    if (ok) setMails((prev) => prev.filter((m) => m.id !== id))
  }

  const accountLabel = (id: string) => accounts.find((a) => a.id === id)?.email ?? id

  const pending = mails.filter((m) => m.status === "pending").sort((a, b) => a.scheduledAt - b.scheduledAt)
  const done = mails.filter((m) => m.status !== "pending").sort((a, b) => b.scheduledAt - a.scheduledAt)

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b bg-gradient-to-r from-orange-50/80 via-background to-background px-6 py-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-500">Scheduled</p>
        <h2 className="mt-0.5 text-xl font-bold tracking-tight">예약 발송</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> 불러오는 중...</div>
        ) : pending.length === 0 && done.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <CalendarClock className="size-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">예약된 메일이 없습니다.<br />작성 화면에서 예약 발송을 설정할 수 있습니다.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {pending.length > 0 && (
              <section>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">대기 중 ({pending.length})</h3>
                <div className="space-y-2">
                  {pending.map((mail) => (
                    <div key={mail.id} className="flex items-start gap-3 rounded-xl border bg-background p-4 shadow-sm">
                      <CalendarClock className="mt-0.5 size-4 shrink-0 text-orange-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-sm">{mail.subject || "(제목 없음)"}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">받는 사람: {mail.to}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">계정: {accountLabel(mail.accountId)}</p>
                        <p className="mt-1 text-xs font-medium text-orange-600">발송 예정: {formatDateTime(mail.scheduledAt)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCancel(mail.id)}
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="예약 취소"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {done.length > 0 && (
              <section>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">최근 전송 내역</h3>
                <div className="space-y-2">
                  {done.slice(0, 10).map((mail) => (
                    <div key={mail.id} className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4">
                      <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-muted-foreground">{mail.subject || "(제목 없음)"}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">받는 사람: {mail.to}</p>
                        {mail.status === "failed" && <p className="mt-0.5 text-xs text-destructive">{mail.error}</p>}
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${mail.status === "sent" ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400" : "bg-destructive/10 text-destructive"}`}>
                        {mail.status === "sent" ? "전송됨" : "실패"}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
