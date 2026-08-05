import { connect } from "cloudflare:sockets"
import type { Mail } from "../types"
import { decodeRfc2047, parseFromHeader, parseHeaderBlock, parseMimeMessage, sanitizeHtml, stripHtml } from "./mime"

const NAVER_IMAP_HOST = "imap.naver.com"
const NAVER_IMAP_PORT = 993

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

function indexOfCRLF(buf: Uint8Array): number {
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i] === 13 && buf[i + 1] === 10) return i
  }
  return -1
}

const decoder = new TextDecoder("utf-8", { fatal: false, ignoreBOM: false })

class ImapSocket {
  private reader: ReadableStreamDefaultReader<Uint8Array>
  private writer: WritableStreamDefaultWriter<Uint8Array>
  private buffer: Uint8Array = new Uint8Array(0)

  constructor(private socket: Socket) {
    this.reader = socket.readable.getReader()
    this.writer = socket.writable.getWriter()
  }

  async write(text: string): Promise<void> {
    await this.writer.write(new TextEncoder().encode(text))
  }

  private async fill(): Promise<boolean> {
    const { value, done } = await this.reader.read()
    if (done || !value) return false
    this.buffer = concatBytes(this.buffer, value)
    return true
  }

  async readLine(): Promise<string> {
    while (true) {
      const idx = indexOfCRLF(this.buffer)
      if (idx !== -1) {
        const line = decoder.decode(this.buffer.slice(0, idx))
        this.buffer = this.buffer.slice(idx + 2)
        return line
      }
      if (!(await this.fill())) throw new Error("IMAP 연결이 예기치 않게 종료되었습니다.")
    }
  }

  async readBytes(n: number): Promise<Uint8Array> {
    while (this.buffer.length < n) {
      if (!(await this.fill())) throw new Error("IMAP 연결이 예기치 않게 종료되었습니다.")
    }
    const bytes = this.buffer.slice(0, n)
    this.buffer = this.buffer.slice(n)
    return bytes
  }

  // IMAP literal({n}\r\n<n bytes>)이 응답 한 줄 중간에 끼어드는 경우, 리터럴을 통째로
  // 읽어들여 텍스트로 치환한 뒤 나머지를 이어붙여 하나의 논리적인 응답 줄로 만든다.
  async readLogicalLine(): Promise<string> {
    let line = await this.readLine()
    while (true) {
      const match = line.match(/\{(\d+)\+?\}$/)
      if (!match || match.index === undefined) return line
      const length = Number(match[1])
      const bytes = await this.readBytes(length)
      const literalText = decoder.decode(bytes).replace(/\r\n/g, "\n")
      const before = line.slice(0, match.index)
      const rest = await this.readLine()
      line = before + literalText + rest
    }
  }

  async close(): Promise<void> {
    try {
      await this.writer.close()
    } catch {
      // 이미 닫혀있으면 무시
    }
    try {
      await this.socket.close()
    } catch {
      // 이미 닫혀있으면 무시
    }
  }
}

interface ImapCommandResult {
  lines: string[]
  ok: boolean
  statusLine: string
}

class ImapClient {
  private tagSeq = 0

  constructor(private sock: ImapSocket) {}

  private nextTag(): string {
    this.tagSeq += 1
    return `A${this.tagSeq}`
  }

  async command(text: string): Promise<ImapCommandResult> {
    const tag = this.nextTag()
    await this.sock.write(`${tag} ${text}\r\n`)
    const lines: string[] = []
    while (true) {
      const line = await this.sock.readLogicalLine()
      if (line.startsWith(`${tag} `)) {
        const rest = line.slice(tag.length + 1)
        return { lines, ok: /^OK/i.test(rest), statusLine: rest }
      }
      lines.push(line)
    }
  }

  async readGreeting(): Promise<void> {
    await this.sock.readLogicalLine()
  }

  async close(): Promise<void> {
    await this.sock.close()
  }
}

function quoteImap(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

async function withNaverImap<T>(
  email: string,
  appPassword: string,
  fn: (client: ImapClient) => Promise<T>,
): Promise<T> {
  const socket = connect(
    { hostname: NAVER_IMAP_HOST, port: NAVER_IMAP_PORT },
    { secureTransport: "on", allowHalfOpen: false },
  )
  const sock = new ImapSocket(socket)
  const client = new ImapClient(sock)
  try {
    await client.readGreeting()
    const loginResult = await client.command(`LOGIN ${quoteImap(email)} ${quoteImap(appPassword)}`)
    if (!loginResult.ok) {
      throw new Error(
        "네이버 로그인에 실패했습니다. 이메일 또는 앱 비밀번호를 확인해주세요. (일반 로그인 비밀번호가 아니라 네이버 2단계 인증에서 발급받은 앱 비밀번호를 입력해야 합니다.)",
      )
    }
    return await fn(client)
  } finally {
    await client.close()
  }
}

export async function verifyNaverCredentials(email: string, appPassword: string): Promise<void> {
  await withNaverImap(email, appPassword, async () => {})
}

interface ParsedFetchLine {
  uid?: number
  flags: string[]
  internalDate?: string
  literalText?: string
}

function parseFetchLine(line: string): ParsedFetchLine | null {
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
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
}

function parseInternalDate(raw: string | undefined): string {
  const match = raw?.match(/^(\d{1,2})-(\w{3})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+([+-]\d{4})$/)
  if (!match) return new Date().toISOString()
  const [, day, monthName, year, hh, mm, ss, tz] = match
  const month = MONTH_NUMBERS[monthName] ?? "01"
  const isoLike = `${year}-${month}-${day.padStart(2, "0")}T${hh}:${mm}:${ss}${tz.slice(0, 3)}:${tz.slice(3)}`
  const date = new Date(isoLike)
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

function parseHeaderFields(text: string | undefined): { from: string; subject: string } {
  const headers = parseHeaderBlock(text ?? "")
  return { from: headers["from"] ?? "", subject: headers["subject"] ?? "" }
}

export async function naverListInbox(
  email: string,
  appPassword: string,
  accountId: string,
  maxResults = 20,
): Promise<Mail[]> {
  return withNaverImap(email, appPassword, async (client) => {
    const selectResult = await client.command("SELECT INBOX")
    if (!selectResult.ok) throw new Error("네이버 받은편지함을 열 수 없습니다.")

    let exists = 0
    for (const line of selectResult.lines) {
      const match = line.match(/^\*\s+(\d+)\s+EXISTS/i)
      if (match) exists = Number(match[1])
    }
    if (exists === 0) return []

    const start = Math.max(1, exists - maxResults + 1)
    const fetchResult = await client.command(
      `FETCH ${start}:${exists} (UID FLAGS INTERNALDATE BODY.PEEK[HEADER.FIELDS (FROM SUBJECT)])`,
    )

    const mails: Mail[] = []
    for (const line of fetchResult.lines) {
      const parsed = parseFetchLine(line)
      if (!parsed || parsed.uid === undefined) continue
      const { from, subject } = parseHeaderFields(parsed.literalText)
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
      })
    }
    return mails
  })
}

export async function naverGetMailDetail(
  email: string,
  appPassword: string,
  accountId: string,
  uid: string,
): Promise<Mail> {
  return withNaverImap(email, appPassword, async (client) => {
    const selectResult = await client.command("SELECT INBOX")
    if (!selectResult.ok) throw new Error("네이버 받은편지함을 열 수 없습니다.")

    const fetchResult = await client.command(`UID FETCH ${uid} (UID FLAGS INTERNALDATE BODY.PEEK[])`)
    const line = fetchResult.lines.find((l) => /^\*\s+\d+\s+FETCH/i.test(l))
    const parsed = line ? parseFetchLine(line) : null
    if (!parsed || !parsed.literalText) throw new Error("메일을 찾을 수 없습니다.")

    const raw = parsed.literalText
    const { headerBlock } = (() => {
      const idx = raw.search(/\n\n/)
      return { headerBlock: idx === -1 ? raw : raw.slice(0, idx) }
    })()
    const headers = parseHeaderBlock(headerBlock)
    const { name: fromName, email: fromEmail } = parseFromHeader(headers["from"] ?? "")
    const subject = decodeRfc2047(headers["subject"] ?? "") || "(제목 없음)"

    const { text, html } = parseMimeMessage(raw)
    const bodyHtml = html ? sanitizeHtml(html) : undefined
    const body = text || (html ? stripHtml(html) : "")

    return {
      id: uid,
      accountId,
      fromName,
      fromEmail,
      subject,
      snippet: body.slice(0, 200),
      body,
      bodyHtml,
      category: "primary",
      receivedAt: parseInternalDate(parsed.internalDate),
      isRead: parsed.flags.includes("\\Seen"),
      isStarred: parsed.flags.includes("\\Flagged"),
    }
  })
}
