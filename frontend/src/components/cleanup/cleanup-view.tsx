import { AlertTriangle, Loader2, Plus, X } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { AutoRulesView } from "@/components/cleanup/auto-rules-view"
import type { RuleConditions } from "@/lib/api"
import type { Account, AutoClassifyRule, Contact, Mail, MailCategory, MailFolder, QuickReply } from "@/types/mail"

type MainTab = "mailbox" | "auto" | "quickreply" | "contacts" | "shortcuts"
type MailboxSubTab = "manage" | "unread" | "bydate"

interface CleanupViewProps {
  accounts: Account[]
  mails: Mail[]
  onMarkAllRead: (accountId?: string) => Promise<void>
  onDeleteBeforeDate: (cutoff: Date, accountId?: string) => Promise<void>
  onEmptyTrashAccount: (accountId: string) => Promise<void>
  onUpdateSignature: (accountId: string, signature: string) => Promise<{ ok: boolean; error?: string }>
  folders: MailFolder[]
  rules: AutoClassifyRule[]
  onCreateRule: (
    conditions: RuleConditions,
    targetFolderId: string | null,
    category: MailCategory | null,
    applyToExisting?: boolean,
    name?: string,
  ) => Promise<{ ok: boolean; error?: string; count?: number }>
  onToggleRule: (ruleId: string, enabled: boolean) => void
  onUpdateRule: (ruleId: string, patch: Partial<Omit<AutoClassifyRule, "id" | "createdAt">>) => Promise<{ ok: boolean; error?: string }>
  onDeleteRule: (ruleId: string) => void
  onApplyRuleToExisting: (ruleId: string) => Promise<{ ok: boolean; error?: string; count?: number; alreadyClassified?: number }>
  quickReplies: QuickReply[]
  onCreateQuickReply: (title: string, body: string) => Promise<{ ok: boolean; error?: string }>
  onUpdateQuickReply: (id: string, title: string, body: string) => Promise<{ ok: boolean; error?: string }>
  onDeleteQuickReply: (id: string) => void
  contacts: Contact[]
  onCreateContact: (name: string, email: string) => Promise<{ ok: boolean; error?: string }>
  onUpdateContact: (id: string, name: string, email: string) => Promise<{ ok: boolean; error?: string }>
  onDeleteContact: (id: string) => void
}

export const SHORTCUTS = [
  { keys: "J / K", desc: "다음 / 이전 메일" },
  { keys: "Enter", desc: "메일 열기" },
  { keys: "Backspace", desc: "메일 삭제" },
  { keys: "R", desc: "답장" },
  { keys: "S", desc: "별표 토글" },
  { keys: "U", desc: "읽지않음으로 표시" },
  { keys: "Esc", desc: "메일 닫기 / 선택 해제" },
  { keys: "Ctrl + /", desc: "단축키 도움말" },
]

function MailboxManageTab({
  accounts,
  mails,
  onMarkAllRead,
  onDeleteBeforeDate,
  onEmptyTrashAccount,
  onUpdateSignature,
}: Pick<CleanupViewProps, "accounts" | "mails" | "onMarkAllRead" | "onDeleteBeforeDate" | "onEmptyTrashAccount" | "onUpdateSignature">) {
  const [subTab, setSubTab] = useState<MailboxSubTab>("manage")
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [cutoffDate, setCutoffDate] = useState("")
  const [cutoffAccountId, setCutoffAccountId] = useState<string>("all")
  const [isDeleting, setIsDeleting] = useState(false)
  const [confirmClear, setConfirmClear] = useState<string | null>(null)
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState<string | null>(null)
  const [emptyingTrashAccountId, setEmptyingTrashAccountId] = useState<string | null>(null)
  const [signatureEditAccountId, setSignatureEditAccountId] = useState<string | null>(null)
  const [signatureDraft, setSignatureDraft] = useState("")
  const [isSavingSignature, setIsSavingSignature] = useState(false)

  const mailsByAccount = (accountId: string) =>
    mails.filter((m) => m.accountId === accountId)

  const unreadByAccount = (accountId: string) =>
    mails.filter((m) => m.accountId === accountId && !m.isRead)

  const cutoffCount = (() => {
    if (!cutoffDate) return 0
    const d = new Date(cutoffDate)
    return mails.filter((m) => {
      const match = cutoffAccountId === "all" || m.accountId === cutoffAccountId
      return match && new Date(m.receivedAt) < d
    }).length
  })()

  const handleMarkAllRead = async (accountId?: string) => {
    const key = accountId ?? "all"
    setLoadingId(key)
    await onMarkAllRead(accountId)
    setLoadingId(null)
  }

  const handleClear = async (accountId: string) => {
    setConfirmClear(null)
    setLoadingId(`clear-${accountId}`)
    const cutoff = new Date()
    cutoff.setFullYear(cutoff.getFullYear() + 1)
    await onDeleteBeforeDate(cutoff, accountId)
    setLoadingId(null)
  }

  const handleEmptyTrash = async (accountId: string) => {
    setConfirmEmptyTrash(null)
    setEmptyingTrashAccountId(accountId)
    await onEmptyTrashAccount(accountId)
    setEmptyingTrashAccountId(null)
  }

  const handleDeleteByDate = async () => {
    if (!cutoffDate) return
    setIsDeleting(true)
    await onDeleteBeforeDate(new Date(cutoffDate), cutoffAccountId === "all" ? undefined : cutoffAccountId)
    setIsDeleting(false)
    setCutoffDate("")
  }

  const subTabs: { key: MailboxSubTab; label: string }[] = [
    { key: "manage", label: "메일함 관리" },
    { key: "unread", label: "안 읽은 메일 정리" },
    { key: "bydate", label: "기간으로 정리" },
  ]

  return (
    <div>
      {/* 서브탭 */}
      <div className="mb-6 flex border-b">
        {subTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSubTab(t.key)}
            className={cn(
              "px-5 py-2.5 text-sm font-medium transition-colors",
              subTab === t.key
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 메일함 관리 */}
      {subTab === "manage" && (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">메일함</th>
                <th className="px-4 py-3 text-center font-medium">전체 메일</th>
                <th className="px-4 py-3 text-center font-medium">안 읽은 메일</th>
                <th className="px-4 py-3 text-right font-medium">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {accounts.map((account) => {
                const total = mailsByAccount(account.id).length
                const unread = unreadByAccount(account.id).length
                const label =
                  account.provider === "gmail" || account.provider === "naver" || account.provider === "daum"
                    ? account.email
                    : account.label
                return (
                  <tr key={account.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={cn("size-2 shrink-0 rounded-full", account.color)} />
                        <span className="truncate">{label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{total}</td>
                    <td className="px-4 py-3 text-center">
                      {unread > 0 ? (
                        <span className="font-medium text-primary">{unread}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            setSignatureEditAccountId(account.id)
                            setSignatureDraft(account.signature ?? "")
                          }}
                        >
                          서명
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={unread === 0 || loadingId === account.id}
                          onClick={() => handleMarkAllRead(account.id)}
                        >
                          {loadingId === account.id ? <Loader2 className="size-3 animate-spin" /> : "모두 읽음"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs text-destructive hover:text-destructive"
                          disabled={total === 0 || !!loadingId}
                          onClick={() => setConfirmClear(account.id)}
                        >
                          {loadingId === `clear-${account.id}` ? <Loader2 className="size-3 animate-spin" /> : "비우기"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs text-destructive hover:text-destructive"
                          disabled={!!emptyingTrashAccountId}
                          onClick={() => setConfirmEmptyTrash(account.id)}
                        >
                          {emptyingTrashAccountId === account.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            "휴지통 비우기"
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    연결된 계정이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 안 읽은 메일 정리 */}
      {subTab === "unread" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">전체 계정</p>
              <p className="text-sm text-muted-foreground">
                모든 계정의 안 읽은 메일 {mails.filter((m) => !m.isRead).length}개를 읽음으로 표시합니다.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={mails.filter((m) => !m.isRead).length === 0 || loadingId === "all"}
              onClick={() => handleMarkAllRead(undefined)}
            >
              {loadingId === "all" ? <Loader2 className="size-3.5 animate-spin" /> : "모두 읽음"}
            </Button>
          </div>
          {accounts.map((account) => {
            const unread = unreadByAccount(account.id)
            const label =
              account.provider === "gmail" || account.provider === "naver" || account.provider === "daum"
                ? account.email
                : account.label
            return (
              <div key={account.id} className="flex items-center justify-between rounded-lg border p-4">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn("size-2 shrink-0 rounded-full", account.color)} />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{label}</p>
                    <p className="text-sm text-muted-foreground">
                      안 읽은 메일 {unread.length}개
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-4 shrink-0"
                  disabled={unread.length === 0 || loadingId === account.id}
                  onClick={() => handleMarkAllRead(account.id)}
                >
                  {loadingId === account.id ? <Loader2 className="size-3.5 animate-spin" /> : "모두 읽음"}
                </Button>
              </div>
            )
          })}
        </div>
      )}

      {/* 기간으로 정리 */}
      {subTab === "bydate" && (
        <div className="max-w-md space-y-4">
          <div className="rounded-lg border p-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">계정 선택</label>
              <select
                value={cutoffAccountId}
                onChange={(e) => setCutoffAccountId(e.target.value)}
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm focus:outline-none"
              >
                <option value="all">전체 계정</option>
                {accounts.map((a) => {
                  const label =
                    a.provider === "gmail" || a.provider === "naver" || a.provider === "daum"
                      ? a.email
                      : a.label
                  return <option key={a.id} value={a.id}>{label}</option>
                })}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">이 날짜 이전 메일 삭제</label>
              <input
                type="date"
                value={cutoffDate}
                onChange={(e) => setCutoffDate(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm focus:outline-none"
              />
            </div>
            {cutoffDate && (
              <p className="text-sm text-muted-foreground">
                삭제 대상: <strong className="text-foreground">{cutoffCount}개</strong>의 메일
                {cutoffCount === 0 && " (현재 로드된 메일 기준)"}
              </p>
            )}
            <Button
              variant="destructive"
              size="sm"
              disabled={!cutoffDate || cutoffCount === 0 || isDeleting}
              onClick={handleDeleteByDate}
              className="w-full"
            >
              {isDeleting ? (
                <><Loader2 className="mr-2 size-3.5 animate-spin" />정리 중...</>
              ) : (
                "정리하기"
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
            <AlertTriangle className="mt-0.5 size-3 shrink-0" />
            현재 화면에 로드된 메일 기준으로 정리됩니다. 더 불러오기로 추가 메일을 불러온 후 정리해 주세요.
          </p>
        </div>
      )}

      {/* 비우기 확인 다이얼로그 */}
      {confirmClear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg border p-6 shadow-xl max-w-sm w-full mx-4">
            <h3 className="font-semibold mb-2">메일함 비우기</h3>
            <p className="text-sm text-muted-foreground mb-4">
              이 계정의 로드된 메일 <strong>{mailsByAccount(confirmClear).length}개</strong>를 모두 삭제합니다. 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setConfirmClear(null)}>취소</Button>
              <Button variant="destructive" size="sm" onClick={() => handleClear(confirmClear)}>삭제</Button>
            </div>
          </div>
        </div>
      )}

      {/* 휴지통 비우기 확인 다이얼로그 */}
      {confirmEmptyTrash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg border p-6 shadow-xl max-w-sm w-full mx-4">
            <h3 className="font-semibold mb-2">휴지통 비우기</h3>
            <p className="text-sm text-muted-foreground mb-4">
              이 계정의 휴지통에 있는 메일을 <strong>전부</strong> 영구 삭제합니다. 화면에 로드된 것뿐 아니라
              서버에 있는 전체 휴지통 메일이 대상이며, 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setConfirmEmptyTrash(null)}>취소</Button>
              <Button variant="destructive" size="sm" onClick={() => handleEmptyTrash(confirmEmptyTrash)}>비우기</Button>
            </div>
          </div>
        </div>
      )}

      {/* 서명 편집 다이얼로그 */}
      {signatureEditAccountId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg border p-6 shadow-xl max-w-sm w-full mx-4">
            <h3 className="font-semibold mb-2">서명 편집</h3>
            <p className="text-sm text-muted-foreground mb-4">
              이 계정으로 메일을 보낼 때 본문 끝에 자동으로 붙습니다.
            </p>
            <textarea
              value={signatureDraft}
              onChange={(e) => setSignatureDraft(e.target.value)}
              placeholder="예: 감사합니다.\n홍길동 드림"
              className="border-input bg-background placeholder:text-muted-foreground min-h-[120px] w-full resize-none rounded-md border px-3 py-2 text-sm focus-visible:outline-none"
            />
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="outline" size="sm" onClick={() => setSignatureEditAccountId(null)} disabled={isSavingSignature}>
                취소
              </Button>
              <Button
                size="sm"
                disabled={isSavingSignature}
                onClick={async () => {
                  setIsSavingSignature(true)
                  await onUpdateSignature(signatureEditAccountId, signatureDraft)
                  setIsSavingSignature(false)
                  setSignatureEditAccountId(null)
                }}
              >
                {isSavingSignature ? <Loader2 className="size-3.5 animate-spin" /> : "저장"}
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

function QuickReplyTab({
  quickReplies,
  onCreateQuickReply,
  onUpdateQuickReply,
  onDeleteQuickReply,
}: {
  quickReplies: QuickReply[]
  onCreateQuickReply: (title: string, body: string) => Promise<{ ok: boolean; error?: string }>
  onUpdateQuickReply: (id: string, title: string, body: string) => Promise<{ ok: boolean; error?: string }>
  onDeleteQuickReply: (id: string) => void
}) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const openCreate = () => {
    setEditingId(null); setTitle(""); setBody(""); setError(null); setPanelOpen(true)
  }
  const openEdit = (qr: QuickReply) => {
    setEditingId(qr.id); setTitle(qr.title); setBody(qr.body); setError(null); setPanelOpen(true)
  }

  const handleSubmit = async () => {
    const trimmedTitle = title.trim()
    if (!trimmedTitle || !body.trim()) return
    setIsSaving(true)
    setError(null)
    const result = editingId
      ? await onUpdateQuickReply(editingId, trimmedTitle, body)
      : await onCreateQuickReply(trimmedTitle, body)
    setIsSaving(false)
    if (!result.ok) {
      setError(result.error ?? "저장에 실패했습니다.")
      return
    }
    setPanelOpen(false)
  }

  return (
    <div className="relative min-h-full">
      <div className={cn("transition-[padding]", panelOpen && "xl:pr-[390px]")}>
        <div className="mb-10 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">빠른 답장</h2>
            <p className="mt-3 text-sm text-muted-foreground">자주 쓰는 답장 문구를 저장해두면 메일 작성 화면에서 바로 끼워넣을 수 있습니다.</p>
          </div>
          <Button className="h-11 gap-2 px-5" onClick={openCreate}><Plus className="size-4" />새 빠른 답장</Button>
        </div>

        <div className="space-y-3">
          {quickReplies.map((qr) => (
            <div key={qr.id} className="flex items-start justify-between gap-4 rounded-xl border bg-background px-5 py-4 shadow-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{qr.title}</p>
                <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">{qr.body}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => openEdit(qr)}>수정</Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs text-destructive hover:text-destructive"
                  onClick={() => {
                    if (editingId === qr.id) setPanelOpen(false)
                    onDeleteQuickReply(qr.id)
                  }}
                >
                  삭제
                </Button>
              </div>
            </div>
          ))}
          {quickReplies.length === 0 && (
            <div className="rounded-xl border border-dashed py-20 text-center text-sm text-muted-foreground">아직 저장된 빠른 답장이 없습니다.<br />새 빠른 답장을 만들어 반복 작업을 줄여보세요.</div>
          )}
        </div>
      </div>

      {panelOpen && <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[400px] flex-col border-l bg-background shadow-2xl">
        <div className="flex h-16 items-center justify-between border-b px-6"><h3 className="text-lg font-semibold">{editingId ? "빠른 답장 수정" : "새 빠른 답장"}</h3><button type="button" onClick={() => setPanelOpen(false)} className="rounded-md p-2 hover:bg-muted"><X className="size-5" /></button></div>
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          <label className="block space-y-2"><span className="text-sm font-medium">제목</span><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 회의 일정 안내" /></label>
          <label className="block space-y-2">
            <span className="text-sm font-medium">내용</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="답장 본문에 들어갈 내용을 입력하세요"
              className="border-input bg-background placeholder:text-muted-foreground min-h-[200px] w-full resize-none rounded-md border px-3 py-2 text-sm focus-visible:outline-none"
            />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="grid grid-cols-[96px_1fr] gap-3 border-t p-6">
          <Button variant="outline" className="h-11" onClick={() => setPanelOpen(false)}>취소</Button>
          <Button className="h-11" disabled={isSaving || !title.trim() || !body.trim()} onClick={handleSubmit}>{isSaving ? <Loader2 className="size-4 animate-spin" /> : editingId ? "저장" : "추가"}</Button>
        </div>
      </aside>}
    </div>
  )
}

function ContactsTab({
  contacts,
  onCreateContact,
  onUpdateContact,
  onDeleteContact,
}: {
  contacts: Contact[]
  onCreateContact: (name: string, email: string) => Promise<{ ok: boolean; error?: string }>
  onUpdateContact: (id: string, name: string, email: string) => Promise<{ ok: boolean; error?: string }>
  onDeleteContact: (id: string) => void
}) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const openCreate = () => {
    setEditingId(null); setName(""); setEmail(""); setError(null); setPanelOpen(true)
  }
  const openEdit = (contact: Contact) => {
    setEditingId(contact.id); setName(contact.name); setEmail(contact.email); setError(null); setPanelOpen(true)
  }

  const handleSubmit = async () => {
    const trimmedName = name.trim()
    const trimmedEmail = email.trim()
    if (!trimmedEmail) return
    setIsSaving(true)
    setError(null)
    const result = editingId
      ? await onUpdateContact(editingId, trimmedName, trimmedEmail)
      : await onCreateContact(trimmedName, trimmedEmail)
    setIsSaving(false)
    if (!result.ok) {
      setError(result.error ?? "저장에 실패했습니다.")
      return
    }
    setPanelOpen(false)
  }

  return (
    <div className="relative min-h-full">
      <div className={cn("transition-[padding]", panelOpen && "xl:pr-[390px]")}>
        <div className="mb-10 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">주소록</h2>
            <p className="mt-3 text-sm text-muted-foreground">메일 작성 화면의 주소록에서도 같이 사용됩니다.</p>
          </div>
          <Button className="h-11 gap-2 px-5" onClick={openCreate}><Plus className="size-4" />새 주소</Button>
        </div>

        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-5 py-3 text-left font-medium">이름</th>
                <th className="px-5 py-3 text-left font-medium">이메일</th>
                <th className="px-5 py-3 text-right font-medium">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {contacts.map((contact) => (
                <tr key={contact.id} className="hover:bg-muted/30">
                  <td className="px-5 py-3.5">{contact.name}</td>
                  <td className="px-5 py-3.5 text-muted-foreground">{contact.email}</td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(contact)}>수정</Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive"
                        onClick={() => {
                          if (editingId === contact.id) setPanelOpen(false)
                          onDeleteContact(contact.id)
                        }}
                      >
                        삭제
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {contacts.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-20 text-center text-sm text-muted-foreground">
                    아직 저장된 주소가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {panelOpen && <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[400px] flex-col border-l bg-background shadow-2xl">
        <div className="flex h-16 items-center justify-between border-b px-6"><h3 className="text-lg font-semibold">{editingId ? "주소 수정" : "새 주소 추가"}</h3><button type="button" onClick={() => setPanelOpen(false)} className="rounded-md p-2 hover:bg-muted"><X className="size-5" /></button></div>
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          <label className="block space-y-2"><span className="text-sm font-medium">이름</span><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 홍길동" /></label>
          <label className="block space-y-2"><span className="text-sm font-medium">이메일</span><Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="email@example.com" /></label>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="grid grid-cols-[96px_1fr] gap-3 border-t p-6">
          <Button variant="outline" className="h-11" onClick={() => setPanelOpen(false)}>취소</Button>
          <Button className="h-11" disabled={isSaving || !email.trim()} onClick={handleSubmit}>{isSaving ? <Loader2 className="size-4 animate-spin" /> : editingId ? "저장" : "추가"}</Button>
        </div>
      </aside>}
    </div>
  )
}


export function CleanupView({
  accounts,
  mails,
  onMarkAllRead,
  onDeleteBeforeDate,
  onEmptyTrashAccount,
  onUpdateSignature,
  folders,
  rules,
  onCreateRule,
  onToggleRule,
  onUpdateRule,
  onDeleteRule,
  onApplyRuleToExisting,
  quickReplies,
  onCreateQuickReply,
  onUpdateQuickReply,
  onDeleteQuickReply,
  contacts,
  onCreateContact,
  onUpdateContact,
  onDeleteContact,
}: CleanupViewProps) {
  const [mainTab, setMainTab] = useState<MainTab>("mailbox")

  const mainTabs: { key: MainTab; label: string }[] = [
    { key: "mailbox", label: "메일함 관리" },
    { key: "auto", label: "자동분류" },
    { key: "quickreply", label: "빠른 답장" },
    { key: "contacts", label: "주소록" },
    { key: "shortcuts", label: "단축키" },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 상단 탭 */}
      <div className="shrink-0 border-b bg-muted/30">
        <div className="flex gap-0 px-6">
          {mainTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setMainTab(t.key)}
              className={cn(
                "px-5 py-3.5 text-sm font-medium transition-colors",
                mainTab === t.key
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 콘텐츠 */}
      <div className="min-h-0 flex-1 overflow-auto p-6">
        {mainTab === "mailbox" && (
          <MailboxManageTab
            accounts={accounts}
            mails={mails}
            onMarkAllRead={onMarkAllRead}
            onDeleteBeforeDate={onDeleteBeforeDate}
            onEmptyTrashAccount={onEmptyTrashAccount}
            onUpdateSignature={onUpdateSignature}
          />
        )}

        {mainTab === "auto" && (
          <AutoRulesView
            mails={mails}
            folders={folders}
            rules={rules}
            onCreateRule={onCreateRule}
            onUpdateRule={onUpdateRule}
            onToggleRule={onToggleRule}
            onDeleteRule={onDeleteRule}
            onApplyRuleToExisting={onApplyRuleToExisting}
          />
        )}

        {mainTab === "quickreply" && (
          <QuickReplyTab
            quickReplies={quickReplies}
            onCreateQuickReply={onCreateQuickReply}
            onUpdateQuickReply={onUpdateQuickReply}
            onDeleteQuickReply={onDeleteQuickReply}
          />
        )}

        {mainTab === "contacts" && (
          <ContactsTab
            contacts={contacts}
            onCreateContact={onCreateContact}
            onUpdateContact={onUpdateContact}
            onDeleteContact={onDeleteContact}
          />
        )}

        {mainTab === "shortcuts" && (
          <div className="max-w-md">
            <p className="text-sm text-muted-foreground mb-4">자주 사용하는 단축키 목록입니다.</p>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">단축키</th>
                    <th className="px-4 py-2.5 text-left font-medium">기능</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {SHORTCUTS.map((s) => (
                    <tr key={s.keys} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5">
                        <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{s.keys}</kbd>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{s.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
