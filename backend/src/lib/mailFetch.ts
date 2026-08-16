import type { ConnectedAccountRecord, DaumAccountRecord, ImapAccountRecord, Mail } from "../types"
import { daumListInbox, daumListTrash, daumSearchInbox, imapListInbox, imapListTrash, imapSearchInbox } from "./imap"

// ── IMAP helpers ──────────────────────────────────────────────────────────────

export function isDaum(r: ConnectedAccountRecord): r is DaumAccountRecord { return r.provider === "daum" }

export async function fetchImapMails(
  accountId: string,
  record: DaumAccountRecord | ImapAccountRecord,
  maxResults: number,
  offset: number,
): Promise<{ mails: Mail[]; hasMore: boolean }> {
  if (isDaum(record)) return daumListInbox(record.email, record.password, accountId, maxResults, offset)
  return imapListInbox({ host: record.host, port: record.port, email: record.email, password: record.password }, accountId, maxResults, offset)
}

export async function searchImapMails(
  accountId: string,
  record: DaumAccountRecord | ImapAccountRecord,
  query: string,
  maxResults: number,
  field?: "from" | "subject",
): Promise<Mail[]> {
  if (isDaum(record)) return daumSearchInbox(record.email, record.password, accountId, query, maxResults, field)
  return imapSearchInbox({ host: record.host, port: record.port, email: record.email, password: record.password }, accountId, query, maxResults, field)
}

export async function fetchImapTrash(
  accountId: string,
  record: DaumAccountRecord | ImapAccountRecord,
  maxResults: number,
  offset: number,
): Promise<{ mails: Mail[]; hasMore: boolean }> {
  if (isDaum(record)) return daumListTrash(record.email, record.password, accountId, maxResults, offset)
  return imapListTrash({ host: record.host, port: record.port, email: record.email, password: record.password }, accountId, maxResults, offset)
}
