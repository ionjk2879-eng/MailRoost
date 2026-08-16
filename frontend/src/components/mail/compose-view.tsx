import { ChevronLeft, FileText, Loader2, MessageSquarePlus, Paperclip, Send, ShieldCheck, UserRound, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RecipientInput, type RecipientOption } from "@/components/mail/recipient-input"
import { createDraft, deleteDraft, sendMail, updateDraft } from "@/lib/api"
import type { Account, Draft, ForwardedAttachmentRef, Mail, QuickReply } from "@/types/mail"

export const COMPOSE_SUPPORTED: Array<Account["provider"]> = ["gmail", "naver", "daum", "imap"]

const SIGNATURE_MARKER = "\n\n-- \n"
const DRAFT_SAVE_DEBOUNCE_MS = 1500

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

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
  onDraftSaved?: (draft: Draft) => void
  onDraftDeleted?: (id: string) => void
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
  const [quickReplyOpen, setQuickReplyOpen] = useState(false)
  const quickReplyRef = useRef<HTMLDivElement>(null)

  const recipientOptions = useMemo<RecipientOption[]>(() => {
    const seen = new Map<string, RecipientOption>()
    for (const m of mails) {
      if (!m.fromEmail || seen.has(m.fromEmail.toLowerCase())) continue
      seen.set(m.fromEmail.toLowerCase(), { email: m.fromEmail, name: m.fromName })
    }
    return [...seen.values()]
  }, [mails])

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
    return () => { saveDraft() }
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
    setError(null)
    setIsSending(true)
    const result = await sendMail(
      accountId,
      to.trim(),
      subject.trim(),
      body,
      cc.trim() || undefined,
      bcc.trim() || undefined,
      forwardedAttachments.length > 0 ? forwardedAttachments : undefined,
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
    <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col bg-[#fffdfb] dark:bg-background">
      <div className="flex shrink-0 flex-col gap-3 border-b bg-gradient-to-r from-orange-50/80 via-background to-background px-5 py-4 sm:px-7 sm:py-5">
        {onBack && (
          <Button variant="ghost" size="sm" className="-ml-2 w-fit gap-1" onClick={onBack}>
            <ChevronLeft className="size-4" />
            목록으로
          </Button>
        )}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-500">Compose</p>
            <h2 className="mt-0.5 text-xl font-bold tracking-tight">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="작성 취소"
            className="text-muted-foreground hover:text-foreground hover:bg-accent flex size-9 shrink-0 items-center justify-center rounded-full border bg-background/80 shadow-sm transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
      {sendableAccounts.length === 0 ? (
        <div className="m-6 rounded-2xl border border-dashed p-8 text-center"><p className="text-muted-foreground text-sm">메일을 보낼 수 있는 계정이 없습니다.</p></div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-5 sm:px-7">
          <section className="overflow-visible rounded-2xl border bg-background shadow-sm">
          <div className="grid items-center gap-2 border-b px-4 py-3 sm:grid-cols-[100px_1fr] sm:px-5">
            <Label htmlFor="compose-from" className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><UserRound className="size-3.5" /> 보내는 사람</Label>
            <select
              id="compose-from"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              required
              className="h-10 w-full rounded-xl border border-transparent bg-muted/50 px-3 text-sm font-medium outline-none transition focus:border-orange-200 focus:bg-background focus:ring-2 focus:ring-orange-100"
            >
              {sendableAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.email}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 border-b px-4 py-3 sm:grid-cols-[100px_1fr] sm:px-5">
            <Label htmlFor="compose-to" className="flex items-center gap-2 pt-3 text-xs font-semibold text-muted-foreground"><Send className="size-3.5" /> 받는 사람</Label>
            <div>
            <div className="mb-1.5 flex justify-end">
              <div className="flex gap-2">
                {!showCc && (
                  <button type="button" onClick={() => setShowCc(true)} className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                    참조
                  </button>
                )}
                {!showBcc && (
                  <button type="button" onClick={() => setShowBcc(true)} className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
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
          </div>
          {showCc && (
            <div className="grid gap-2 border-b px-4 py-3 sm:grid-cols-[100px_1fr] sm:px-5">
              <Label htmlFor="compose-cc" className="pt-3 text-xs font-semibold text-muted-foreground">참조</Label>
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
            <div className="grid gap-2 border-b px-4 py-3 sm:grid-cols-[100px_1fr] sm:px-5">
              <Label htmlFor="compose-bcc" className="pt-3 text-xs font-semibold text-muted-foreground">숨은참조</Label>
              <RecipientInput
                id="compose-bcc"
                placeholder="bcc@example.com (여러 명은 콤마로 구분)"
                value={bcc}
                onChange={setBcc}
                options={recipientOptions}
              />
            </div>
          )}
          <div className="grid items-center gap-2 px-4 py-3 sm:grid-cols-[100px_1fr] sm:px-5">
            <Label htmlFor="compose-subject" className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><FileText className="size-3.5" /> 제목</Label>
            <Input
              id="compose-subject"
              type="text"
              placeholder="제목을 입력하세요"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className="h-10 border-transparent bg-muted/50 font-medium shadow-none focus-visible:border-orange-200 focus-visible:ring-orange-100"
            />
          </div>
          </section>
          {forwardedAttachments.length > 0 && (
            <section className="flex flex-col gap-2 rounded-2xl border bg-background p-4 shadow-sm">
              <Label className="flex items-center gap-2 text-xs font-semibold"><Paperclip className="size-3.5 text-orange-500" /> 첨부파일</Label>
              <div className="flex flex-wrap gap-2">
                {forwardedAttachments.map((att) => (
                  <div key={att.attachmentId} className="flex items-center gap-1.5 rounded-lg border bg-muted/40 py-1.5 pr-1.5 pl-2.5 text-xs">
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
            </section>
          )}
          <section className="flex min-h-[300px] flex-1 flex-col overflow-visible rounded-2xl border bg-background shadow-sm">
            <div className="flex items-center justify-between">
              <Label htmlFor="compose-body" className="px-5 py-3 text-xs font-semibold text-muted-foreground">메일 내용</Label>
              {quickReplies.length > 0 && (
                <div ref={quickReplyRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setQuickReplyOpen((v) => !v)}
                    className="mr-4 flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground"
                  >
                    <MessageSquarePlus className="size-3.5" />
                    빠른 답장 삽입
                  </button>
                  {quickReplyOpen && (
                    <div className="bg-background absolute top-full right-4 z-20 mt-1 max-h-56 w-64 overflow-y-auto rounded-xl border p-1 shadow-xl">
                      {quickReplies.map((qr) => (
                        <button
                          key={qr.id}
                          type="button"
                          onClick={() => insertQuickReply(qr)}
                          className="hover:bg-accent flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left"
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
              className="placeholder:text-muted-foreground min-h-[240px] w-full flex-1 resize-none border-0 border-t bg-transparent px-5 py-4 text-[15px] leading-7 outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </section>
          {error && <p className="text-destructive rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm">{error}</p>}
        </div>
      )}
      {sendableAccounts.length > 0 && (
        <div className="flex shrink-0 items-center gap-3 border-t bg-background/95 px-4 py-3 shadow-[0_-8px_24px_-20px_rgba(0,0,0,.35)] backdrop-blur sm:px-7">
          <span className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex"><ShieldCheck className="size-3.5 text-emerald-500" /> 작성 내용은 자동으로 임시 저장됩니다.</span>
          <div className="flex-1" />
          <Button type="button" variant="ghost" className="rounded-xl" disabled={isSending} onClick={onCancel}>
            취소
          </Button>
          <Button type="submit" className="min-w-28 gap-2 rounded-xl bg-orange-500 shadow-lg shadow-orange-500/20 hover:bg-orange-600" disabled={isSending}>
            {isSending ? <><Loader2 className="size-4 animate-spin" /> 전송 중...</> : <><Send className="size-4" /> 보내기</>}
          </Button>
        </div>
      )}
    </form>
  )
}
