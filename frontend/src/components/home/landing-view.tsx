import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { loginUser, signup } from "@/lib/api"
import { mockAccounts, mockMails } from "@/lib/mock-data"

type Mode = "login" | "signup"

interface LandingViewProps {
  onAuthSuccess: (user: { id: string; email: string }) => void
}

const PREVIEW_MAILS = mockMails.slice(0, 4)

export function LandingView({ onAuthSuccess }: LandingViewProps) {
  const [mode, setMode] = useState<Mode>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (mode === "signup" && password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.")
      return
    }

    setIsSubmitting(true)
    const result =
      mode === "signup"
        ? await signup(email.trim(), password)
        : await loginUser(email.trim(), password)
    setIsSubmitting(false)

    if (!result.ok) {
      setError(result.error)
      return
    }
    onAuthSuccess(result.user)
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setPassword("")
    setConfirmPassword("")
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b px-6 py-4">
        <span className="text-lg font-semibold">MailRoost</span>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-10 px-6 py-12">
        {/* Hero */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            여기저기 흩어진 이메일을
            <br />
            한 곳에서
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Gmail, 네이버 메일을 연결하면 모든 메일을 한 화면에서 볼 수 있어요.
          </p>
        </div>

        {/* Auth form */}
        <div className="w-full rounded-xl border p-6">
          {/* Mode tabs */}
          <div className="mb-5 flex gap-1 rounded-lg bg-muted p-1">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                  mode === m
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "login" ? "로그인" : "회원가입"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="auth-email">이메일</Label>
              <Input
                id="auth-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="auth-password">비밀번호</Label>
              <Input
                id="auth-password"
                type="password"
                placeholder={mode === "signup" ? "8자 이상" : ""}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </div>
            {mode === "signup" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="auth-confirm">비밀번호 확인</Label>
                <Input
                  id="auth-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
            )}
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button type="submit" disabled={isSubmitting} className="mt-1">
              {isSubmitting
                ? mode === "login"
                  ? "로그인 중..."
                  : "가입 중..."
                : mode === "login"
                  ? "로그인"
                  : "회원가입"}
            </Button>
          </form>
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
