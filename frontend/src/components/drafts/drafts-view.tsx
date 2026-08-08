import { FileEdit, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Account, Draft } from "@/types/mail"

interface DraftsViewProps {
  drafts: Draft[]
  accounts: Account[]
  onOpenDraft: (draft: Draft) => void
  onDeleteDraft: (id: string) => void
}

function accountLabel(accounts: Account[], accountId?: string): string | null {
  if (!accountId) return null
  const a = accounts.find((acc) => acc.id === accountId)
  if (!a) return null
  return a.provider === "gmail" || a.provider === "naver" || a.provider === "daum" ? a.email : a.label
}

export function DraftsView({ drafts, accounts, onOpenDraft, onDeleteDraft }: DraftsViewProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <h2 className="mb-4 text-lg font-semibold">임시보관함</h2>
      {drafts.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 py-16 text-sm">
          <FileEdit className="size-8" />
          작성 중 저장된 메일이 없습니다.
        </div>
      ) : (
        <div className="max-w-2xl space-y-2">
          {drafts.map((draft) => (
            <div
              key={draft.id}
              onClick={() => onOpenDraft(draft)}
              className="hover:bg-muted/30 flex cursor-pointer items-start justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{draft.subject?.trim() || "(제목 없음)"}</p>
                <p className="text-muted-foreground mt-0.5 truncate text-xs">
                  {accountLabel(accounts, draft.accountId) ?? "보내는 계정 미지정"}
                  {draft.to?.trim() ? ` → ${draft.to}` : ""}
                </p>
                {draft.body?.trim() && (
                  <p className="text-muted-foreground mt-1 line-clamp-1 text-xs">{draft.body}</p>
                )}
                <p className="text-muted-foreground mt-1 text-xs">
                  {new Date(draft.updatedAt).toLocaleString()} 수정됨
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                aria-label="임시보관 삭제"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteDraft(draft.id)
                }}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
