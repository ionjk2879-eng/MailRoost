import { File, FileArchive, FileSpreadsheet, FileText, Image as ImageIcon, Loader2, Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { attachmentDownloadUrl, fetchAttachments } from "@/lib/api"
import type { Account, AttachmentListItem } from "@/types/mail"

interface AttachmentsViewProps {
  accounts: Account[]
}

function accountLabel(account: Account): string {
  return account.provider === "gmail" || account.provider === "naver" || account.provider === "daum"
    ? account.email
    : account.label
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "numeric", day: "numeric" })
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) return <ImageIcon className="size-4" />
  if (mimeType === "application/pdf") return <FileText className="size-4" />
  if (mimeType.includes("sheet") || mimeType.includes("excel") || mimeType === "text/csv") return <FileSpreadsheet className="size-4" />
  if (mimeType.includes("zip") || mimeType.includes("compressed")) return <FileArchive className="size-4" />
  return <File className="size-4" />
}

export function AttachmentsView({ accounts }: AttachmentsViewProps) {
  const [items, setItems] = useState<AttachmentListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [accountFilter, setAccountFilter] = useState<string>("all")

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    fetchAttachments().then((result) => {
      if (!cancelled) setItems(result)
    }).finally(() => {
      if (!cancelled) setIsLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items
      .filter((item) => accountFilter === "all" || item.accountId === accountFilter)
      .filter((item) => !q || item.filename.toLowerCase().includes(q))
      .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
  }, [items, query, accountFilter])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b bg-background px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold">첨부함</h2>
          <p className="text-muted-foreground text-xs">모든 계정에서 받은 첨부파일을 최근 순으로 모아 보여줍니다 (계정당 최근 100통 범위).</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="파일명 검색"
              className="bg-muted/50 focus:bg-background focus:ring-ring/40 h-10 w-full rounded-lg border border-transparent py-2 pr-3 pl-9 text-sm outline-none transition-all focus:border-border focus:ring-2"
            />
          </div>
          <select
            value={accountFilter}
            onChange={(event) => setAccountFilter(event.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">전체 계정</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{accountLabel(account)}</option>
            ))}
          </select>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex w-full min-w-0 flex-col">
          {isLoading && (
            <div className="flex items-center justify-center p-10">
              <Loader2 className="text-muted-foreground size-6 animate-spin" />
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <p className="text-muted-foreground p-6 text-sm">
              {items.length === 0 ? "첨부파일이 있는 메일이 없습니다." : "검색 결과가 없습니다."}
            </p>
          )}
          {!isLoading && filtered.map((item) => {
            const account = accounts.find((a) => a.id === item.accountId)
            return (
              <a
                key={`${item.accountId}:${item.mailId}:${item.attachmentId}`}
                href={attachmentDownloadUrl(item.mailId, item.accountId, {
                  id: item.attachmentId,
                  filename: item.filename,
                  mimeType: item.mimeType,
                  size: item.size,
                })}
                download={item.filename}
                className="flex w-full min-w-0 items-center gap-3 border-b px-5 py-3 text-sm transition-colors hover:bg-accent/50"
              >
                <span className="text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <FileIcon mimeType={item.mimeType} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.filename}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {item.fromName} · {account ? accountLabel(account) : item.fromEmail} · {formatDate(item.receivedAt)}
                  </p>
                </div>
                <span className="text-muted-foreground shrink-0 text-xs">{formatFileSize(item.size)}</span>
              </a>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
