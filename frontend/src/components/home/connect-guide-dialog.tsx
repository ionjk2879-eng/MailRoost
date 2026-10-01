import { CircleHelp } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ProviderIcon } from "@/components/mail/provider-icon"
import { cn } from "@/lib/utils"
import type { Provider } from "@/types/mail"

const GUIDES: { provider: Provider; name: string; steps: string[] }[] = [
  {
    provider: "gmail",
    name: "Gmail",
    steps: [
      "설정(계정 관리)의 '새 계정 연결'에서 Gmail 버튼을 누릅니다.",
      "Google 로그인 화면에서 연결할 계정으로 로그인합니다.",
      "메일 접근 권한을 허용하면 자동으로 돌아와 연결이 끝납니다.",
    ],
  },
  {
    provider: "naver",
    name: "네이버",
    steps: [
      "네이버 > 보안설정에서 2단계 인증을 켭니다.",
      "2단계 인증 > IMAP/SMTP 사용에서 앱 비밀번호를 발급받습니다.",
      "'새 계정 연결'에서 네이버 메일을 누르고 이메일과 앱 비밀번호를 입력합니다. 네이버 로그인 비밀번호는 쓰지 않습니다.",
    ],
  },
  {
    provider: "daum",
    name: "다음",
    steps: [
      "다음 메일 설정에서 IMAP/POP3 사용을 켭니다.",
      "'새 계정 연결'에서 다음 메일을 누릅니다.",
      "카카오 계정(다음 메일)의 이메일 주소와 비밀번호를 입력합니다.",
    ],
  },
  {
    provider: "imap",
    name: "기타 IMAP",
    steps: [
      "사용 중인 메일 서비스가 IMAP over SSL(포트 993)을 지원하는지 확인합니다.",
      "'새 계정 연결'에서 기타 IMAP을 누르고 IMAP 서버 주소, 이메일, 비밀번호를 입력합니다.",
      "메일 보내기용 SMTP 서버는 자동으로 추측되며, 필요하면 직접 수정합니다.",
    ],
  },
]

export function ConnectGuideDialog() {
  const [selected, setSelected] = useState<Provider>("gmail")
  const guide = GUIDES.find((g) => g.provider === selected)!

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" className="gap-2 rounded-lg" />}>
        <CircleHelp className="size-3.5" /> 계정 연결 방법
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>계정 연결 방법</DialogTitle>
          <DialogDescription>연결할 메일 종류를 선택하면 순서를 보여드려요.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-4 gap-2">
          {GUIDES.map((g) => (
            <button
              key={g.provider}
              type="button"
              onClick={() => setSelected(g.provider)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border py-2.5 text-xs transition-colors",
                selected === g.provider ? "border-primary bg-primary/5 text-primary font-medium" : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              <ProviderIcon provider={g.provider} className="size-8" />
              {g.name}
            </button>
          ))}
        </div>
        <ol className="flex flex-col gap-3 text-sm">
          {guide.steps.map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="bg-primary/10 text-primary flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold">{i + 1}</span>
              <span className="leading-5">{step}</span>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  )
}
