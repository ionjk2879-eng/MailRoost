import { Inbox } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Account, Mail } from "@/types/mail"

interface HomeViewProps {
  accounts: Account[]
  mails: Mail[]
  unreadCountByAccount: Record<string, number>
  onSelectAccount: (accountId: string | null) => void
}

export function HomeView({ accounts, mails, unreadCountByAccount, onSelectAccount }: HomeViewProps) {
  const totalUnread = Object.values(unreadCountByAccount).reduce((sum, n) => sum + n, 0)

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 p-6 sm:p-10">
        <div>
          <h1 className="text-2xl font-semibold">안녕하세요</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            연결된 계정 {accounts.length}개 · 전체 메일 {mails.length}통 · 안읽음 {totalUnread}통
          </p>
        </div>

        <Button onClick={() => onSelectAccount(null)} className="w-fit gap-2">
          <Inbox className="size-4" />
          전체 받은편지함 보기
        </Button>

        <div>
          <h2 className="text-muted-foreground mb-3 text-sm font-medium">계정</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {accounts.map((account) => {
              const unread = unreadCountByAccount[account.id] ?? 0
              const displayText =
                account.provider === "gmail" || account.provider === "naver"
                  ? account.email
                  : account.label
              return (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => onSelectAccount(account.id)}
                  className="hover:bg-accent/50 flex items-center gap-3 rounded-lg border p-4 text-left transition-colors"
                >
                  <span className={`size-2.5 shrink-0 rounded-full ${account.color}`} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {displayText}
                  </span>
                  {unread > 0 && <Badge variant="secondary">{unread}</Badge>}
                </button>
              )
            })}
            {accounts.length === 0 && (
              <p className="text-muted-foreground text-sm">연결된 계정이 없습니다.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
