import { Pencil } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { sendMail } from "@/lib/api"
import type { Account } from "@/types/mail"

interface ComposeDialogProps {
  accounts: Account[]
  defaultAccountId?: string
  defaultTo?: string
  defaultSubject?: string
  trigger?: React.ReactNode
  onSent?: () => void
}

const COMPOSE_SUPPORTED: Array<Account["provider"]> = ["gmail", "naver", "daum"]

export function ComposeDialog({
  accounts,
  defaultAccountId,
  defaultTo = "",
  defaultSubject = "",
  trigger,
  onSent,
}: ComposeDialogProps) {
  const sendableAccounts = accounts.filter((a) => COMPOSE_SUPPORTED.includes(a.provider))
  const [open, setOpen] = useState(false)
  const [accountId, setAccountId] = useState(
    defaultAccountId && sendableAccounts.find((a) => a.id === defaultAccountId)
      ? defaultAccountId
      : sendableAccounts[0]?.id ?? "",
  )
  const [to, setTo] = useState(defaultTo)
  const [subject, setSubject] = useState(defaultSubject)
  const [body, setBody] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)

  const handleOpen = (v: boolean) => {
    setOpen(v)
    if (!v) {
      setError(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accountId) {
      setError("보내는 계정을 선택해주세요.")
      return
    }
    setError(null)
    setIsSending(true)
    const result = await sendMail(accountId, to.trim(), subject.trim(), body)
    setIsSending(false)
    if (!result.ok) {
      setError(result.error ?? "전송에 실패했습니다.")
      return
    }
    setOpen(false)
    setTo(defaultTo)
    setSubject(defaultSubject)
    setBody("")
    onSent?.()
  }

  if (sendableAccounts.length === 0) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger render={trigger ? <span /> : <Button size="sm" className="gap-2" />}>
        {trigger ?? (
          <>
            <Pencil className="size-4" />
            메일 쓰기
          </>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-0">
          <DialogHeader className="pb-4">
            <DialogTitle>새 메일</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="compose-from">보내는 계정</Label>
              <select
                id="compose-from"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                required
                className="border-input bg-background ring-offset-background focus:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none"
              >
                {sendableAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="compose-to">받는 사람</Label>
              <Input
                id="compose-to"
                type="email"
                placeholder="recipient@example.com"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="compose-subject">제목</Label>
              <Input
                id="compose-subject"
                type="text"
                placeholder="제목을 입력하세요"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="compose-body">내용</Label>
              <textarea
                id="compose-body"
                placeholder="내용을 입력하세요"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
                rows={8}
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[160px] w-full resize-y rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>
          <DialogFooter className="pt-4">
            <DialogClose render={<Button type="button" variant="outline" disabled={isSending} />}>
              취소
            </DialogClose>
            <Button type="submit" disabled={isSending}>
              {isSending ? "전송 중..." : "보내기"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
