import { ChevronLeft, X } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { sendMail } from "@/lib/api"
import type { Account } from "@/types/mail"

export const COMPOSE_SUPPORTED: Array<Account["provider"]> = ["gmail", "naver", "daum"]

interface ComposeViewProps {
  accounts: Account[]
  defaultAccountId?: string
  defaultTo?: string
  defaultSubject?: string
  onBack?: () => void
  onCancel: () => void
  onSent: () => void
}

export function ComposeView({
  accounts,
  defaultAccountId,
  defaultTo = "",
  defaultSubject = "",
  onBack,
  onCancel,
  onSent,
}: ComposeViewProps) {
  const sendableAccounts = accounts.filter((a) => COMPOSE_SUPPORTED.includes(a.provider))
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
    onSent()
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-3 p-6">
        {onBack && (
          <Button variant="ghost" size="sm" className="-ml-2 w-fit gap-1" onClick={onBack}>
            <ChevronLeft className="size-4" />
            목록으로
          </Button>
        )}
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">새 메일</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="작성 취소"
            className="text-muted-foreground hover:text-foreground hover:bg-accent flex size-8 shrink-0 items-center justify-center rounded-md transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
      {sendableAccounts.length === 0 ? (
        <p className="text-muted-foreground px-6 text-sm">메일을 보낼 수 있는 계정이 없습니다.</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 pb-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="compose-from">보내는 계정</Label>
            <select
              id="compose-from"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              required
              className="border-input bg-background h-9 w-full rounded-md border px-3 py-1 text-sm focus:outline-none"
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
          <div className="flex min-h-0 flex-1 flex-col gap-1.5">
            <Label htmlFor="compose-body">내용</Label>
            <textarea
              id="compose-body"
              placeholder="내용을 입력하세요"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              className="border-input bg-background placeholder:text-muted-foreground min-h-[160px] w-full flex-1 resize-none rounded-md border px-3 py-2 text-sm focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>
      )}
      {sendableAccounts.length > 0 && (
        <div className="flex shrink-0 items-center justify-end gap-2 border-t p-4">
          <Button type="button" variant="outline" disabled={isSending} onClick={onCancel}>
            취소
          </Button>
          <Button type="submit" disabled={isSending}>
            {isSending ? "전송 중..." : "보내기"}
          </Button>
        </div>
      )}
    </form>
  )
}
