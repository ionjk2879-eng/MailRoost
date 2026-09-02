import type { AttachmentListItem, Mail } from "../types"
import { decodeRfc2047, listMimeAttachments, parseFromHeader, parseHeaderBlock } from "./mime"

export interface ParsedFetchLine {
  uid?: number
  flags: string[]
  internalDate?: string
  literalText?: string
}

export function parseFetchLine(line: string): ParsedFetchLine | null {
  if (!/^\*\s+\d+\s+FETCH/i.test(line)) return null
  const uidMatch = line.match(/\bUID\s+(\d+)/i)
  const flagsMatch = line.match(/FLAGS\s*\(([^)]*)\)/i)
  const dateMatch = line.match(/INTERNALDATE\s+"([^"]+)"/i)
  const literalMatch = line.match(/BODY\[[^\]]*\]\s*([\s\S]*)\)\s*$/i)
  return {
    uid: uidMatch ? Number(uidMatch[1]) : undefined,
    flags: flagsMatch ? flagsMatch[1].split(/\s+/).filter(Boolean) : [],
    internalDate: dateMatch?.[1],
    literalText: literalMatch?.[1],
  }
}

const MONTH_NUMBERS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
}

export function parseInternalDate(raw: string | undefined): string {
  const match = raw?.match(/^(\d{1,2})-(\w{3})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+([+-]\d{4})$/)
  if (!match) return new Date().toISOString()
  const [, day, monthName, year, hh, mm, ss, tz] = match
  const month = MONTH_NUMBERS[monthName] ?? "01"
  const isoLike = `${year}-${month}-${day.padStart(2, "0")}T${hh}:${mm}:${ss}${tz.slice(0, 3)}:${tz.slice(3)}`
  const date = new Date(isoLike)
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

// References/Message-ID/In-Reply-To 헤더는 <local@domain> 형식 — 꺾쇠괄호를 벗겨서 순수 id로 맞춘다.
function stripAngleBrackets(id: string): string {
  return id.replace(/^<|>$/g, "")
}

function parseHeaderFields(text: string | undefined): {
  from: string
  subject: string
  messageId: string
  references: string[]
  inReplyTo: string
} {
  const headers = parseHeaderBlock(text ?? "")
  const references = (headers["references"] ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map(stripAngleBrackets)
  return {
    from: headers["from"] ?? "",
    subject: headers["subject"] ?? "",
    messageId: headers["message-id"] ? stripAngleBrackets(headers["message-id"]) : "",
    references,
    inReplyTo: headers["in-reply-to"] ? stripAngleBrackets(headers["in-reply-to"]) : "",
  }
}

export function mapFetchLinesToMails(lines: string[], accountId: string): Mail[] {
  const mails: Mail[] = []
  for (const line of lines) {
    if (!/^\*\s+\d+\s+FETCH/i.test(line)) continue
    const parsed = parseFetchLine(line)
    if (!parsed || parsed.uid === undefined) {
      console.error(`[imap] failed to parse FETCH line, skipping message: ${line.slice(0, 300)}`)
      continue
    }
    const { from, subject, messageId, references, inReplyTo } = parseHeaderFields(parsed.literalText)
    const { name: fromName, email: fromEmail } = parseFromHeader(from)
    mails.push({
      id: String(parsed.uid),
      accountId,
      fromName,
      fromEmail,
      subject: decodeRfc2047(subject) || "(제목 없음)",
      snippet: "",
      body: "",
      category: "primary",
      receivedAt: parseInternalDate(parsed.internalDate),
      isRead: parsed.flags.includes("\\Seen"),
      isStarred: parsed.flags.includes("\\Flagged"),
      messageId: messageId || undefined,
      references: references.length > 0 ? references : undefined,
      inReplyTo: inReplyTo || undefined,
    })
  }
  return mails
}

// 첨부함용 — FETCH 응답 줄(원본 RFC822 전체 포함)에서 첨부파일 목록 항목을 뽑아낸다.
// 소켓을 전혀 건드리지 않는 순수 함수라 imap.ts가 아니라 여기(단위 테스트 가능한 파일)에 둔다.
export function mapFetchLinesToAttachments(lines: string[], accountId: string): AttachmentListItem[] {
  const results: AttachmentListItem[] = []
  for (const line of lines) {
    if (!/^\*\s+\d+\s+FETCH/i.test(line)) continue
    const parsed = parseFetchLine(line)
    if (!parsed || parsed.uid === undefined || !parsed.literalText) continue

    const attachments = listMimeAttachments(parsed.literalText)
    if (attachments.length === 0) continue

    const idx = parsed.literalText.search(/\n\n/)
    const headerBlock = idx === -1 ? parsed.literalText : parsed.literalText.slice(0, idx)
    const headers = parseHeaderBlock(headerBlock)
    const { name: fromName, email: fromEmail } = parseFromHeader(headers["from"] ?? "")
    const subject = decodeRfc2047(headers["subject"] ?? "") || "(제목 없음)"
    const receivedAt = parseInternalDate(parsed.internalDate)

    for (const att of attachments) {
      results.push({
        accountId,
        mailId: String(parsed.uid),
        attachmentId: att.id,
        filename: att.filename,
        mimeType: att.mimeType,
        size: att.size,
        fromName,
        fromEmail,
        subject,
        receivedAt,
      })
    }
  }
  return results
}
