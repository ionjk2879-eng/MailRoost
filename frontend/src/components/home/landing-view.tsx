import { Button } from "@/components/ui/button"
import { gmailLoginUrl } from "@/lib/api"
import { mockAccounts, mockMails } from "@/lib/mock-data"

const PREVIEW_MAILS = mockMails.slice(0, 4)

export function LandingView() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b px-6 py-4">
        <span className="text-lg font-semibold">MailRoost</span>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-10 px-6 py-12">
        {/* Hero */}
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              여기저기 흩어진 이메일을
              <br />
              한 곳에서
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Google 계정으로 로그인하면 Gmail과 네이버 메일을 한 화면에서 볼 수 있어요.
            </p>
          </div>

          <div className="flex flex-col items-center gap-2">
            <Button render={<a href={gmailLoginUrl} />} size="sm" className="gap-2 px-6">
              Google로 로그인
            </Button>
            <p className="text-muted-foreground text-xs">네이버 메일은 로그인 후 추가 연결할 수 있어요.</p>
          </div>
        </div>

        {/* Preview */}
        <div className="w-full">
          <div className="mb-3 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-muted-foreground text-xs">연결하면 이렇게 보여요</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="overflow-hidden rounded-xl border shadow-sm">
            <div className="bg-muted/40 flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
              {mockAccounts.map((account) => (
                <span
                  key={account.id}
                  className="bg-background flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs"
                >
                  <span className={`size-1.5 rounded-full ${account.color}`} />
                  {account.provider === "imap" ? account.label : account.email}
                </span>
              ))}
            </div>
            {PREVIEW_MAILS.map((mail) => {
              const account = mockAccounts.find((a) => a.id === mail.accountId)
              return (
                <div key={mail.id} className="flex items-start gap-3 border-b px-4 py-3 last:border-0">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${account?.color ?? "bg-gray-400"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs ${!mail.isRead ? "font-semibold" : "text-muted-foreground"}`}>
                        {mail.fromName}
                      </span>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {new Date(mail.receivedAt).toLocaleDateString("ko-KR", {
                          month: "numeric",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <p className={`truncate text-sm ${!mail.isRead ? "font-medium" : "text-muted-foreground"}`}>
                      {mail.subject}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">{mail.snippet}</p>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-muted-foreground mt-2 text-center text-xs">위 내용은 예시 데이터입니다</p>
        </div>
      </main>
    </div>
  )
}
