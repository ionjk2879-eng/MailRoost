import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface SenderIconProps {
  email: string
  senderName: string
  className?: string
}

function domainFromEmail(email: string): string | null {
  const domain = email.trim().toLowerCase().split("@").pop()
  return domain && domain.includes(".") ? domain : null
}

export function SenderIcon({ email, senderName, className }: SenderIconProps) {
  const [sourceIndex, setSourceIndex] = useState(0)
  const domain = domainFromEmail(email)

  useEffect(() => {
    setSourceIndex(0)
  }, [domain])

  const sources = domain ? [
    `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(`https://${domain}`)}&sz=128`,
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`,
    `https://${domain}/favicon.ico`,
  ] : []

  if (domain && sourceIndex < sources.length) {
    return (
      <span title={domain} className={cn("flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white", className)}>
        <img src={sources[sourceIndex]} alt="" className="size-[72%] object-contain" loading="lazy" referrerPolicy="no-referrer" onError={() => setSourceIndex((index) => index + 1)} />
      </span>
    )
  }

  return (
    <span className={cn("bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold", className)}>
      {(senderName || email || "?").slice(0, 1).toUpperCase()}
    </span>
  )
}
