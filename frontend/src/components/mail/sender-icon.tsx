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

function brandDomainFromSender(domain: string | null): string | null {
  if (!domain) return null
  if (domain === "patreon.com" || domain.endsWith(".patreon.com")) return "patreon.com"
  return domain
}

export function SenderIcon({ email, senderName, className }: SenderIconProps) {
  const [sourceIndex, setSourceIndex] = useState(0)
  const domain = domainFromEmail(email)
  const brandDomain = brandDomainFromSender(domain)

  useEffect(() => {
    setSourceIndex(0)
  }, [brandDomain])

  const sources = brandDomain ? [
    ...(brandDomain === "patreon.com" ? ["https://www.patreon.com/favicon.ico"] : []),
    `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(`https://${brandDomain}`)}&sz=128`,
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(brandDomain)}.ico`,
    `https://${brandDomain}/favicon.ico`,
  ] : []

  if (brandDomain && sourceIndex < sources.length) {
    return (
      <span title={brandDomain} className={cn("flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white", className)}>
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
