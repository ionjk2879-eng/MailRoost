import { Archive, Check, ChevronDown, Folder, FolderInput, Inbox, Loader2, MailOpen, Minus, Star, Trash2, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { SenderIcon } from "@/components/mail/sender-icon"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Account, Mail, MailFolder } from "@/types/mail"
import { cn } from "@/lib/utils"

type SelectFilter = "all" | "none" | "read" | "unread" | "starred" | "unstarred"

interface MailListProps {
  mails: Mail[]
  accounts: Account[]
  selectedMailId: string | null
  onSelectMail: (mailId: string) => void
  // J/K 키보드 탐색 포커스 (열려있는 메일과는 별개)
  focusedMailId?: string | null
  onToggleStar: (mailId: string, accountId: string, starred: boolean) => void
  // 다중선택
  checkedIds: Set<string>
  onToggleCheck: (mailId: string) => void
  onCheckRange: (mailIds: string[]) => void
  onSelectByFilter: (filter: SelectFilter) => void
  onClearChecked: () => void
  onBulkMarkRead: () => void
  onBulkMarkUnread: () => void
  onBulkDelete: () => void
  isBulkLoading?: boolean
  // 보관 / 분류 이동
  onBulkArchive?: () => void
  folders?: MailFolder[]
  currentFolderId?: string
  onBulkMove?: (folderId: string | null) => void
  // 페이지네이션
  isLoadingMore?: boolean
  hasMore?: boolean
  onLoadMore?: () => void
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleString("ko-KR", { hour: "2-digit", minute: "2-digit" })
  }
  return date.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
  })
}

const FILTER_OPTIONS: { value: SelectFilter; label: string }[] = [
  { value: "all", label: "전체선택" },
  { value: "none", label: "선택안함" },
  { value: "read", label: "읽음" },
  { value: "unread", label: "읽지않음" },
  { value: "starred", label: "별표" },
  { value: "unstarred", label: "별표없음" },
]

export function MailList({
  mails,
  accounts,
  selectedMailId,
  onSelectMail,
  focusedMailId,
  onToggleStar,
  checkedIds,
  onToggleCheck,
  onCheckRange,
  onSelectByFilter,
  onClearChecked,
  onBulkMarkRead,
  onBulkMarkUnread,
  onBulkDelete,
  isBulkLoading,
  onBulkArchive,
  folders,
  currentFolderId,
  onBulkMove,
  isLoadingMore,
  hasMore,
  onLoadMore,
}: MailListProps) {
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)
  const [moveOpen, setMoveOpen] = useState(false)
  const moveRef = useRef<HTMLDivElement>(null)
  // Shift-클릭 범위선택의 기준점 (마지막으로 클릭/체크한 메일)
  const [anchorId, setAnchorId] = useState<string | null>(null)

  const isSelecting = checkedIds.size > 0
  const allChecked = mails.length > 0 && mails.every((m) => checkedIds.has(m.id))
  const someChecked = checkedIds.size > 0 && !allChecked

  useEffect(() => {
    if (!filterOpen) return
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [filterOpen])

  useEffect(() => {
    if (!moveOpen) return
    const handler = (e: MouseEvent) => {
      if (moveRef.current && !moveRef.current.contains(e.target as Node)) {
        setMoveOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [moveOpen])

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 상단 선택 툴바 */}
      <div className="flex h-11 shrink-0 items-center gap-1 border-b bg-muted/20 px-4">
        {/* 체크박스 + 드롭다운 */}
        <div ref={filterRef} className="relative flex items-center">
          <button
            type="button"
            onClick={() => onSelectByFilter(allChecked ? "none" : "all")}
            className="border-input bg-background hover:bg-accent flex size-5 items-center justify-center rounded-sm border"
            aria-label={allChecked ? "전체 해제" : "전체 선택"}
          >
            {allChecked && <Check className="size-3" />}
            {someChecked && <Minus className="size-3" />}
          </button>
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            className="hover:bg-accent ml-0.5 flex h-5 w-4 items-center justify-center rounded-sm"
            aria-label="선택 옵션"
          >
            <ChevronDown className="text-muted-foreground size-3" />
          </button>
          {filterOpen && (
            <div className="bg-background absolute top-full left-0 z-20 mt-1 min-w-[120px] rounded-md border shadow-md">
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onSelectByFilter(opt.value)
                    setFilterOpen(false)
                  }}
                  className="hover:bg-accent flex w-full items-center px-3 py-1.5 text-left text-sm"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 선택 중일 때 액션 버튼 */}
        {isSelecting ? (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <div className="ml-auto flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                className="size-7 p-0"
                onClick={onBulkMarkRead}
                disabled={isBulkLoading}
                title="읽음 처리"
              >
                <MailOpen className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="size-7 p-0"
                onClick={onBulkMarkUnread}
                disabled={isBulkLoading}
                title="읽지않음 처리"
              >
                <MailOpen className="size-3.5 opacity-50" />
              </Button>
              {onBulkArchive && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="size-7 p-0"
                  onClick={onBulkArchive}
                  disabled={isBulkLoading}
                  title="보관"
                >
                  <Archive className="size-3.5" />
                </Button>
              )}
              {onBulkMove && (
                <div ref={moveRef} className="relative">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-7 p-0"
                    onClick={() => setMoveOpen((v) => !v)}
                    disabled={isBulkLoading}
                    title="분류 메일함으로 이동"
                  >
                    <FolderInput className="size-3.5" />
                  </Button>
                  {moveOpen && (
                    <div className="bg-background absolute top-full right-0 z-20 mt-1 min-w-[140px] rounded-md border shadow-md">
                      {currentFolderId && (
                        <button
                          type="button"
                          onClick={() => {
                            onBulkMove(null)
                            setMoveOpen(false)
                          }}
                          className="hover:bg-accent flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
                        >
                          <Inbox className="text-muted-foreground size-3.5" />
                          받은편지함으로
                        </button>
                      )}
                      {(folders ?? [])
                        .filter((f) => f.id !== currentFolderId)
                        .map((folder) => (
                          <button
                            key={folder.id}
                            type="button"
                            onClick={() => {
                              onBulkMove(folder.id)
                              setMoveOpen(false)
                            }}
                            className="hover:bg-accent flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
                          >
                            <Folder
                              className="size-3.5 shrink-0"
                              style={{ color: folder.color, fill: folder.color, fillOpacity: 0.25 }}
                            />
                            <span className="truncate">{folder.name}</span>
                          </button>
                        ))}
                      {(!folders || folders.length === 0) && !currentFolderId && (
                        <p className="text-muted-foreground px-3 py-1.5 text-xs">분류 메일함이 없습니다.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive size-7 p-0"
                onClick={onBulkDelete}
                disabled={isBulkLoading}
                title="삭제"
              >
                <Trash2 className="size-3.5" />
              </Button>
              <button
                type="button"
                onClick={onClearChecked}
                className="text-muted-foreground hover:text-foreground ml-1 flex size-6 items-center justify-center rounded"
                aria-label="선택 해제"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1" />
        )}
      </div>

      {/* 메일 목록 */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex w-full min-w-0 flex-col">
          {mails.length === 0 && (
            <p className="text-muted-foreground p-6 text-sm">메일이 없습니다.</p>
          )}
          {mails.map((mail, index) => {
            const account = accounts.find((a) => a.id === mail.accountId)
            const isChecked = checkedIds.has(mail.id)

            // shift 범위선택이면 true를 반환해 호출부가 별도 처리를 건너뛰게 한다.
            const trySelectRange = (e: React.MouseEvent): boolean => {
              if (!e.shiftKey || !anchorId) return false
              const anchorIndex = mails.findIndex((m) => m.id === anchorId)
              if (anchorIndex === -1) return false
              const [start, end] = anchorIndex < index ? [anchorIndex, index] : [index, anchorIndex]
              onCheckRange(mails.slice(start, end + 1).map((m) => m.id))
              setAnchorId(mail.id)
              return true
            }

            const handleRowClick = (e: React.MouseEvent) => {
              if (trySelectRange(e)) return
              if (e.ctrlKey || e.metaKey) {
                onToggleCheck(mail.id)
                setAnchorId(mail.id)
                return
              }
              if (isSelecting) {
                onToggleCheck(mail.id)
              } else {
                onSelectMail(mail.id)
              }
              setAnchorId(mail.id)
            }

            return (
              <button
                key={mail.id}
                id={`mail-row-${mail.id}`}
                type="button"
                onMouseDown={(e) => {
                  if (e.shiftKey) e.preventDefault()
                }}
                onClick={handleRowClick}
                className={cn(
                  "group flex w-full min-w-0 flex-col items-start gap-1.5 border-b border-l-2 border-l-transparent px-4 py-3.5 text-left text-sm transition-colors",
                  // 마우스 오버는 중립적인 muted 톤으로, 실제 열려있는(선택된) 메일은 accent + 왼쪽 테두리로
                  // 뚜렷하게 구분한다 — 둘 다 같은 accent를 쓰면 호버가 마치 "이게 선택된 메일"처럼 보여 헷갈린다.
                  "hover:bg-muted/60",
                  !mail.isRead && "border-l-primary bg-primary/[0.035]",
                  !isSelecting && selectedMailId === mail.id && "border-l-primary bg-primary/[0.09]",
                  isChecked && "bg-primary/5",
                  // J/K 키보드 포커스 표시 (열려있는 메일과 별개로 표시되어야 하므로 ring을 씀)
                  focusedMailId === mail.id && "ring-primary/50 ring-2 ring-inset",
                )}
              >
                <div className="flex w-full min-w-0 items-center gap-2.5">
                  {/* 체크박스 (호버/선택 시 체크박스로 전환 — 현재 보고 있는 메일 표시는 그 아래 줄에 따로 있음) */}
                  <div className="relative flex size-4 shrink-0 items-center justify-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (trySelectRange(e)) return
                        onToggleCheck(mail.id)
                        setAnchorId(mail.id)
                      }}
                      aria-label={isChecked ? "선택 해제" : "선택"}
                      className={cn(
                        "border-input bg-background absolute inset-0 flex items-center justify-center rounded-sm border transition-opacity",
                        isChecked
                          ? "bg-primary border-primary opacity-100"
                          : "opacity-0 group-hover:opacity-100",
                      )}
                    >
                      {isChecked && <Check className="text-primary-foreground size-3" />}
                    </button>
                  </div>

                  <SenderIcon email={mail.fromEmail} senderName={mail.fromName} fallbackProvider={account?.provider} className="size-6 rounded-md" />
                  <span className={cn("min-w-0 flex-1 truncate text-[13px]", !mail.isRead && "font-semibold text-foreground")}>
                    {mail.fromName}
                  </span>
                  <span className="text-muted-foreground ml-auto shrink-0 text-[11px]">
                    {formatTime(mail.receivedAt)}
                  </span>
                </div>

                <div className="flex w-full min-w-0 items-center gap-2">
                  <span className="flex size-4 shrink-0 items-center justify-center">
                    {selectedMailId === mail.id && !isChecked && (
                      <span className="bg-primary size-2 rounded-full" aria-hidden="true" />
                    )}
                  </span>
                  <span className={cn("min-w-0 flex-1 truncate text-[13px]", !mail.isRead && "font-semibold")}>
                    {mail.subject}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleStar(mail.id, mail.accountId, !mail.isStarred)
                    }}
                    className={cn(
                      "shrink-0 rounded p-0.5 transition-opacity",
                      mail.isStarred
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-40 hover:!opacity-60",
                    )}
                    aria-label={mail.isStarred ? "별표 해제" : "별표 추가"}
                  >
                    <Star
                      className={cn(
                        "size-3.5",
                        mail.isStarred ? "fill-amber-400 text-amber-400" : "text-muted-foreground",
                      )}
                    />
                  </button>
                </div>

                <span className="text-muted-foreground w-full min-w-0 truncate pl-6 text-xs">
                  {mail.snippet}
                </span>
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
    </div>
  )
}
