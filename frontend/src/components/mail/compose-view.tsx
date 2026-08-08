import { ChevronLeft, Clock, MessageSquarePlus, Paperclip, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RecipientInput, type RecipientOption } from "@/components/mail/recipient-input"
import { createDraft, deleteDraft, scheduleMail, sendMail, updateDraft } from "@/lib/api"
import type { Account, Draft, ForwardedAttachmentRef, Mail, QuickReply, ScheduledMail } from "@/types/mail"

export const COMPOSE_SUPPORTED: Array<Account["provider"]> = ["gmail", "naver", "daum", "imap"]

// 서명 앞에 붙이는 구분자. 메일 클라이언트들이 흔히 쓰는 "-- " 관례를 따른다.
const SIGNATURE_MARKER = "\n\n-- \n"

interface ComposeViewProps {
  accounts: Account[]
  mails?: Mail[]
  quickReplies?: QuickReply[]
  title?: string
  defaultAccountId?: string
  defaultTo?: string
  defaultCc?: string
  defaultBcc?: string
  defaultSubject?: string
  defaultBody?: string
  defaultForwardedAttachments?: ForwardedAttachmentRef[]
  defaultDraftId?: string
  onBack?: () => void
  onCancel: () => void
  onSent: () => void
  onScheduled?: (mail: ScheduledMail) => void
  onDraftSaved?: (draft: Draft) => void
  onDraftDeleted?: (id: string) => void
}

// 작성을 멈춘 뒤 이만큼 지나면 임시보관함에 자동저장한다.
const DRAFT_SAVE_DEBOUNCE_MS = 1500

// datetime-local input이 요구하는 "로컬 시각" 형식으로 최소값(지금부터 5분 뒤)을 만든다.
function minScheduleValue(): string {
  const d = new Date(Date.now() + 5 * 60 * 1000)
  d.setSeconds(0, 0)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export function ComposeView({
  accounts,
  mails = [],
  quickReplies = [],
  title = "새 메일",
  defaultAccountId,
  defaultTo = "",
  defaultCc = "",
  defaultBcc = "",
  defaultSubject = "",
  defaultBody = "",
  defaultForwardedAttachments = [],
  defaultDraftId,
  onBack,
  onCancel,
  onSent,
  onScheduled,
  onDraftSaved,
  onDraftDeleted,
}: ComposeViewProps) {
  const sendableAccounts = accounts.filter((a) => COMPOSE_SUPPORTED.includes(a.provider))
  const [accountId, setAccountId] = useState(
    defaultAccountId && sendableAccounts.find((a) => a.id === defaultAccountId)
      ? defaultAccountId
      : sendableAccounts[0]?.id ?? "",
  )
  const [to, setTo] = useState(defaultTo)
  const [cc, setCc] = useState(defaultCc)
  const [bcc, setBcc] = useState(defaultBcc)
  const [showCc, setShowCc] = useState(defaultCc.trim().length > 0)
  const [showBcc, setShowBcc] = useState(defaultBcc.trim().length > 0)
  const [subject, setSubject] = useState(defaultSubject)
  const [body, setBody] = useState(defaultBody)
  const [forwardedAttachments, setForwardedAttachments] = useState(defaultForwardedAttachments)
  const [error, setError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduleAt, setScheduleAt] = useState("")
  const [quickReplyOpen, setQuickReplyOpen] = useState(false)
  const quickReplyRef = useRef<HTMLDivElement>(null)

  // 받은 메일의 보낸사람 목록에서 받는사람 자동완성 후보를 뽑는다.
  const recipientOptions = useMemo<RecipientOption[]>(() => {
    const seen = new Map<string, RecipientOption>()
    for (const m of mails) {
      if (!m.fromEmail || seen.has(m.fromEmail.toLowerCase())) continue
      seen.set(m.fromEmail.toLowerCase(), { email: m.fromEmail, name: m.fromName })
    }
    return [...seen.values()]
  }, [mails])

  // 임시보관함 자동저장: draftId는 렌더와 무관하게 최신 값을 유지해야 해서 ref로 들고 있는다.
  const draftIdRef = useRef<string | null>(defaultDraftId ?? null)
  const sentRef = useRef(false)
  const skipFirstAutosaveRef = useRef(true)
  const latestFieldsRef = useRef({ accountId, to, cc, bcc, subject, body, forwardedAttachments })
  latestFieldsRef.current = { accountId, to, cc, bcc, subject, body, forwardedAttachments }

  const saveDraft = async () => {
    if (sentRef.current) return
    const f = latestFieldsRef.current
    const hasContent = f.to.trim() || f.cc.trim() || f.bcc.trim() || f.subject.trim() || f.body.trim()
    if (!hasContent) return
    const fields = {
      accountId: f.accountId || undefined,
      to: f.to,
      cc: f.cc,
      bcc: f.bcc,
      subject: f.subject,
      body: f.body,
      forwardedAttachments: f.forwardedAttachments.length > 0 ? f.forwardedAttachments : undefined,
    }
    if (draftIdRef.current) {
      const result = await updateDraft(draftIdRef.current, fields)
      if (result.ok) onDraftSaved?.(result.draft)
    } else {
      const result = await createDraft(fields)
      if (result.ok) {
        draftIdRef.current = result.draft.id
        onDraftSaved?.(result.draft)
      }
    }
  }

  useEffect(() => {
    if (skipFirstAutosaveRef.current) {
      skipFirstAutosaveRef.current = false
      return
    }
    const timer = window.setTimeout(saveDraft, DRAFT_SAVE_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, to, cc, bcc, subject, body, forwardedAttachments])

  useEffect(() => {
    // 디바운스가 끝나기 전에 뒤로가기/취소로 화면을 나가도 마지막 내용을 놓치지 않게 저장한다
    // (발송에 성공했으면 sentRef가 막아준다).
    return () => {
      saveDraft()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!quickReplyOpen) return
    const handler = (e: MouseEvent) => {
      if (quickReplyRef.current && !quickReplyRef.current.contains(e.target as Node)) setQuickReplyOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [quickReplyOpen])

  // 계정을 고르면(또는 처음 열릴 때) 그 계정의 서명을 본문 끝에 자동으로 붙인다.
  // 계정을 바꾸면 이전 서명은 지우고 새 서명으로 교체한다. accounts는 세션 동안 거의 안 바뀌므로
  // 의도적으로 accountId 변경에만 반응시킨다.
  useEffect(() => {
    const signature = accounts.find((a) => a.id === accountId)?.signature?.trim()
    setBody((prev) => {
      const markerIndex = prev.indexOf(SIGNATURE_MARKER)
      const withoutSignature = markerIndex === -1 ? prev : prev.slice(0, markerIndex)
      return signature ? `${withoutSignature}${SIGNATURE_MARKER}${signature}` : withoutSignature
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId])

  const insertQuickReply = (qr: QuickReply) => {
    setBody((prev) => (prev.trim() ? `${prev}\n\n${qr.body}` : qr.body))
    setQuickReplyOpen(false)
  }

  const removeForwardedAttachment = (attachmentId: string) => {
    setForwardedAttachments((prev) => prev.filter((a) => a.attachmentId !== attachmentId))
  }

  // 발송/예약에 성공하면 자동저장된 임시보관 항목을 지운다 (없으면 아무 일도 안 함).
  const discardDraftAfterSend = () => {
    sentRef.current = true
    const id = draftIdRef.current
    if (!id) return
    draftIdRef.current = null
    deleteDraft(id)
    onDraftDeleted?.(id)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accountId) {
      setError("보내는 계정을 선택해주세요.")
      return
    }
    const attachments = forwardedAttachments.length > 0 ? forwardedAttachments : undefined

    if (showSchedule && scheduleAt) {
      const sendAt = new Date(scheduleAt).getTime()
      if (Number.isNaN(sendAt) || sendAt <= Date.now()) {
        setError("예약 시각은 현재보다 미래여야 합니다.")
        return
      }
      setError(null)
      setIsSending(true)
      const result = await scheduleMail(
        accountId,
        to.trim(),
        subject.trim(),
        body,
        sendAt,
        cc.trim() || undefined,
        bcc.trim() || undefined,
        attachments,
      )
      setIsSending(false)
      if (!result.ok) {
        setError(result.error ?? "예약발송 등록에 실패했습니다.")
        return
      }
      discardDraftAfterSend()
      onScheduled?.(result.scheduledMail)
      onSent()
      return
    }

    setError(null)
    setIsSending(true)
    const result = await sendMail(
      accountId,
      to.trim(),
      subject.trim(),
      body,
      cc.trim() || undefined,
      bcc.trim() || undefined,
      attachments,
    )
    setIsSending(false)
    if (!result.ok) {
      setError(result.error ?? "전송에 실패했습니다.")
      return
    }
    discardDraftAfterSend()
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
          <h2 className="text-lg font-semibold">{title}</h2>
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
            <div className="flex items-center justify-between">
              <Label htmlFor="compose-to">받는 사람</Label>
              <div className="flex gap-2">
                {!showCc && (
                  <button
                    type="button"
                    onClick={() => setShowCc(true)}
                    className="text-muted-foreground hover:text-foreground text-xs"
                  >
                    참조
                  </button>
                )}
                {!showBcc && (
                  <button
                    type="button"
                    onClick={() => setShowBcc(true)}
                    className="text-muted-foreground hover:text-foreground text-xs"
                  >
                    숨은참조
                  </button>
                )}
              </div>
            </div>
            <RecipientInput
              id="compose-to"
              placeholder="recipient@example.com (여러 명은 콤마로 구분)"
              value={to}
              onChange={setTo}
              options={recipientOptions}
              required
            />
          </div>
          {showCc && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="compose-cc">참조</Label>
              <RecipientInput
                id="compose-cc"
                placeholder="cc@example.com (여러 명은 콤마로 구분)"
                value={cc}
                onChange={setCc}
                options={recipientOptions}
              />
            </div>
          )}
          {showBcc && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="compose-bcc">숨은참조</Label>
              <RecipientInput
                id="compose-bcc"
                placeholder="bcc@example.com (여러 명은 콤마로 구분)"
                value={bcc}
                onChange={setBcc}
                options={recipientOptions}
              />
            </div>
          )}
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
          {forwardedAttachments.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label>첨부파일</Label>
              <div className="flex flex-wrap gap-2">
                {forwardedAttachments.map((att) => (
                  <div
                    key={att.attachmentId}
                    className="bg-muted flex items-center gap-1.5 rounded-md py-1 pr-1 pl-2 text-xs"
                  >
                    <Paperclip className="size-3.5 shrink-0" />
                    <span className="max-w-[160px] truncate">{att.filename}</span>
                    <span className="text-muted-foreground shrink-0">{formatFileSize(att.size)}</span>
                    <button
                      type="button"
                      onClick={() => removeForwardedAttachment(att.attachmentId)}
                      aria-label={`${att.filename} 첨부 제거`}
                      className="hover:bg-accent flex size-5 shrink-0 items-center justify-center rounded"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex min-h-0 flex-1 flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="compose-body">내용</Label>
              {quickReplies.length > 0 && (
                <div ref={quickReplyRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setQuickReplyOpen((v) => !v)}
                    className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
                  >
                    <MessageSquarePlus className="size-3.5" />
                    빠른 답장 삽입
                  </button>
                  {quickReplyOpen && (
                    <div className="bg-background absolute top-full right-0 z-20 mt-1 max-h-56 w-56 overflow-y-auto rounded-md border shadow-md">
                      {quickReplies.map((qr) => (
                        <button
                          key={qr.id}
                          type="button"
                          onClick={() => insertQuickReply(qr)}
                          className="hover:bg-accent flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left"
                        >
                          <span className="truncate text-sm">{qr.title}</span>
                          <span className="text-muted-foreground w-full truncate text-xs">{qr.body}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
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
        <div className="flex shrink-0 flex-col gap-2 border-t p-4">
          {showSchedule && (
            <div className="flex items-center gap-2">
              <Clock className="text-muted-foreground size-4 shrink-0" />
              <input
                type="datetime-local"
                value={scheduleAt}
                min={minScheduleValue()}
                onChange={(e) => setScheduleAt(e.target.value)}
                className="border-input bg-background h-9 flex-1 rounded-md border px-3 text-sm focus:outline-none"
              />
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setShowSchedule((v) => !v)
                if (showSchedule) setScheduleAt("")
              }}
              className={`flex items-center gap-1 text-xs ${showSchedule ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Clock className="size-3.5" />
              예약발송
            </button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" disabled={isSending} onClick={onCancel}>
                취소
              </Button>
              <Button type="submit" disabled={isSending || (showSchedule && !scheduleAt)}>
                {isSending ? (showSchedule ? "예약 중..." : "전송 중...") : showSchedule ? "예약 등록" : "보내기"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </form>
  )
}
