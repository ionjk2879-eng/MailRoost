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
import { connectDaumAccount } from "@/lib/api"

interface ConnectDaumDialogProps {
  label: string
  onConnected: () => void
  buttonClassName?: string
}

export function ConnectDaumDialog({ label, onConnected, buttonClassName }: ConnectDaumDialogProps) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    const result = await connectDaumAccount(email.trim(), password.trim())
    setIsSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setOpen(false)
    setEmail("")
    setPassword("")
    onConnected()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className={buttonClassName ?? "w-full justify-start gap-2"} />
        }
      >
        <Plus className="size-4" />
        {label}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>다음 메일 연결</DialogTitle>
            <DialogDescription>
              카카오 계정(다음 메일)의 이메일 주소와 비밀번호를 입력해주세요.
              IMAP 접근을 허용하려면 다음 메일 설정에서 IMAP/POP3 사용을 켜두어야 합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="daum-email">다음 이메일</Label>
              <Input
                id="daum-email"
                type="email"
                placeholder="example@daum.net"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="daum-password">비밀번호</Label>
              <Input
                id="daum-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
