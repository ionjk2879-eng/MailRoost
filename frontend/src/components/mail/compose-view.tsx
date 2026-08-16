import { BookUser, ChevronLeft, FileText, Lightbulb, Loader2, MessageSquarePlus, Paperclip, Plus, Save, Send, Trash2, UploadCloud, UserRound, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RecipientInput, type RecipientOption } from "@/components/mail/recipient-input"
import { ProviderIcon } from "@/components/mail/provider-icon"
import { RichTextEditor } from "@/components/mail/rich-text-editor"
import { createContact, createDraft, deleteContact, deleteDraft, fetchContacts, sendMail, updateDraft } from "@/lib/api"
import type { Account, Contact, Draft, ForwardedAttachmentRef, Mail, QuickReply } from "@/types/mail"

export const COMPOSE_SUPPORTED: Array<Account["provider"]> = ["gmail", "naver", "daum", "imap"]

const SIGNATURE_MARKER = "<!--mailroost-signature-->"
const DRAFT_SAVE_DEBOUNCE_MS = 1500

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function escapeHtml(value: string): string { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") }
function toEditorHtml(value: string): string { return /<\/?[a-z][\s\S]*>/i.test(value) ? value : escapeHtml(value).replace(/\n/g, "<br>") }
function htmlToText(value: string): string { return value.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/p>|<\/div>|<\/li>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim() }
interface LocalAttachment { id: string; filename: string; mimeType: string; size: number; dataBase64: string }

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
  const [body, setBody] = useState(() => toEditorHtml(defaultBody))
  const [forwardedAttachments, setForwardedAttachments] = useState(defaultForwardedAttachments)
  const [localAttachments, setLocalAttachments] = useState<LocalAttachment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [quickReplyOpen, setQuickReplyOpen] = useState(false)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [addressBookOpen, setAddressBookOpen] = useState(false)
  const [contactName, setContactName] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [contactError, setContactError] = useState<string | null>(null)
  const quickReplyRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const selectedAccount = sendableAccounts.find((account) => account.id === accountId)

  const recipientOptions = useMemo<RecipientOption[]>(() => {
    const seen = new Map<string, RecipientOption>()
    for (const contact of contacts) seen.set(contact.email.toLowerCase(), { email: contact.email, name: contact.name, source: "contact" })
    for (const m of mails) {
      if (!m.fromEmail || seen.has(m.fromEmail.toLowerCase())) continue
      seen.set(m.fromEmail.toLowerCase(), { email: m.fromEmail, name: m.fromName, source: "recent" })
    }
    return [...seen.values()]
  }, [contacts, mails])

  useEffect(() => { fetchContacts().then(setContacts) }, [])

  const handleCreateContact = async () => {
    const result = await createContact(contactName, contactEmail)
    if (!result.ok) { setContactError(result.error); return }
    setContacts((items) => [result.contact, ...items])
    setContactName(""); setContactEmail(""); setContactError(null)
  }

  const handleDeleteContact = async (id: string) => {
    if (await deleteContact(id)) setContacts((items) => items.filter((item) => item.id !== id))
  }

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
      return signature ? `${withoutSignature}${SIGNATURE_MARKER}<br><br>--<br>${escapeHtml(signature).replace(/\n/g, "<br>")}` : withoutSignature
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId])

  const insertQuickReply = (qr: QuickReply) => {
    const replyHtml = toEditorHtml(qr.body)
    setBody((prev) => (prev.trim() ? `${prev}<br><br>${replyHtml}` : replyHtml))
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
      htmlToText(body),
      cc.trim() || undefined,
      bcc.trim() || undefined,
      forwardedAttachments.length > 0 ? forwardedAttachments : undefined,
      body,
      localAttachments.length > 0 ? localAttachments.map(({ filename, mimeType, size, dataBase64 }) => ({ filename, mimeType, size, dataBase64 })) : undefined,
    )
    setIsSending(false)
    if (!result.ok) {
      setError(result.error ?? "전송에 실패했습니다.")
      return
    }
    discardDraftAfterSend()
    onSent()
  }

  const addFiles = async (files: FileList | File[]) => {
    const picked = Array.from(files)
    const total = localAttachments.reduce((sum, item) => sum + item.size, 0) + picked.reduce((sum, file) => sum + file.size, 0)
    if (total > 25 * 1024 * 1024) { setError("첨부파일은 총 25MB까지 추가할 수 있습니다."); return }
    const encoded = await Promise.all(picked.map((file) => new Promise<LocalAttachment>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve({ id: crypto.randomUUID(), filename: file.name, mimeType: file.type || "application/octet-stream", size: file.size, dataBase64: String(reader.result).split(",")[1] ?? "" })
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })))
    setLocalAttachments((items) => [...items, ...encoded]); setError(null)
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
          <div className="flex items-center gap-2">
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
      </div>
      {sendableAccounts.length === 0 ? (
        <div className="m-6 rounded-2xl border border-dashed p-8 text-center"><p className="text-muted-foreground text-sm">메일을 보낼 수 있는 계정이 없습니다.</p></div>
      ) : (
        <div className="grid min-h-0 flex-1 overflow-y-auto xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="flex min-w-0 flex-col gap-5 px-4 py-5 sm:px-7 xl:border-r">
          <div className="hidden items-center justify-end gap-2 sm:flex">
            <Button type="button" variant="outline" className="gap-2 rounded-xl" disabled={isSending} onClick={() => saveDraft()}><Save className="size-4" /> 임시보관</Button>
            <Button type="submit" className="min-w-28 gap-2 rounded-xl bg-orange-500 shadow-lg shadow-orange-500/20 hover:bg-orange-600" disabled={isSending}>
              {isSending ? <><Loader2 className="size-4 animate-spin" /> 전송 중...</> : <><Send className="size-4" /> 보내기</>}
            </Button>
          </div>
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
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-[220px] flex-1">
                <RecipientInput
                  id="compose-to"
                  placeholder="이메일 주소 입력 또는 연락처 선택"
                  value={to}
                  onChange={setTo}
                  options={recipientOptions}
                  required
                />
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" onClick={() => setAddressBookOpen((open) => !open)} className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-orange-600 hover:bg-orange-50"><BookUser className="size-3" /> 주소록</button>
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
            {addressBookOpen && (
              <div className="mt-2 overflow-hidden rounded-xl border bg-background shadow-lg">
                <div className="grid gap-2 border-b bg-muted/30 p-3 sm:grid-cols-[1fr_1.4fr_auto]">
                  <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="이름" className="h-9" />
                  <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="email@example.com" type="email" required className="h-9" />
                  <Button type="button" onClick={handleCreateContact} size="sm" className="h-9 gap-1"><Plus className="size-3.5" /> 저장</Button>
                  {contactError && <p className="text-destructive text-xs sm:col-span-3">{contactError}</p>}
                </div>
                <div className="max-h-48 overflow-y-auto p-1">
                  {contacts.length === 0 ? <p className="p-3 text-center text-xs text-muted-foreground">저장된 주소가 없습니다.</p> : contacts.map((contact) => (
                    <div key={contact.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted">
                      <button type="button" onClick={() => { setTo((value) => `${value}${value.trim() ? ", " : ""}${contact.email}, `); setAddressBookOpen(false) }} className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-xs font-semibold">{contact.name}</span><span className="block truncate text-[10px] text-muted-foreground">{contact.email}</span>
                      </button>
                      <button type="button" onClick={() => handleDeleteContact(contact.id)} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`${contact.name} 삭제`}><Trash2 className="size-3.5" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
              <div className="flex items-center gap-1">
              <button type="button" onClick={() => fileInputRef.current?.click()} className="mr-1 flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm hover:bg-muted xl:hidden"><Paperclip className="size-3.5" /> 파일 첨부</button>
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
            </div>
            <RichTextEditor value={body} onChange={setBody} />
          </section>
          {error && <p className="text-destructive rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm">{error}</p>}
          </div>
          <aside className="hidden min-w-0 flex-col gap-6 bg-background px-5 py-6 xl:flex">
            <section>
              <h3 className="text-sm font-bold">발신 계정</h3>
              {selectedAccount && (
                <div className="mt-3 flex items-center gap-3 rounded-xl border p-3 shadow-sm">
                  <ProviderIcon provider={selectedAccount.provider} label={selectedAccount.email} className="size-9 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{selectedAccount.email}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{selectedAccount.label}</p>
                  </div>
                </div>
              )}
            </section>
            <section>
              <div className="flex items-center justify-between"><h3 className="text-sm font-bold">파일 첨부</h3><Paperclip className="size-4 text-orange-500" /></div>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = "" }} />
              <button type="button" onClick={() => fileInputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files) }} className="mt-3 flex w-full flex-col items-center rounded-xl border border-dashed p-4 text-center transition hover:border-orange-300 hover:bg-orange-50/50">
                <UploadCloud className="size-5 text-orange-500" /><span className="mt-1 text-xs font-semibold">파일 선택 또는 드롭</span><span className="mt-0.5 text-[10px] text-muted-foreground">총 25MB까지</span>
              </button>
              <div className="mt-2 space-y-1">
                {localAttachments.map((file) => <div key={file.id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-2 py-1.5"><Paperclip className="size-3.5" /><span className="min-w-0 flex-1 truncate text-[11px]">{file.filename}</span><span className="text-[9px] text-muted-foreground">{formatFileSize(file.size)}</span><button type="button" onClick={() => setLocalAttachments((items) => items.filter((item) => item.id !== file.id))} aria-label={`${file.filename} 삭제`}><X className="size-3.5" /></button></div>)}
              </div>
            </section>
            <section>
              <div className="flex items-center justify-between"><h3 className="text-sm font-bold">빠른 답장</h3><MessageSquarePlus className="size-4 text-orange-500" /></div>
              <div className="mt-3 space-y-2">
                {quickReplies.length > 0 ? quickReplies.slice(0, 5).map((reply) => (
                  <button key={reply.id} type="button" onClick={() => insertQuickReply(reply)} className="w-full rounded-xl border p-3 text-left transition hover:border-orange-200 hover:bg-orange-50/50">
                    <span className="block truncate text-xs font-semibold">{reply.title}</span>
                    <span className="mt-1 block truncate text-[10px] text-muted-foreground">{reply.body}</span>
                  </button>
                )) : <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">설정에서 자주 쓰는 답장을 등록해 보세요.</p>}
              </div>
            </section>
            <section className="mt-auto rounded-2xl bg-orange-50 p-4 dark:bg-orange-500/10">
              <div className="flex items-center gap-2 text-xs font-bold text-orange-600"><Lightbulb className="size-4" /> TIP</div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">작성 중인 메일은 자동으로 임시보관함에 저장됩니다. 자주 쓰는 문구는 빠른 답장으로 관리할 수 있어요.</p>
            </section>
          </aside>
        </div>
      )}
      {sendableAccounts.length > 0 && (
        <div className="flex shrink-0 items-center gap-3 border-t bg-background/95 px-4 py-3 shadow-[0_-8px_24px_-20px_rgba(0,0,0,.35)] backdrop-blur sm:hidden">
          <Button type="submit" className="min-w-28 gap-2 rounded-xl bg-orange-500 shadow-lg shadow-orange-500/20 hover:bg-orange-600" disabled={isSending}>
            {isSending ? <><Loader2 className="size-4 animate-spin" /> 전송 중...</> : <><Send className="size-4" /> 보내기</>}
          </Button>
          <Button type="button" variant="outline" className="gap-2 rounded-xl" disabled={isSending} onClick={() => saveDraft()}><Save className="size-4" /> 임시보관</Button>
          <div className="flex-1" />
          <Button type="button" variant="ghost" className="rounded-xl" disabled={isSending} onClick={onCancel}>취소</Button>
        </div>
      )}
    </form>
  )
}
