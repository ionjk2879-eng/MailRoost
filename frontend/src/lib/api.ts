import type { Account, Mail } from "@/types/mail"

const AUTH_BASE = import.meta.env.DEV ? "http://localhost:8787" : ""

export const gmailLoginUrl = `${AUTH_BASE}/auth/gmail/login`

export async function fetchAccounts(): Promise<Account[]> {
  const res = await fetch("/api/accounts")
  if (!res.ok) return []
  return res.json()
}

export async function fetchMails(cursor?: string): Promise<{ mails: Mail[]; nextCursor: string | null }> {
  const url = cursor ? `/api/mail?cursor=${encodeURIComponent(cursor)}` : "/api/mail"
  const res = await fetch(url)
  if (!res.ok) return { mails: [], nextCursor: null }
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

export async function markAsRead(id: string, accountId: string): Promise<void> {
  await fetch(
    `/api/mail/${encodeURIComponent(id)}/read?accountId=${encodeURIComponent(accountId)}`,
    { method: "PATCH" },
  )
}

export async function toggleStar(id: string, accountId: string, starred: boolean): Promise<void> {
  await fetch(
    `/api/mail/${encodeURIComponent(id)}/star?accountId=${encodeURIComponent(accountId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ starred }),
    },
  )
}

export async function markAsUnread(id: string, accountId: string): Promise<void> {
  await fetch(
    `/api/mail/${encodeURIComponent(id)}/read?accountId=${encodeURIComponent(accountId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read: false }),
    },
  )
}

export async function deleteMail(id: string, accountId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(
    `/api/mail/${encodeURIComponent(id)}?accountId=${encodeURIComponent(accountId)}`,
    { method: "DELETE" },
  )
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: data.error ?? "메일 삭제에 실패했습니다." }
  }
  return { ok: true }
}

export async function sendMail(
  accountId: string,
  to: string,
  subject: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/mail/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, to, subject, body }),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) return { ok: false, error: data.error ?? "메일 전송에 실패했습니다." }
  return { ok: true }
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

export async function connectDaumAccount(
  email: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/auth/daum/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) return { ok: false, error: data.error ?? "다음 계정 연결에 실패했습니다." }
  return { ok: true }
}

export async function connectImapAccount(params: {
  host: string
  port: number
  email: string
  password: string
  label: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/auth/imap/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) return { ok: false, error: data.error ?? "IMAP 계정 연결에 실패했습니다." }
  return { ok: true }
}
