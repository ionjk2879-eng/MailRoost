import { Archive, Clock3, Inbox, Mail as MailIcon, NotebookPen, Pencil, Settings, Sparkles, Star } from "lucide-react"
import type { ComponentType } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ProviderIcon } from "@/components/mail/provider-icon"
import { HeroIllustration } from "@/components/home/hero-illustration"
import { cn } from "@/lib/utils"
import type { Account, Mail } from "@/types/mail"

interface HomeViewProps {
  accounts: Account[]
  mails: Mail[]
  unreadCountByAccount: Record<string, number>
  snoozedCount: number
  currentUserEmail?: string
  onSelectAccount: (accountId: string | null) => void
  onCompose?: () => void
  onGoToCleanup: () => void
  onGoToMemo: () => void
  onGoToDrafts: () => void
  onOpenSettings: () => void
}

function displayNameFromEmail(email?: string): string {
  return email ? email.split("@")[0] : ""
}

export function HomeView({
  accounts,
  mails,
  unreadCountByAccount,
  snoozedCount,
  currentUserEmail,
  onSelectAccount,
  onCompose,
  onGoToCleanup,
  onGoToMemo,
  onGoToDrafts,
  onOpenSettings,
}: HomeViewProps) {
  const totalUnread = Object.values(unreadCountByAccount).reduce((sum, n) => sum + n, 0)
  const starredCount = mails.filter((m) => m.isStarred).length
  const name = displayNameFromEmail(currentUserEmail)

  const stats: { label: string; value: number; icon: ComponentType<{ className?: string }>; tint: string }[] = [
    { label: "전체 메일", value: mails.length, icon: MailIcon, tint: "bg-orange-50 text-orange-600 dark:bg-orange-500/10" },
    { label: "안읽음", value: totalUnread, icon: Inbox, tint: "bg-blue-50 text-blue-600 dark:bg-blue-500/10" },
    { label: "별표", value: starredCount, icon: Star, tint: "bg-amber-50 text-amber-600 dark:bg-amber-500/10" },
    { label: "스누즈", value: snoozedCount, icon: Clock3, tint: "bg-purple-50 text-purple-600 dark:bg-purple-500/10" },
  ]

  const shortcuts: { label: string; desc: string; icon: ComponentType<{ className?: string }>; onClick: () => void }[] = [
    { label: "자동분류 규칙", desc: "메일 자동 정리", icon: Sparkles, onClick: onGoToCleanup },
    { label: "메모", desc: "빠르게 기록", icon: NotebookPen, onClick: onGoToMemo },
    { label: "임시보관함", desc: "작성 중인 메일", icon: Archive, onClick: onGoToDrafts },
    { label: "설정", desc: "계정 및 환경설정", icon: Settings, onClick: onOpenSettings },
  ]

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6 sm:p-10">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-orange-50 via-background to-background p-8 dark:from-orange-500/10">
          <div className="relative z-10 max-w-md">
            <h1 className="text-2xl font-bold tracking-tight">
              안녕하세요{name && `, ${name}님`} 👋
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              여러 계정의 메일을 한 곳에서 깔끔하게 관리하세요.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button onClick={() => onSelectAccount(null)} className="gap-2">
                <Inbox className="size-4" />
                전체 받은편지함 보기
              </Button>
              {onCompose && (
                <Button variant="outline" onClick={onCompose} className="gap-2">
                  <Pencil className="size-4" />
                  새 메일 작성
                </Button>
              )}
            </div>
          </div>
          <HeroIllustration className="pointer-events-none absolute -right-8 -top-8 hidden size-56 sm:block" />
        </div>

        {/* 통계 */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border bg-background p-4">
              <div className={cn("mb-3 flex size-9 items-center justify-center rounded-lg", s.tint)}>
                <s.icon className="size-[18px]" />
              </div>
              <p className="text-2xl font-semibold tabular-nums">{s.value.toLocaleString()}</p>
              <p className="text-muted-foreground text-xs">{s.label}</p>
            </div>
          ))}
        </div>

        {/* 연결된 계정 */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium">연결된 계정</h2>
            <span className="text-muted-foreground text-xs">{accounts.length}개 연결됨</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {accounts.map((account) => {
              const unread = unreadCountByAccount[account.id] ?? 0
              const displayText =
                account.provider === "gmail" || account.provider === "naver" ? account.email : account.label
              return (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => onSelectAccount(account.id)}
                  className="hover:bg-accent/50 flex items-center gap-3 rounded-xl border p-3.5 text-left transition-colors"
                >
                  <ProviderIcon provider={account.provider} label={account.provider === "imap" ? account.label : undefined} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{displayText}</span>
                  {unread > 0 && <Badge variant="secondary">{unread}</Badge>}
                </button>
              )
            })}
            {accounts.length === 0 && <p className="text-muted-foreground text-sm">연결된 계정이 없습니다.</p>}
          </div>
        </div>

        {/* 바로가기 */}
        <div>
          <h2 className="mb-3 text-sm font-medium">바로가기</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {shortcuts.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={s.onClick}
                className="hover:bg-accent/50 flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors"
              >
                <s.icon className="text-primary size-[18px]" />
                <span className="text-sm font-medium">{s.label}</span>
                <span className="text-muted-foreground text-xs">{s.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
