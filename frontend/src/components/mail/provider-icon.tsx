import { Mail } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Provider } from "@/types/mail"

interface ProviderIconProps {
  provider: Provider
  className?: string
  label?: string
}

const PROVIDER_NAMES: Record<Provider, string> = {
  gmail: "Gmail",
  naver: "네이버 메일",
  daum: "다음 메일",
  imap: "IMAP 메일",
}

export function ProviderIcon({ provider, className, label }: ProviderIconProps) {
  const title = label ?? PROVIDER_NAMES[provider]

  if (provider === "gmail") {
    return (
      <span title={title} className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg border border-red-100 bg-red-50 text-red-600 dark:border-red-950 dark:bg-red-950/40", className)}>
        <span className="text-[13px] font-black leading-none">M</span>
      </span>
    )
  }

  if (provider === "naver") {
    return (
      <span title={title} className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#03C75A] text-white", className)}>
        <span className="text-[13px] font-black leading-none">N</span>
      </span>
    )
  }

  if (provider === "daum") {
    return (
      <span title={title} className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-500 text-white", className)}>
        <span className="text-[13px] font-black leading-none">D</span>
      </span>
    )
  }

  return (
    <span title={title} className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg bg-slate-600 text-white", className)}>
      <Mail className="size-3.5" />
    </span>
  )
}
