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
import { connectNaverAccount } from "@/lib/api"

interface ConnectNaverDialogProps {
  label: string
  onConnected: () => void
  buttonClassName?: string
  icon?: React.ReactNode
}

export function ConnectNaverDialog({ label, onConnected, buttonClassName, icon }: ConnectNaverDialogProps) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [appPassword, setAppPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    const result = await connectNaverAccount(email.trim(), appPassword.trim())
    setIsSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setOpen(false)
    setEmail("")
    setAppPassword("")
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
            <DialogTitle>네이버 메일 연결</DialogTitle>
            <DialogDescription>
              네이버 로그인 비밀번호가 아니라, 네이버 2단계 인증을 켠 뒤 발급받는{" "}
              <strong>앱 비밀번호</strong>를 입력해주세요. 네이버 &gt; 보안설정 &gt; 2단계 인증
              &gt; IMAP/SMTP 사용에서 발급받을 수 있어요.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="naver-email">네이버 이메일</Label>
              <Input
                id="naver-email"
                type="email"
                placeholder="example@naver.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="naver-app-password">앱 비밀번호</Label>
              <Input
                id="naver-app-password"
                type="password"
                value={appPassword}
                onChange={(e) => setAppPassword(e.target.value)}
                required
              />
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
