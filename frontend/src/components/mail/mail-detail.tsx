import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { MessageCard } from "@/components/mail/message-card"
import { ChevronLeft } from "lucide-react"
import type { Account, Mail, MailFolder } from "@/types/mail"

interface MailDetailProps {
  mail: Mail | null
  accounts: Account[]
  isLoadingBody?: boolean
  onBack?: () => void
  onToggleStar?: (mailId: string, accountId: string, starred: boolean) => void
  onMarkAsUnread?: (mailId: string, accountId: string) => void
  onDelete?: (mailId: string, accountId: string) => void
  onArchive?: (mailId: string, accountId: string) => void
  onReply?: (mail: Mail) => void
  onReplyAll?: (mail: Mail) => void
  onForward?: (mail: Mail) => void
  folders?: MailFolder[]
  currentFolderId?: string
  onMove?: (mailId: string, accountId: string, folderId: string | null) => void
  onToggleFolder?: (mailId: string, accountId: string, folderId: string, assign: boolean) => void
  onSnooze?: (mailId: string, accountId: string, until: number) => void
  onMute?: (fromEmail: string) => void
  isMuted?: boolean
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="-ml-2 w-fit gap-1" onClick={onBack}>
      <ChevronLeft className="size-4" />
      목록으로
    </Button>
  )
}

export function MailDetail({ mail, isLoadingBody, onBack, ...rest }: MailDetailProps) {
  if (!mail) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col">
        {onBack && <BackButton onBack={onBack} />}
        <div className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden px-6 pb-16">
          <div className="flex -translate-y-2 flex-col items-center text-center">
            <img
              src="/mail-empty-roost.png"
              alt="새들이 메일을 나르는 새집"
              className="h-auto w-[min(25rem,78vw)] select-none"
              draggable={false}
            />
            <div className="-mt-3 flex flex-col items-center">
              <h2 className="text-foreground text-xl font-bold tracking-tight sm:text-2xl">
                메일을 선택해 내용을 확인하세요
              </h2>
              <p className="text-muted-foreground mt-2 text-sm sm:text-base">
                여러 계정의 메일을 한 곳에서 관리할 수 있어요.
              </p>
              <div className="mt-5 flex items-center gap-2 text-orange-500">
                <svg aria-hidden="true" viewBox="0 0 92 52" className="h-11 w-20 -rotate-6" fill="none">
                  <path
                    d="M88 45C67 48 56 40 59 29c3-10 19-7 16 2-4 12-31 9-45-11C23 10 15 7 5 8"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeDasharray="5 5"
                  />
                  <path d="M13 2 4 8l6 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <span className="text-sm font-medium sm:text-base">왼쪽에서 메일을 선택해보세요!</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {onBack && (
        <div className="shrink-0 border-b bg-background px-7 pt-4">
          <BackButton onBack={onBack} />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        {isLoadingBody ? (
          <div className="flex flex-col gap-3 p-6">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : (
          <MessageCard mail={mail} {...rest} />
        )}
      </div>
    </div>
  )
}
