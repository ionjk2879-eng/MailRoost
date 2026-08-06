import { AlertTriangle, Loader2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { ARCHIVE_FOLDER_ID } from "@/types/mail"
import type { Account, AutoClassifyRule, Mail, MailFolder } from "@/types/mail"

type MainTab = "mailbox" | "auto" | "quickreply" | "shortcuts"
type MailboxSubTab = "manage" | "unread" | "bydate"

interface CleanupViewProps {
  accounts: Account[]
  mails: Mail[]
  onMarkAllRead: (accountId?: string) => Promise<void>
  onDeleteBeforeDate: (cutoff: Date, accountId?: string) => Promise<void>
  onEmptyTrashAccount: (accountId: string) => Promise<void>
  folders: MailFolder[]
  rules: AutoClassifyRule[]
  onCreateRule: (
    field: "from" | "subject",
    keyword: string,
    targetFolderId: string,
  ) => Promise<{ ok: boolean; error?: string }>
  onToggleRule: (ruleId: string, enabled: boolean) => void
  onDeleteRule: (ruleId: string) => void
}

const SHORTCUTS = [
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
}: Pick<CleanupViewProps, "accounts" | "mails" | "onMarkAllRead" | "onDeleteBeforeDate" | "onEmptyTrashAccount">) {
  const [subTab, setSubTab] = useState<MailboxSubTab>("manage")
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [cutoffDate, setCutoffDate] = useState("")
  const [cutoffAccountId, setCutoffAccountId] = useState<string>("all")
  const [isDeleting, setIsDeleting] = useState(false)
  const [confirmClear, setConfirmClear] = useState<string | null>(null)
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState<string | null>(null)
  const [emptyingTrashAccountId, setEmptyingTrashAccountId] = useState<string | null>(null)

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

    </div>
  )
}

function AutoClassifyTab({
  folders,
  rules,
  onCreateRule,
  onToggleRule,
  onDeleteRule,
}: {
  folders: MailFolder[]
  rules: AutoClassifyRule[]
  onCreateRule: (
    field: "from" | "subject",
    keyword: string,
    targetFolderId: string,
  ) => Promise<{ ok: boolean; error?: string }>
  onToggleRule: (ruleId: string, enabled: boolean) => void
  onDeleteRule: (ruleId: string) => void
}) {
  const folderOptions = [{ id: ARCHIVE_FOLDER_ID, name: "보관함" }, ...folders]
  const [field, setField] = useState<"from" | "subject">("from")
  const [keyword, setKeyword] = useState("")
  const [targetFolderId, setTargetFolderId] = useState(folderOptions[0].id)
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const folderName = (id: string) =>
    id === ARCHIVE_FOLDER_ID ? "보관함" : (folders.find((f) => f.id === id)?.name ?? "(삭제된 메일함)")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = keyword.trim()
    if (!trimmed) return
    setIsCreating(true)
    setError(null)
    const result = await onCreateRule(field, trimmed, targetFolderId)
    setIsCreating(false)
    if (!result.ok) {
      setError(result.error ?? "규칙 생성에 실패했습니다.")
      return
    }
    setKeyword("")
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-lg border p-4">
        <h3 className="mb-1 font-medium">새 규칙 만들기</h3>
        <p className="text-muted-foreground mb-4 text-sm">
          새로 도착하는 메일부터 적용됩니다. 이미 받은편지함에 있는 메일에는 소급 적용되지 않아요.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <label className="text-muted-foreground text-xs">조건</label>
            <select
              value={field}
              onChange={(e) => setField(e.target.value as "from" | "subject")}
              className="border-input bg-background h-9 rounded-md border px-2 text-sm focus:outline-none"
            >
              <option value="from">보낸사람</option>
              <option value="subject">제목</option>
            </select>
          </div>
          <div className="min-w-[140px] flex-1 space-y-1.5">
            <label className="text-muted-foreground text-xs">포함 키워드</label>
            <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="예: 뉴스레터" required />
          </div>
          <div className="space-y-1.5">
            <label className="text-muted-foreground text-xs">이동할 곳</label>
            <select
              value={targetFolderId}
              onChange={(e) => setTargetFolderId(e.target.value)}
              className="border-input bg-background h-9 rounded-md border px-2 text-sm focus:outline-none"
            >
              {folderOptions.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <Button type="submit" size="sm" disabled={isCreating || !keyword.trim()}>
            {isCreating ? <Loader2 className="size-3.5 animate-spin" /> : "추가"}
          </Button>
        </form>
        {folders.length === 0 && (
          <p className="text-muted-foreground mt-3 flex items-start gap-1.5 text-xs">
            <AlertTriangle className="mt-0.5 size-3 shrink-0" />
            사이드바에서 메일함을 만들어두면 보관함 대신 그쪽으로 보낼 수도 있어요.
          </p>
        )}
        {error && <p className="text-destructive mt-2 text-sm">{error}</p>}
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">조건</th>
              <th className="px-4 py-2.5 text-left font-medium">이동할 곳</th>
              <th className="px-4 py-2.5 text-center font-medium">사용</th>
              <th className="px-4 py-2.5 text-right font-medium">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rules.map((rule) => (
              <tr key={rule.id} className={cn("hover:bg-muted/30", !rule.enabled && "opacity-50")}>
                <td className="px-4 py-3">
                  {rule.field === "from" ? "보낸사람" : "제목"}에 <strong>"{rule.keyword}"</strong> 포함
                </td>
                <td className="px-4 py-3">{folderName(rule.targetFolderId)}</td>
                <td className="px-4 py-3 text-center">
                  <button
                    type="button"
                    onClick={() => onToggleRule(rule.id, !rule.enabled)}
                    className={cn(
                      "h-5 w-9 rounded-full transition-colors",
                      rule.enabled ? "bg-primary" : "bg-muted-foreground/30",
                    )}
                    aria-label={rule.enabled ? "규칙 끄기" : "규칙 켜기"}
                  >
                    <span
                      className={cn(
                        "block size-4 rounded-full bg-background shadow transition-transform",
                        rule.enabled ? "translate-x-4.5" : "translate-x-0.5",
                      )}
                    />
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-destructive hover:text-destructive text-xs"
                    onClick={() => onDeleteRule(rule.id)}
                  >
                    삭제
                  </Button>
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr>
                <td colSpan={4} className="text-muted-foreground px-4 py-8 text-center text-sm">
                  아직 규칙이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function CleanupView({
  accounts,
  mails,
  onMarkAllRead,
  onDeleteBeforeDate,
  onEmptyTrashAccount,
  folders,
  rules,
  onCreateRule,
  onToggleRule,
  onDeleteRule,
}: CleanupViewProps) {
  const [mainTab, setMainTab] = useState<MainTab>("mailbox")

  const mainTabs: { key: MainTab; label: string }[] = [
    { key: "mailbox", label: "메일함 관리" },
    { key: "auto", label: "자동분류" },
    { key: "quickreply", label: "빠른 답장" },
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
          />
        )}

        {mainTab === "auto" && (
          <AutoClassifyTab
            folders={folders}
            rules={rules}
            onCreateRule={onCreateRule}
            onToggleRule={onToggleRule}
            onDeleteRule={onDeleteRule}
          />
        )}

        {mainTab === "quickreply" && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-lg font-medium mb-2">빠른 답장</p>
            <p className="text-muted-foreground text-sm">준비 중입니다.</p>
          </div>
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
