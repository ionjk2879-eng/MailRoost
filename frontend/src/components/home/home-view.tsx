import {
  Archive,
  ArrowRight,
  BellRing,
  Clock3,
  Inbox,
  Mail as MailIcon,
  NotebookPen,
  Pencil,
  Settings,
  Sparkles,
  Star,
  Trash2,
  WandSparkles,
} from "lucide-react"
import type { ComponentType } from "react"
import { Button } from "@/components/ui/button"
import { ProviderIcon } from "@/components/mail/provider-icon"
import { cn } from "@/lib/utils"
import type { Account, Mail } from "@/types/mail"

interface HomeViewProps {
  accounts: Account[]
  mails: Mail[]
  unreadCountByAccount: Record<string, number>
  snoozedCount: number
  trashCount: number
  currentUserEmail?: string
  onSelectAccount: (accountId: string | null) => void
  onCompose?: () => void
  onGoToCleanup: () => void
  onGoToMemo: () => void
  onGoToDrafts: () => void
  onGoToTrash: () => void
  onGoToStarred: () => void
  onOpenSettings: () => void
}

function displayNameFromEmail(email?: string): string {
  return email ? email.split("@")[0] : "사용자"
}

export function HomeView({
  accounts,
  mails,
  unreadCountByAccount,
  snoozedCount,
  trashCount,
  currentUserEmail,
  onSelectAccount,
  onCompose,
  onGoToCleanup,
  onGoToMemo,
  onGoToDrafts,
  onGoToTrash,
  onGoToStarred,
  onOpenSettings,
}: HomeViewProps) {
  const totalUnread = Object.values(unreadCountByAccount).reduce((sum, n) => sum + n, 0)
  const starredCount = mails.filter((mail) => mail.isStarred).length
  const name = displayNameFromEmail(currentUserEmail)

  const stats: {
    label: string
    value: number
    icon: ComponentType<{ className?: string }>
    tint: string
    trend: string
    onClick: () => void
  }[] = [
    { label: "전체 메일", value: mails.length, icon: MailIcon, tint: "bg-orange-50 text-orange-500", trend: "모든 계정", onClick: () => onSelectAccount(null) },
    { label: "안 읽은 메일", value: totalUnread, icon: Inbox, tint: "bg-blue-50 text-blue-500", trend: "확인 필요", onClick: () => onSelectAccount(null) },
    { label: "중요 메일", value: starredCount, icon: Star, tint: "bg-amber-50 text-amber-500", trend: "별표 표시", onClick: onGoToStarred },
    { label: "스누즈 메일", value: snoozedCount, icon: Clock3, tint: "bg-violet-50 text-violet-500", trend: "나중에 알림", onClick: () => onSelectAccount(null) },
    { label: "휴지통", value: trashCount, icon: Trash2, tint: "bg-rose-50 text-rose-500", trend: "삭제한 메일", onClick: onGoToTrash },
  ]

  const shortcuts: { label: string; desc: string; icon: ComponentType<{ className?: string }>; onClick: () => void }[] = [
    { label: "스마트 분류", desc: "자동 분류 및 라벨링", icon: Sparkles, onClick: onGoToCleanup },
    { label: "중복 메일 정리", desc: "한 번에 깔끔하게", icon: MailIcon, onClick: onGoToCleanup },
    { label: "AI 요약", desc: "긴 메일 핵심만 보기", icon: WandSparkles, onClick: onGoToMemo },
    { label: "임시보관함", desc: "작성 중인 메일 확인", icon: Archive, onClick: onGoToDrafts },
  ]

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-[#fffdfb] dark:bg-background">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-4 py-5 sm:px-7 lg:px-10 lg:py-8">
        <section className="relative min-h-[245px] overflow-hidden rounded-[28px] border border-orange-100 bg-[#fff7ef] shadow-[0_18px_55px_-35px_rgba(235,100,20,.55)] sm:min-h-[285px]">
          <img
            src="/mailroost-autumn-hero.png"
            alt="가을 풍경 속 새들의 우편함"
            className="absolute inset-0 size-full object-cover object-[64%_center] dark:opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#fffaf5] via-[#fffaf5]/95 to-transparent sm:via-[#fffaf5]/70" />
          <div className="relative z-10 flex min-h-[245px] max-w-xl flex-col justify-center px-6 py-8 sm:min-h-[285px] sm:px-10">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">Your smart mailbox</p>
            <h1 className="text-3xl font-bold tracking-[-0.04em] text-zinc-950 sm:text-4xl">
              안녕하세요, {name}님! <span aria-hidden="true">👋</span>
            </h1>
            <p className="mt-3 text-sm text-zinc-600 sm:text-base">여러 계정의 메일을 한 곳에서 깔끔하게 관리하세요.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={() => onSelectAccount(null)} className="h-11 gap-2 rounded-xl bg-orange-500 px-5 shadow-lg shadow-orange-500/20 hover:bg-orange-600">
                <Inbox className="size-4" /> 전체 받은편지함 보기
              </Button>
              {onCompose && (
                <Button variant="outline" onClick={onCompose} className="h-11 gap-2 rounded-xl border-orange-200 bg-white/90 px-5 text-orange-600 hover:bg-orange-50">
                  <Pencil className="size-4" /> 새 메일 작성
                </Button>
              )}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {stats.map((stat) => (
            <button key={stat.label} type="button" onClick={stat.onClick} className="group flex items-center gap-4 rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md dark:bg-card">
              <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-full", stat.tint)}><stat.icon className="size-6" /></span>
              <span className="min-w-0">
                <span className="block text-xs font-medium text-muted-foreground">{stat.label}</span>
                <span className="mt-0.5 block text-2xl font-bold tabular-nums">{stat.value.toLocaleString()}</span>
                <span className="block truncate text-[10px] text-emerald-600">{stat.trend}</span>
              </span>
            </button>
          ))}
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm dark:bg-card">
          <div className="mb-4 flex items-center justify-between">
            <div><h2 className="font-semibold">연결된 계정</h2><p className="mt-1 text-xs text-muted-foreground">{accounts.length}개의 계정이 연결되어 있습니다.</p></div>
            <Button variant="outline" size="sm" className="gap-2 rounded-lg" onClick={onOpenSettings}><Settings className="size-3.5" /> 계정 관리</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {accounts.map((account) => {
              const unread = unreadCountByAccount[account.id] ?? 0
              const displayText = account.provider === "imap" ? account.label : account.email
              return (
                <button key={account.id} type="button" onClick={() => onSelectAccount(account.id)} className="flex min-w-0 items-center gap-3 rounded-xl border bg-background/60 p-3 text-left transition hover:border-orange-200 hover:bg-orange-50/50">
                  <ProviderIcon provider={account.provider} label={account.provider === "imap" ? account.label : undefined} />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{displayText}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{unread}</span>
                </button>
              )
            })}
            {accounts.length === 0 && <p className="text-sm text-muted-foreground">설정에서 첫 메일 계정을 연결해 보세요.</p>}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[.9fr_1.45fr_.8fr]">
          <section className="rounded-2xl border bg-white p-5 shadow-sm dark:bg-card">
            <h2 className="font-semibold">최근 메일함</h2>
            <div className="mt-4 space-y-1">
              {stats.slice(0, 5).map((stat) => (
                <button key={stat.label} type="button" onClick={stat.onClick} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted">
                  <stat.icon className="size-4 text-orange-500" /><span className="flex-1 text-left">{stat.label}</span><span className="tabular-nums text-muted-foreground">{stat.value.toLocaleString()}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => onSelectAccount(null)} className="mt-3 flex w-full items-center justify-end gap-1 text-xs font-semibold text-orange-500">전체 보기 <ArrowRight className="size-3.5" /></button>
          </section>

          <section className="rounded-2xl border bg-white p-5 shadow-sm dark:bg-card">
            <div><h2 className="font-semibold">스마트 정리 도구</h2><p className="mt-1 text-xs text-muted-foreground">메일을 자동으로 분류하고 중요한 내용을 놓치지 마세요.</p></div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {shortcuts.map((shortcut) => (
                <button key={shortcut.label} type="button" onClick={shortcut.onClick} className="flex items-center gap-3 rounded-xl border p-3 text-left transition hover:border-orange-200 hover:bg-orange-50/50">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-orange-50 text-orange-500"><shortcut.icon className="size-4" /></span>
                  <span className="min-w-0"><span className="block text-xs font-semibold">{shortcut.label}</span><span className="block truncate text-[10px] text-muted-foreground">{shortcut.desc}</span></span>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-5 shadow-sm dark:bg-card">
            <div className="flex items-center justify-between"><h2 className="font-semibold">오늘의 요약</h2><span className="text-[10px] text-muted-foreground">방금 전</span></div>
            <div className="mt-4 space-y-3.5 text-sm">
              <div className="flex items-center gap-3"><MailIcon className="size-4 text-blue-500" /><span className="flex-1">새로운 메일</span><b>{totalUnread}</b></div>
              <div className="flex items-center gap-3"><Star className="size-4 text-amber-500" /><span className="flex-1">중요 메일</span><b>{starredCount}</b></div>
              <div className="flex items-center gap-3"><BellRing className="size-4 text-red-500" /><span className="flex-1">스누즈 알림</span><b>{snoozedCount}</b></div>
              <div className="flex items-center gap-3"><NotebookPen className="size-4 text-violet-500" /><span className="flex-1">연결 계정</span><b>{accounts.length}</b></div>
            </div>
          </section>
        </div>

        <section className="flex flex-col items-center gap-4 rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 to-white px-6 py-5 sm:flex-row dark:from-orange-500/10 dark:to-card">
          <span className="flex size-12 items-center justify-center rounded-full bg-orange-100 text-orange-500"><Sparkles className="size-6" /></span>
          <div className="flex-1 text-center sm:text-left"><h2 className="font-bold">메일 관리, 더 똑똑하게!</h2><p className="mt-1 text-xs text-muted-foreground">스마트 분류와 정리 도구로 시간을 절약하고 효율을 높여보세요.</p></div>
          <Button onClick={onGoToCleanup} className="gap-2 rounded-xl bg-orange-500 hover:bg-orange-600"><Sparkles className="size-4" /> 스마트 기능 살펴보기</Button>
        </section>
      </div>
    </div>
  )
}
