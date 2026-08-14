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
      <span title={title} className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg border bg-white", className)}>
        <svg viewBox="0 0 24 18" aria-hidden="true" className="h-[58%] w-[72%]">
          <path d="M2 5.2v10.3c0 .8.6 1.5 1.5 1.5H6V8.8L2 5.2Z" fill="#4285F4" />
          <path d="M18 8.8V17h2.5c.9 0 1.5-.7 1.5-1.5V5.2l-4 3.6Z" fill="#34A853" />
          <path d="M18 8.8 22 5.2V3.8c0-1.8-2.1-2.8-3.5-1.7L12 7 5.5 2.1C4.1 1 2 2 2 3.8v1.4l4 3.6 6 4.5 6-4.5Z" fill="#EA4335" />
          <path d="m18.5 2.1-6.5 4.9 3 2.3 7-5.5c0-1.8-2.1-2.8-3.5-1.7Z" fill="#FBBC04" />
          <path d="M5.5 2.1 12 7 9 9.3 2 3.8C2 2 4.1 1 5.5 2.1Z" fill="#C5221F" />
        </svg>
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
