import { AlertTriangle, Check, Loader2, Minus, RotateCcw, Trash2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { Account, Mail } from "@/types/mail"

interface TrashViewProps {
  accounts: Account[]
  mails: Mail[]
  isLoading: boolean
  hasMore: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
  onEmptyAccount: (accountId: string) => Promise<void>
  onEmptyAllAccounts: () => Promise<{ ok: boolean; error?: string }>
  onDeleteSelected: (mails: Mail[]) => Promise<void>
  onRestoreSelected: (mails: Mail[]) => Promise<void>
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function accountLabel(account: Account): string {
  return account.provider === "gmail" || account.provider === "naver" || account.provider === "daum"
    ? account.email
    : account.label
}

export function TrashView({
  accounts,
  mails,
  isLoading,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onEmptyAccount,
  onEmptyAllAccounts,
  onDeleteSelected,
  onRestoreSelected,
}: TrashViewProps) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [emptyingAccountId, setEmptyingAccountId] = useState<string | null>(null)
  const [confirmEmptyId, setConfirmEmptyId] = useState<string | null>(null)
  const [isDeletingSelected, setIsDeletingSelected] = useState(false)
  const [isRestoringSelected, setIsRestoringSelected] = useState(false)
  const [confirmEmptyAll, setConfirmEmptyAll] = useState(false)
  const [isEmptyingAll, setIsEmptyingAll] = useState(false)
  const [emptyAllError, setEmptyAllError] = useState<string | null>(null)

  const allChecked = mails.length > 0 && mails.every((m) => checkedIds.has(m.id))
  const someChecked = checkedIds.size > 0 && !allChecked

  const toggleCheck = (mailId: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(mailId)) next.delete(mailId)
      else next.add(mailId)
      return next
    })
  }

  const toggleAll = () => {
    setCheckedIds(allChecked ? new Set() : new Set(mails.map((m) => m.id)))
  }

  const handleEmpty = async (accountId: string) => {
    setConfirmEmptyId(null)
    setEmptyingAccountId(accountId)
    await onEmptyAccount(accountId)
    setEmptyingAccountId(null)
  }

  const handleEmptyAll = async () => {
    setConfirmEmptyAll(false)
    setEmptyAllError(null)
    setIsEmptyingAll(true)
    const result = await onEmptyAllAccounts()
    setIsEmptyingAll(false)
    if (!result.ok) setEmptyAllError(result.error ?? "휴지통을 비우지 못했습니다.")
  }

  const handleDeleteSelected = async () => {
    const targets = mails.filter((m) => checkedIds.has(m.id))
    if (targets.length === 0) return
    setIsDeletingSelected(true)
    setCheckedIds(new Set())
    await onDeleteSelected(targets)
    setIsDeletingSelected(false)
  }

  const handleRestoreSelected = async () => {
    const targets = mails.filter((m) => checkedIds.has(m.id))
    if (targets.length === 0) return
    setIsRestoringSelected(true)
    setCheckedIds(new Set())
    await onRestoreSelected(targets)
    setIsRestoringSelected(false)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-4 border-b p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">휴지통</h2>
            <p className="text-muted-foreground text-sm">
              삭제한 메일은 여기로 이동합니다. 휴지통에서 완전히 삭제하면 복구할 수 없습니다.
            </p>
            {emptyAllError && <p className="text-destructive mt-1 text-sm">{emptyAllError}</p>}
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="shrink-0"
            disabled={accounts.length === 0 || isEmptyingAll}
            onClick={() => setConfirmEmptyAll(true)}
          >
            {isEmptyingAll ? (
              <><Loader2 className="mr-2 size-3.5 animate-spin" />비우는 중...</>
            ) : (
              "전체 계정 휴지통 비우기"
            )}
          </Button>
        </div>
        {accounts.length > 0 && (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">계정</th>
                  <th className="px-4 py-2.5 text-right font-medium">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {accounts.map((account) => (
                  <tr key={account.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={cn("size-2 shrink-0 rounded-full", account.color)} />
                        <span className="truncate">{accountLabel(account)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive"
                        disabled={emptyingAccountId !== null}
                        onClick={() => setConfirmEmptyId(account.id)}
                      >
                        {emptyingAccountId === account.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          "휴지통 비우기"
                        )}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
        <button
          type="button"
          onClick={toggleAll}
          disabled={mails.length === 0}
          className="border-input bg-background hover:bg-accent flex size-5 items-center justify-center rounded-sm border disabled:opacity-40"
          aria-label={allChecked ? "전체 해제" : "전체 선택"}
        >
          {allChecked && <Check className="size-3" />}
          {someChecked && <Minus className="size-3" />}
        </button>
        {checkedIds.size > 0 ? (
          <>
            <span className="text-muted-foreground text-xs">{checkedIds.size}개 선택됨</span>
            <div className="ml-auto flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={handleRestoreSelected}
                disabled={isRestoringSelected || isDeletingSelected}
              >
                <RotateCcw className="size-3.5" />
                복구
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive h-7 gap-1 px-2 text-xs"
                onClick={handleDeleteSelected}
                disabled={isDeletingSelected || isRestoringSelected}
              >
                <Trash2 className="size-3.5" />
                영구 삭제
              </Button>
            </div>
          </>
        ) : (
          <span className="text-muted-foreground text-xs">메일함</span>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex w-full min-w-0 flex-col">
          {!isLoading && mails.length === 0 && (
            <p className="text-muted-foreground p-6 text-sm">휴지통이 비어 있습니다.</p>
          )}
          {mails.map((mail) => {
            const account = accounts.find((a) => a.id === mail.accountId)
            const isChecked = checkedIds.has(mail.id)
            return (
              <button
                key={`${mail.accountId}:${mail.id}`}
                type="button"
                onClick={() => toggleCheck(mail.id)}
                className={cn(
                  "group flex w-full min-w-0 flex-col items-start gap-1 border-b px-3 py-3 text-left text-sm transition-colors",
                  "hover:bg-accent/50",
                  isChecked && "bg-primary/5",
                )}
              >
                <div className="flex w-full min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "border-input bg-background flex size-4 shrink-0 items-center justify-center rounded-sm border transition-opacity",
                      isChecked ? "bg-primary border-primary opacity-100" : "opacity-0 group-hover:opacity-100",
                    )}
                  >
                    {isChecked && <Check className="text-primary-foreground size-3" />}
                  </span>
                  {account && (
                    <span className={cn("size-2 shrink-0 rounded-full", account.color)} title={accountLabel(account)} />
                  )}
                  <span className="min-w-0 flex-1 truncate">{mail.fromName}</span>
                  <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                    {formatTime(mail.receivedAt)}
                  </span>
                </div>
                <span className="w-full min-w-0 truncate pl-6">{mail.subject}</span>
                <span className="text-muted-foreground w-full min-w-0 truncate pl-6 text-xs">{mail.snippet}</span>
              </button>
            )
          })}

          {hasMore && (
            <div className="flex justify-center p-4">
              <Button variant="outline" size="sm" onClick={onLoadMore} disabled={isLoadingMore}>
                {isLoadingMore ? (
                  <>
                    <Loader2 className="mr-2 size-3.5 animate-spin" />
                    불러오는 중...
                  </>
                ) : (
                  "더 불러오기"
                )}
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>

      {confirmEmptyId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background mx-4 w-full max-w-sm rounded-lg border p-6 shadow-xl">
            <h3 className="mb-2 font-semibold">휴지통 비우기</h3>
            <p className="text-muted-foreground mb-4 text-sm">
              이 계정의 휴지통에 있는 메일을 모두 영구 삭제합니다. 이 작업은 되돌릴 수 없습니다.
            </p>
            <p className="mb-4 flex items-start gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" />
              현재 로드된 목록뿐 아니라 휴지통에 있는 전체 메일이 삭제됩니다.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmEmptyId(null)}>취소</Button>
              <Button variant="destructive" size="sm" onClick={() => handleEmpty(confirmEmptyId)}>비우기</Button>
            </div>
          </div>
        </div>
      )}

      {confirmEmptyAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background mx-4 w-full max-w-sm rounded-lg border p-6 shadow-xl">
            <h3 className="mb-2 font-semibold">전체 계정 휴지통 비우기</h3>
            <p className="text-muted-foreground mb-4 text-sm">
              연결된 <strong>{accounts.length}개 계정</strong>의 휴지통에 있는 메일을 전부 영구 삭제합니다.
              이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmEmptyAll(false)}>취소</Button>
              <Button variant="destructive" size="sm" onClick={handleEmptyAll}>전체 비우기</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
