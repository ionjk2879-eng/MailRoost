import { useEffect } from "react"

const BASE_SVG = `<rect width="32" height="32" rx="7" fill="#EA580C"/><rect x="4" y="17" width="24" height="11" rx="2.2" fill="#fff"/><path d="M5 17.5 L16 24 L27 17.5" fill="none" stroke="#EA580C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="15.5" cy="13" rx="5.5" ry="4.5" fill="#fff"/><path d="M20.5 11.5 L25 13 L20.5 14.5 Z" fill="#fff"/>`

export function useTabBadge(unreadCount: number) {
  useEffect(() => {
    document.title = unreadCount > 0 ? `(${unreadCount > 99 ? "99+" : unreadCount}) MailRoost` : "MailRoost"

    const badge = unreadCount > 0
      ? `<circle cx="25" cy="7" r="7" fill="#dc2626"/><text x="25" y="7" font-family="system-ui,sans-serif" font-size="8" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">${unreadCount > 9 ? "9+" : unreadCount}</text>`
      : ""

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${BASE_SVG}${badge}</svg>`
    const url = `data:image/svg+xml,${encodeURIComponent(svg)}`

    let link = document.getElementById("dynamic-favicon") as HTMLLinkElement | null
    if (!link) {
      link = document.createElement("link")
      link.id = "dynamic-favicon"
      link.rel = "icon"
      link.type = "image/svg+xml"
      document.head.appendChild(link)
    }
    link.href = url

    return () => {
      document.title = "MailRoost"
      document.getElementById("dynamic-favicon")?.remove()
    }
  }, [unreadCount])
}
