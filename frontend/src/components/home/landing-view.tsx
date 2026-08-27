import { Check, ShieldCheck } from "lucide-react"
import { BrandMark } from "@/components/brand-mark"
import { ProviderIcon } from "@/components/mail/provider-icon"
import { Button } from "@/components/ui/button"
import { gmailLoginUrl } from "@/lib/api"
import { mockAccounts, mockMails } from "@/lib/mock-data"

const PREVIEW_MAILS = mockMails.slice(0, 3)

export function LandingView() {
  return (
    <div className="relative min-h-svh overflow-hidden bg-[#fffaf5] text-zinc-950 dark:bg-background dark:text-foreground">
      {/* 우측 상단에서 번지는 브랜드 온기 */}
      <div
        className="pointer-events-none absolute right-0 top-0 h-full w-2/3 opacity-70"
        style={{ background: "radial-gradient(ellipse 80% 70% at 100% 10%, oklch(0.91 0.06 55 / 0.45), transparent 65%)" }}
      />

      <header className="relative z-20 mx-auto flex h-20 w-full max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
        <div className="flex items-center gap-2.5">
          <BrandMark className="size-9 rounded-xl shadow-md shadow-orange-500/25" />
          <span className="text-xl font-bold tracking-[-0.04em]">
            Mail<span className="text-orange-500">Roost</span>
          </span>
        </div>
        <span className="hidden items-center gap-1.5 text-xs text-zinc-500 sm:flex dark:text-muted-foreground">
          <ShieldCheck className="size-3.5 text-emerald-500" />
          안전한 Google OAuth 로그인
        </span>
      </header>

      <main className="relative z-10 mx-auto grid min-h-[calc(100svh-5rem)] w-full max-w-[1440px] items-center gap-10 px-5 pb-10 sm:px-8 lg:grid-cols-[minmax(0,.86fr)_minmax(520px,1.14fr)] lg:px-12 lg:pb-12">
        <section className="mx-auto flex w-full max-w-xl flex-col py-6 lg:mx-0 lg:py-12">
          <div className="mb-6 flex w-fit items-center gap-2 rounded-full border border-orange-200/70 bg-orange-50/90 px-3.5 py-1.5 text-xs font-semibold text-orange-700 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-400">
            흩어진 메일을 한곳에
          </div>

          <h1 className="text-[2.55rem] font-bold leading-[1.08] tracking-[-0.055em] sm:text-5xl lg:text-[3.45rem]">
            모든 메일이 쉬어가는
            <br />
            <span className="text-orange-500">나만의 보금자리</span>
          </h1>
          <p className="mt-5 max-w-lg text-[15px] leading-7 text-zinc-500 sm:text-base dark:text-muted-foreground">
            Gmail부터 네이버, 다음 메일까지 한 화면에서 확인하고
            <br className="hidden sm:block" /> 중요한 소식은 놓치지 않게 정리해 보세요.
          </p>

          <div className="mt-9">
            <Button
              render={<a href={gmailLoginUrl} />}
              nativeButton={false}
              className="h-14 w-full justify-center gap-3 rounded-2xl bg-zinc-950 px-6 text-[15px] text-white shadow-lg shadow-zinc-900/20 transition hover:-translate-y-0.5 hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100"
            >
              <ProviderIcon provider="gmail" className="size-8 rounded-xl border-0" />
              Google로 시작하기
            </Button>
            <p className="mt-3.5 text-center text-[11px] leading-5 text-zinc-400/90">
              로그인 후 설정에서 네이버와 다음 메일도 연결할 수 있어요.
            </p>
          </div>

          <div className="mt-8 grid gap-2.5 text-xs text-zinc-500 sm:grid-cols-3 dark:text-muted-foreground">
            {["여러 계정 통합", "스마트 메일 정리", "빠르고 안전한 연결"].map((item) => (
              <span key={item} className="flex items-center gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10">
                  <Check className="size-3" strokeWidth={3} />
                </span>
                {item}
              </span>
            ))}
          </div>
        </section>

        <section className="relative mx-auto w-full max-w-2xl lg:max-w-none">
          <div className="relative min-h-[430px] overflow-hidden rounded-[28px] border border-white/60 bg-orange-100 shadow-[0_30px_80px_-30px_rgba(154,67,14,.5)] sm:min-h-[570px] lg:min-h-[min(690px,calc(100svh-8rem))] dark:border-white/10">
            <img
              src="/mailroost-login-hero.png"
              alt="새들이 편지를 나르는 따뜻한 가을 풍경의 메일 보금자리"
              className="absolute inset-0 size-full object-cover object-[55%_center]"
            />
            <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-orange-950/25 to-transparent" />

            <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-white/50 bg-white/88 p-3 shadow-xl backdrop-blur-md sm:inset-x-6 sm:bottom-6 sm:p-4">
              <div className="mb-2.5 flex items-center justify-between px-1">
                <div>
                  <p className="text-xs font-bold text-zinc-900">한눈에 보는 오늘의 메일</p>
                  <p className="mt-0.5 text-[10px] text-zinc-500">모든 계정의 새 소식을 한곳에서</p>
                </div>
                <div className="flex -space-x-1.5">
                  {mockAccounts.slice(0, 3).map((account) => (
                    <span key={account.id} className="rounded-lg ring-2 ring-white">
                      <ProviderIcon provider={account.provider} label={account.label} className="size-7" />
                    </span>
                  ))}
                </div>
              </div>
              <div className="overflow-hidden rounded-xl border border-orange-100/80 bg-white/95">
                {PREVIEW_MAILS.map((mail) => (
                  <div key={mail.id} className="flex items-center gap-2.5 border-b border-orange-50 px-3 py-2.5 last:border-0">
                    <span className="size-1.5 shrink-0 rounded-full bg-orange-500" />
                    <span className="w-20 shrink-0 truncate text-[10px] font-semibold text-zinc-700 sm:w-24">{mail.fromName}</span>
                    <span className="min-w-0 flex-1 truncate text-[10px] text-zinc-500 sm:text-[11px]">{mail.subject}</span>
                    <span className="text-[9px] text-zinc-400">
                      {new Date(mail.receivedAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="pointer-events-none absolute -bottom-4 left-12 right-12 -z-10 h-12 rounded-full bg-orange-400/25 blur-2xl" />
        </section>
      </main>
    </div>
  )
}
