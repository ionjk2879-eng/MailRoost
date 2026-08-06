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

export async function fetchCurrentUser(): Promise<{ id: string; email: string } | null> {
  const res = await fetch("/api/me")
  if (!res.ok) return null
  return res.json()
}

export async function signup(
  email: string,
  password: string,
): Promise<{ ok: true; user: { id: string; email: string } } | { ok: false; error: string }> {
  const res = await fetch("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string; user?: { id: string; email: string } }
  if (!res.ok) return { ok: false, error: data.error ?? "회원가입에 실패했습니다." }
  return { ok: true, user: data.user! }
}

export async function loginUser(
  email: string,
  password: string,
): Promise<{ ok: true; user: { id: string; email: string } } | { ok: false; error: string }> {
  const res = await fetch("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string; user?: { id: string; email: string } }
  if (!res.ok) return { ok: false, error: data.error ?? "로그인에 실패했습니다." }
  return { ok: true, user: data.user! }
}

export async function logout(): Promise<void> {
  await fetch("/auth/logout", { method: "POST" })
}

export async function deleteAccount(id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/accounts/${encodeURIComponent(id)}`, { method: "DELETE" })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: data.error ?? "계정 삭제에 실패했습니다." }
  }
  return { ok: true }
}

export async function connectNaverAccount(
  email: string,
  appPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/auth/naver/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, appPassword }),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) return { ok: false, error: data.error ?? "네이버 계정 연결에 실패했습니다." }
  return { ok: true }
}
