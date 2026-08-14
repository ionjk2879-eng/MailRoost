import { Plus } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { connectImapAccount } from "@/lib/api"

interface ConnectImapDialogProps {
  label: string
  onConnected: () => void
  buttonClassName?: string
  icon?: React.ReactNode
}

// IMAP 서버 이름에서 SMTP 서버 이름을 추측한다 (imap.example.com -> smtp.example.com).
// 사용자가 직접 입력하면 그 뒤로는 자동 추측을 멈춘다.
function guessSmtpHost(imapHost: string): string {
  if (!imapHost) return ""
  return imapHost.startsWith("imap.") ? imapHost.replace(/^imap\./, "smtp.") : `smtp.${imapHost}`
}

export function ConnectImapDialog({ label, onConnected, buttonClassName, icon }: ConnectImapDialogProps) {
  const [open, setOpen] = useState(false)
  const [host, setHost] = useState("")
  const [port, setPort] = useState("993")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [accountLabel, setAccountLabel] = useState("")
  const [smtpHost, setSmtpHost] = useState("")
  const [smtpPort, setSmtpPort] = useState("465")
  const [smtpHostTouched, setSmtpHostTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleHostChange = (value: string) => {
    setHost(value)
    if (!smtpHostTouched) setSmtpHost(guessSmtpHost(value.trim()))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    const result = await connectImapAccount({
      host: host.trim(),
      port: Number(port) || 993,
      email: email.trim(),
      password: password.trim(),
      label: accountLabel.trim() || host.trim(),
      smtpHost: smtpHost.trim() || guessSmtpHost(host.trim()),
      smtpPort: Number(smtpPort) || 465,
    })
    setIsSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setOpen(false)
    setHost("")
    setPort("993")
    setEmail("")
    setPassword("")
    setAccountLabel("")
    setSmtpHost("")
    setSmtpPort("465")
    setSmtpHostTouched(false)
    onConnected()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className={buttonClassName ?? "w-full justify-start gap-2"} />
        }
      >
        {icon ?? <Plus className="size-4" />}
        {label}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>IMAP 메일 연결</DialogTitle>
            <DialogDescription>
              IMAP over SSL(포트 993)을 지원하는 메일 서버를 연결합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Label htmlFor="imap-host">IMAP 서버</Label>
                <Input
                  id="imap-host"
                  type="text"
                  placeholder="imap.example.com"
                  value={host}
                  onChange={(e) => handleHostChange(e.target.value)}
                  required
                />
              </div>
              <div className="flex w-20 shrink-0 flex-col gap-1.5">
                <Label htmlFor="imap-port">포트</Label>
                <Input
                  id="imap-port"
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="imap-email">이메일 (로그인 ID)</Label>
              <Input
                id="imap-email"
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="imap-password">비밀번호</Label>
              <Input
                id="imap-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="imap-label">표시 이름 (선택)</Label>
              <Input
                id="imap-label"
                type="text"
                placeholder="회사 메일"
                value={accountLabel}
                onChange={(e) => setAccountLabel(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5 border-t pt-4">
              <p className="text-muted-foreground text-xs">메일 보내기에 쓸 SMTP 서버 (자동으로 추측되며, 필요하면 직접 수정하세요)</p>
              <div className="flex gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Label htmlFor="smtp-host">SMTP 서버</Label>
                  <Input
                    id="smtp-host"
                    type="text"
                    placeholder="smtp.example.com"
                    value={smtpHost}
                    onChange={(e) => {
                      setSmtpHost(e.target.value)
                      setSmtpHostTouched(true)
                    }}
                  />
                </div>
                <div className="flex w-20 shrink-0 flex-col gap-1.5">
                  <Label htmlFor="smtp-port">포트</Label>
                  <Input
                    id="smtp-port"
                    type="number"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(e.target.value)}
                  />
                </div>
              </div>
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>취소</DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "연결 중..." : "연결"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
