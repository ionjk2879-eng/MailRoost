import type { Account, Mail } from "@/types/mail"

// Vite dev server(5173)와 wrangler dev(8787)가 분리되어 있어 OAuth 리다이렉트는
// 백엔드 origin으로 직접 보낸다. 빌드된 프로덕션에서는 같은 origin이라 빈 문자열.
const AUTH_BASE = import.meta.env.DEV ? "http://localhost:8787" : ""

export const gmailLoginUrl = `${AUTH_BASE}/auth/gmail/login`

export async function fetchAccounts(): Promise<Account[]> {
  const res = await fetch("/api/accounts")
  if (!res.ok) return []
  return res.json()
}

export async function fetchMails(): Promise<Mail[]> {
  const res = await fetch("/api/mail")
  if (!res.ok) return []
  return res.json()
}

export async function fetchMailDetail(id: string, accountId: string): Promise<Mail | null> {
  const res = await fetch(`/api/mail/${encodeURIComponent(id)}?accountId=${encodeURIComponent(accountId)}`)
  if (!res.ok) return null
  return res.json()
}
