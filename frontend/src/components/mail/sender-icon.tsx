import { useState } from "react"
import { ProviderIcon } from "@/components/mail/provider-icon"
import { cn } from "@/lib/utils"
import type { Provider } from "@/types/mail"

interface SenderIconProps {
  email: string
  senderName: string
  fallbackProvider?: Provider
  className?: string
}

function domainFromEmail(email: string): string | null {
  const domain = email.trim().toLowerCase().split("@").pop()
  return domain && domain.includes(".") ? domain : null
}

export function SenderIcon({ email, senderName, fallbackProvider, className }: SenderIconProps) {
  const [failed, setFailed] = useState(false)
  const domain = domainFromEmail(email)

  if (domain && !failed) {
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`
    return (
      <span title={domain} className={cn("flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white", className)}>
        <img src={faviconUrl} alt="" className="size-[72%] object-contain" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      </span>
    )
  }

  if (fallbackProvider) return <ProviderIcon provider={fallbackProvider} className={className} label={email} />

  return (
    <span className={cn("bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold", className)}>
      {(senderName || email || "?").slice(0, 1).toUpperCase()}
    </span>
  )
}
