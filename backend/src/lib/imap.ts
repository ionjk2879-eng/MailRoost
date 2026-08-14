import { connect } from "cloudflare:sockets"
import type { Mail } from "../types"
import { decodeRfc2047, extractMimeAttachment, listMimeAttachments, parseAddressList, parseFromHeader, parseHeaderBlock, parseMimeMessage, sanitizeHtml, stripHtml } from "./mime"

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
    try { await this.writer.close() } catch { /* already closed */ }
    try { await this.socket.close() } catch { /* already closed */ }
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

// IMAP 명령은 \r\n으로 끝나므로, 따옴표로 감싸는 값 안에 CR/LF가 그대로 남아있으면
// 명령이 거기서 조기 종료되고 이어지는 텍스트가 별도의 명령으로 주입될 수 있다 — 반드시 걷어낸다.
function quoteImap(value: string): string {
  const sanitized = value.replace(/[\r\n]/g, "")
  return `"${sanitized.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

// UID는 항상 순수 숫자다. 이 값들은 quoteImap 없이 그대로 명령 문자열에 꽂혀 들어가므로
// (예: `UID STORE ${uid} +FLAGS ...`), 검증 없이 통과시키면 개행 등을 포함시켜 그 IMAP 세션에
// 임의의 추가 명령을 주입할 수 있다. 호출 지점(API 라우트)의 mailId가 항상 신뢰할 수 있는
// 값이라고 가정하지 않고, 실제로 명령을 만드는 이 계층에서 한 번 더 막는다.
function assertValidUid(uid: string): void {
  if (!/^\d+$/.test(uid)) throw new Error(`잘못된 메일 UID입니다: ${uid}`)
}

function assertValidUids(uids: string[]): void {
  for (const uid of uids) assertValidUid(uid)
}

// ── Generic IMAP connection config ──────────────────────────────────────────

export interface ImapConfig {
  host: string
  port: number
  email: string
  password: string
  loginErrorMsg?: string
}

async function withImap<T>(config: ImapConfig, fn: (client: ImapClient) => Promise<T>): Promise<T> {
  const socket = connect(
    { hostname: config.host, port: config.port },
    { secureTransport: "on", allowHalfOpen: false },
  )
  const sock = new ImapSocket(socket)
  const client = new ImapClient(sock)
  try {
    await client.readGreeting()
    const loginResult = await client.command(`LOGIN ${quoteImap(config.email)} ${quoteImap(config.password)}`)
    if (!loginResult.ok) {
      throw new Error(config.loginErrorMsg ?? "IMAP 로그인에 실패했습니다. 이메일 또는 비밀번호를 확인해주세요.")
    }
    return await fn(client)
  } finally {
    await client.close()
  }
}

// ── Provider configs ─────────────────────────────────────────────────────────

const naverConfig = (email: string, appPassword: string): ImapConfig => ({
  host: "imap.naver.com",
  port: 993,
  email,
  password: appPassword,
  loginErrorMsg:
    "네이버 로그인에 실패했습니다. 이메일 또는 앱 비밀번호를 확인해주세요. (일반 로그인 비밀번호가 아니라 네이버 2단계 인증에서 발급받은 앱 비밀번호를 입력해야 합니다.)",
})

const daumConfig = (email: string, password: string): ImapConfig => ({
  host: "imap.daum.net",
  port: 993,
  email,
  password,
  loginErrorMsg: "다음 메일 로그인에 실패했습니다. 이메일 또는 비밀번호를 확인해주세요.",
})

// ── Parsing helpers ───────────────────────────────────────────────────────────

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
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
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

// ── Trash folder discovery ────────────────────────────────────────────────────

const TRASH_NAME_CANDIDATES = [
  "trash", "deleted items", "deleted messages", "bin", "junk",
  "휴지통", "지운편지함", "지운 편지함",
]

// IMAP modified UTF-7 (RFC 3501 5.1.3) decode — 서버가 폴더명을 이 인코딩으로 돌려줄 수 있음
function decodeImapUtf7(input: string): string {
  let output = ""
  let i = 0
  while (i < input.length) {
    const ch = input[i]
    if (ch !== "&") {
      output += ch
      i += 1
      continue
    }
    const end = input.indexOf("-", i + 1)
    const seqEnd = end === -1 ? input.length : end
    const seq = input.slice(i + 1, seqEnd)
    if (seq === "") {
      output += "&"
    } else {
      try {
        const b64 = seq.replace(/,/g, "/")
        const pad = (4 - (b64.length % 4)) % 4
        const bin = atob(b64 + "=".repeat(pad))
        const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
        for (let j = 0; j + 1 < bytes.length; j += 2) {
          output += String.fromCharCode((bytes[j] << 8) | bytes[j + 1])
        }
      } catch {
        // 디코딩 실패 시 원본 유지 (후보 매칭만 못할 뿐 동작에는 지장 없음)
        output += `&${seq}-`
      }
    }
    i = seqEnd + 1
  }
  return output
}

function findTrashInListLines(lines: string[], requireSpecialUse: boolean): string | null {
  for (const line of lines) {
    const match = line.match(/^\*\s+LIST\s+\(([^)]*)\)\s+(?:"[^"]*"|NIL)\s+(.+)$/i)
    if (!match) continue
    const attrs = match[1]
    const rawName = match[2].trim()
    const name = rawName.startsWith('"') && rawName.endsWith('"') ? rawName.slice(1, -1) : rawName
    if (/\\Trash/i.test(attrs)) return name
    if (requireSpecialUse) continue
    const decoded = decodeImapUtf7(name).toLowerCase()
    if (TRASH_NAME_CANDIDATES.some((c) => decoded === c)) return name
  }
  return null
}

async function imapFindTrashMailbox(client: ImapClient): Promise<string | null> {
  const special = await client.command('LIST (SPECIAL-USE) "" "*"')
  if (special.ok) {
    const found = findTrashInListLines(special.lines, true)
    if (found) {
      console.log(`[imap] trash mailbox found via SPECIAL-USE: ${found}`)
      return found
    }
  }
  const plain = await client.command('LIST "" "*"')
  if (!plain.ok) {
    console.log(`[imap] LIST command failed: ${plain.statusLine}`)
    return null
  }
  console.log(`[imap] mailbox list: ${JSON.stringify(plain.lines)}`)
  const found = findTrashInListLines(plain.lines, false)
  console.log(`[imap] trash mailbox after name matching: ${found ?? "NOT FOUND"}`)
  return found
}

// ── Core IMAP operations (provider-agnostic) ──────────────────────────────────

async function fetchMailPageFromSelected(
  client: ImapClient,
  selectResult: ImapCommandResult,
  accountId: string,
  maxResults: number,
  offset: number,
): Promise<{ mails: Mail[]; hasMore: boolean }> {
  let exists = 0
  for (const line of selectResult.lines) {
    const match = line.match(/^\*\s+(\d+)\s+EXISTS/i)
    if (match) exists = Number(match[1])
  }
  if (exists === 0) return { mails: [], hasMore: false }

  const end = Math.max(0, exists - offset)
  if (end < 1) return { mails: [], hasMore: false }
  const start = Math.max(1, end - maxResults + 1)
  const hasMore = start > 1

  const fetchResult = await client.command(
    `FETCH ${start}:${end} (UID FLAGS INTERNALDATE BODY.PEEK[HEADER.FIELDS (FROM SUBJECT)])`,
  )
  // 이 명령이 실패했는데도 그냥 넘어가면, 그 구간의 메일들이 조용히 통째로 빈 결과로 취급되어
  // "더 보기"가 앞으로만 진행하는 이 페이지네이션 구조상 다시는 화면에 나타나지 않게 된다.
  if (!fetchResult.ok) throw new Error(`메일 목록 조회에 실패했습니다 (${fetchResult.statusLine}).`)

  const mails = mapFetchLinesToMails(fetchResult.lines, accountId)
  const expected = end - start + 1
  if (mails.length < expected) {
    console.error(
      `[imap] range ${start}:${end} expected ${expected} messages but parsed only ${mails.length} ` +
        `(raw lines=${fetchResult.lines.length}) — some messages may have been dropped during parsing`,
    )
  }

  return { mails, hasMore }
}

function mapFetchLinesToMails(lines: string[], accountId: string): Mail[] {
  const mails: Mail[] = []
  for (const line of lines) {
    if (!/^\*\s+\d+\s+FETCH/i.test(line)) continue
    const parsed = parseFetchLine(line)
    if (!parsed || parsed.uid === undefined) {
      console.error(`[imap] failed to parse FETCH line, skipping message: ${line.slice(0, 300)}`)
      continue
    }
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
}

export async function imapListInbox(
  config: ImapConfig,
  accountId: string,
  maxResults = 20,
  offset = 0,
): Promise<{ mails: Mail[]; hasMore: boolean }> {
  return withImap(config, async (client) => {
    const selectResult = await client.command("SELECT INBOX")
    if (!selectResult.ok) throw new Error("받은편지함을 열 수 없습니다.")
    return fetchMailPageFromSelected(client, selectResult, accountId, maxResults, offset)
  })
}

// 받은편지함 안에서 보낸사람/제목/본문에 검색어가 포함된 메일을 찾는다.
// 이미 불러온 메일 안에서만 훑던 클라이언트 검색과 달리 서버(IMAP SEARCH)까지 실제로 검색한다.
export async function imapSearchInbox(
  config: ImapConfig,
  accountId: string,
  query: string,
  maxResults = 30,
  field?: "from" | "subject",
): Promise<Mail[]> {
  return withImap(config, async (client) => {
    const selectResult = await client.command("SELECT INBOX")
    if (!selectResult.ok) throw new Error("받은편지함을 열 수 없습니다.")

    const quoted = quoteImap(query)
    // 규칙 적용처럼 검색 필드가 정해진 경우엔 단일 기준(FROM/SUBJECT)으로 검색한다.
    // 삼중 OR+TEXT 구조는 일부 서버(특히 네이버)에서 BAD 응답을 유발하거나 결과가 비어있다.
    // 범용 검색(field 미지정)은 기존대로 넓은 OR 검색을 쓴다.
    const criterion =
      field === "from" ? `FROM ${quoted}` :
      field === "subject" ? `SUBJECT ${quoted}` :
      `OR FROM ${quoted} OR SUBJECT ${quoted} TEXT ${quoted}`

    // CHARSET UTF-8을 지원하지 않는 서버는 BAD 응답을 돌려준다 — 그 경우 CHARSET 없이 재시도한다.
    let searchResult = await client.command(`UID SEARCH CHARSET UTF-8 ${criterion}`)
    if (!searchResult.ok) {
      searchResult = await client.command(`UID SEARCH ${criterion}`)
    }
    if (!searchResult.ok) return []
    const line = searchResult.lines.find((l) => /^\*\s+SEARCH/i.test(l))
    if (!line) return []
    const uids = line.replace(/^\*\s+SEARCH\s*/i, "").trim().split(/\s+/).filter(Boolean)
    if (uids.length === 0) return []

    // SEARCH는 보통 오름차순(오래된 것부터)으로 UID를 돌려주므로, 뒤쪽(최신 것)만 취한다.
    const targetUids = uids.slice(-maxResults)
    const fetchResult = await client.command(
      `UID FETCH ${targetUids.join(",")} (UID FLAGS INTERNALDATE BODY.PEEK[HEADER.FIELDS (FROM SUBJECT)])`,
    )
    if (!fetchResult.ok) return []
    return mapFetchLinesToMails(fetchResult.lines, accountId)
  })
}

export async function imapListTrash(
  config: ImapConfig,
  accountId: string,
  maxResults = 20,
  offset = 0,
): Promise<{ mails: Mail[]; hasMore: boolean }> {
  return withImap(config, async (client) => {
    const trash = await imapFindTrashMailbox(client)
    if (!trash) return { mails: [], hasMore: false }
    const selectResult = await client.command(`SELECT ${quoteImap(trash)}`)
    if (!selectResult.ok) return { mails: [], hasMore: false }
    return fetchMailPageFromSelected(client, selectResult, accountId, maxResults, offset)
  })
}

// 특정 UID 목록의 메타데이터를 한 번의 연결로 조회 (사용자 정의 분류 조회용).
// 실제 메일은 여전히 INBOX에 있음 — 사용자 정의 분류는 앱 내부 표시 전용이라 서버에서 옮기지 않는다.
export async function imapFetchByUids(config: ImapConfig, accountId: string, uids: string[]): Promise<Mail[]> {
  if (uids.length === 0) return []
  assertValidUids(uids)
  return withImap(config, async (client) => {
    const selectResult = await client.command("SELECT INBOX")
    if (!selectResult.ok) throw new Error("받은편지함을 열 수 없습니다.")
    const fetchResult = await client.command(
      `UID FETCH ${uids.join(",")} (UID FLAGS INTERNALDATE BODY.PEEK[HEADER.FIELDS (FROM SUBJECT)])`,
    )
    return mapFetchLinesToMails(fetchResult.lines, accountId)
  })
}

export async function imapMarkAsRead(config: ImapConfig, uid: string): Promise<void> {
  assertValidUid(uid)
  await withImap(config, async (client) => {
    const selectResult = await client.command("SELECT INBOX")
    if (!selectResult.ok) throw new Error("받은편지함을 열 수 없습니다.")
    const storeResult = await client.command(`UID STORE ${uid} +FLAGS (\\Seen)`)
    if (!storeResult.ok) throw new Error("읽음 처리에 실패했습니다.")
  })
}

export async function imapToggleStar(config: ImapConfig, uid: string, starred: boolean): Promise<void> {
  assertValidUid(uid)
  const flag = starred ? "+FLAGS" : "-FLAGS"
  await withImap(config, async (client) => {
    const selectResult = await client.command("SELECT INBOX")
    if (!selectResult.ok) throw new Error("받은편지함을 열 수 없습니다.")
    const storeResult = await client.command(`UID STORE ${uid} ${flag} (\\Flagged)`)
    if (!storeResult.ok) throw new Error("별표 처리에 실패했습니다.")
  })
}

export async function imapMarkAsUnread(config: ImapConfig, uid: string): Promise<void> {
  assertValidUid(uid)
  await withImap(config, async (client) => {
    const selectResult = await client.command("SELECT INBOX")
    if (!selectResult.ok) throw new Error("받은편지함을 열 수 없습니다.")
    const storeResult = await client.command(`UID STORE ${uid} -FLAGS (\\Seen)`)
    if (!storeResult.ok) throw new Error("읽지않음 처리에 실패했습니다.")
  })
}

// 삭제 = 휴지통 폴더가 있으면 그쪽으로 이동, 없으면 기존처럼 영구 삭제로 폴백
export async function imapDeleteMail(config: ImapConfig, uid: string): Promise<void> {
  assertValidUid(uid)
  await withImap(config, async (client) => {
    const selectResult = await client.command("SELECT INBOX")
    if (!selectResult.ok) throw new Error("받은편지함을 열 수 없습니다.")

    const trash = await imapFindTrashMailbox(client)
    if (trash) {
      const copyResult = await client.command(`UID COPY ${uid} ${quoteImap(trash)}`)
      if (!copyResult.ok) throw new Error("메일을 휴지통으로 이동하지 못했습니다.")
    }
    const storeResult = await client.command(`UID STORE ${uid} +FLAGS (\\Deleted)`)
    if (!storeResult.ok) throw new Error("메일 삭제에 실패했습니다.")
    const expungeResult = await client.command("EXPUNGE")
    if (!expungeResult.ok) throw new Error("메일 삭제에 실패했습니다.")
  })
}

// 휴지통에서 완전히 삭제 (영구 삭제)
export async function imapPermanentDeleteBulk(config: ImapConfig, uids: string[]): Promise<void> {
  if (uids.length === 0) return
  assertValidUids(uids)
  await withImap(config, async (client) => {
    const trash = await imapFindTrashMailbox(client)
    if (!trash) throw new Error("휴지통 폴더를 찾을 수 없습니다.")
    const selectResult = await client.command(`SELECT ${quoteImap(trash)}`)
    if (!selectResult.ok) throw new Error("휴지통을 열 수 없습니다.")
    const storeResult = await client.command(`UID STORE ${uids.join(",")} +FLAGS (\\Deleted)`)
    if (!storeResult.ok) throw new Error("메일 영구 삭제에 실패했습니다.")
    const expungeResult = await client.command("EXPUNGE")
    if (!expungeResult.ok) throw new Error("메일 영구 삭제에 실패했습니다.")
  })
}

// 휴지통에서 받은편지함으로 복구
export async function imapRestoreFromTrashBulk(config: ImapConfig, uids: string[]): Promise<void> {
  if (uids.length === 0) return
  assertValidUids(uids)
  await withImap(config, async (client) => {
    const trash = await imapFindTrashMailbox(client)
    if (!trash) throw new Error("휴지통 폴더를 찾을 수 없습니다.")
    const selectResult = await client.command(`SELECT ${quoteImap(trash)}`)
    if (!selectResult.ok) throw new Error("휴지통을 열 수 없습니다.")
    const copyResult = await client.command(`UID COPY ${uids.join(",")} INBOX`)
    if (!copyResult.ok) throw new Error("받은편지함으로 복구하지 못했습니다.")
    const storeResult = await client.command(`UID STORE ${uids.join(",")} +FLAGS (\\Deleted)`)
    if (!storeResult.ok) throw new Error("휴지통에서 제거하지 못했습니다.")
    const expungeResult = await client.command("EXPUNGE")
    if (!expungeResult.ok) throw new Error("휴지통에서 제거하지 못했습니다.")
  })
}

// 휴지통 비우기 (전체)
export async function imapEmptyTrash(config: ImapConfig): Promise<void> {
  await withImap(config, async (client) => {
    const trash = await imapFindTrashMailbox(client)
    if (!trash) return
    const selectResult = await client.command(`SELECT ${quoteImap(trash)}`)
    if (!selectResult.ok) return

    let exists = 0
    for (const line of selectResult.lines) {
      const match = line.match(/^\*\s+(\d+)\s+EXISTS/i)
      if (match) exists = Number(match[1])
    }
    if (exists === 0) return

    const storeResult = await client.command(`STORE 1:${exists} +FLAGS (\\Deleted)`)
    if (!storeResult.ok) throw new Error("휴지통 비우기에 실패했습니다.")
    const expungeResult = await client.command("EXPUNGE")
    if (!expungeResult.ok) throw new Error("휴지통 비우기에 실패했습니다.")
  })
}

// 메일 원문(RFC822) 전체를 UID로 조회. 상세보기와 첨부파일 다운로드가 공유해서 쓴다
// (Workers는 요청 간 상태를 유지하지 않으므로 첨부파일을 받을 때도 매번 다시 조회해야 한다).
async function imapFetchRawByUid(
  config: ImapConfig,
  uid: string,
): Promise<{ raw: string; flags: string[]; internalDate?: string } | null> {
  assertValidUid(uid)
  return withImap(config, async (client) => {
    const selectResult = await client.command("SELECT INBOX")
    if (!selectResult.ok) throw new Error("받은편지함을 열 수 없습니다.")

    const fetchResult = await client.command(`UID FETCH ${uid} (UID FLAGS INTERNALDATE BODY.PEEK[])`)
    const line = fetchResult.lines.find((l) => /^\*\s+\d+\s+FETCH/i.test(l))
    const parsed = line ? parseFetchLine(line) : null
    if (!parsed || !parsed.literalText) return null
    return { raw: parsed.literalText, flags: parsed.flags, internalDate: parsed.internalDate }
  })
}

export async function imapGetMailDetail(config: ImapConfig, accountId: string, uid: string): Promise<Mail> {
  const fetched = await imapFetchRawByUid(config, uid)
  if (!fetched) throw new Error("메일을 찾을 수 없습니다.")
  const { raw, flags, internalDate } = fetched

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
  const attachments = listMimeAttachments(raw)

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
    receivedAt: parseInternalDate(internalDate),
    isRead: flags.includes("\\Seen"),
    isStarred: flags.includes("\\Flagged"),
    attachments: attachments.length > 0 ? attachments : undefined,
    toRecipients: headers["to"] ? parseAddressList(headers["to"]) : undefined,
    ccRecipients: headers["cc"] ? parseAddressList(headers["cc"]) : undefined,
  }
}

export async function imapGetAttachment(
  config: ImapConfig,
  uid: string,
  attachmentId: string,
): Promise<{ bytes: Uint8Array; mimeType: string; filename: string } | null> {
  const fetched = await imapFetchRawByUid(config, uid)
  if (!fetched) return null
  return extractMimeAttachment(fetched.raw, attachmentId)
}

export async function imapVerify(config: ImapConfig): Promise<void> {
  await withImap(config, async () => {})
}

// ── Bulk operations (single connection for many UIDs) ────────────────────────

export async function imapMarkAsReadBulk(config: ImapConfig, uids: string[], read: boolean): Promise<void> {
  if (uids.length === 0) return
  assertValidUids(uids)
  const flag = read ? "+FLAGS" : "-FLAGS"
  await withImap(config, async (client) => {
    const selectResult = await client.command("SELECT INBOX")
    if (!selectResult.ok) throw new Error("받은편지함을 열 수 없습니다.")
    const storeResult = await client.command(`UID STORE ${uids.join(",")} ${flag} (\\Seen)`)
    if (!storeResult.ok) throw new Error("읽음 처리에 실패했습니다.")
  })
}

export async function imapMarkAllInboxUnreadAsRead(config: ImapConfig): Promise<void> {
  await withImap(config, async (client) => {
    const selectResult = await client.command("SELECT INBOX")
    if (!selectResult.ok) return
    const searchResult = await client.command("UID SEARCH UNSEEN")
    if (!searchResult.ok) return
    const line = searchResult.lines.find((l) => /^\*\s+SEARCH/i.test(l))
    if (!line) return
    const uids = line.replace(/^\*\s+SEARCH\s*/i, "").trim().split(/\s+/).filter(Boolean)
    if (uids.length === 0) return
    await client.command(`UID STORE ${uids.join(",")} +FLAGS.SILENT (\\Seen)`)
  })
}

export async function imapToggleStarBulk(config: ImapConfig, uids: string[], starred: boolean): Promise<void> {
  if (uids.length === 0) return
  assertValidUids(uids)
  const flag = starred ? "+FLAGS" : "-FLAGS"
  await withImap(config, async (client) => {
    const selectResult = await client.command("SELECT INBOX")
    if (!selectResult.ok) throw new Error("받은편지함을 열 수 없습니다.")
    const storeResult = await client.command(`UID STORE ${uids.join(",")} ${flag} (\\Flagged)`)
    if (!storeResult.ok) throw new Error("별표 처리에 실패했습니다.")
  })
}

// 삭제 = 휴지통 폴더가 있으면 그쪽으로 이동, 없으면 기존처럼 영구 삭제로 폴백
export async function imapDeleteMailBulk(config: ImapConfig, uids: string[]): Promise<void> {
  if (uids.length === 0) return
  assertValidUids(uids)
  await withImap(config, async (client) => {
    const selectResult = await client.command("SELECT INBOX")
    if (!selectResult.ok) throw new Error("받은편지함을 열 수 없습니다.")

    const trash = await imapFindTrashMailbox(client)
    if (trash) {
      const copyResult = await client.command(`UID COPY ${uids.join(",")} ${quoteImap(trash)}`)
      if (!copyResult.ok) throw new Error("메일을 휴지통으로 이동하지 못했습니다.")
    }
    const storeResult = await client.command(`UID STORE ${uids.join(",")} +FLAGS (\\Deleted)`)
    if (!storeResult.ok) throw new Error("메일 삭제에 실패했습니다.")
    const expungeResult = await client.command("EXPUNGE")
    if (!expungeResult.ok) throw new Error("메일 삭제에 실패했습니다.")
  })
}

// ── Naver-specific exports ────────────────────────────────────────────────────

export async function verifyNaverCredentials(email: string, appPassword: string): Promise<void> {
  await imapVerify(naverConfig(email, appPassword))
}

export async function naverListInbox(
  email: string,
  appPassword: string,
  accountId: string,
  maxResults = 20,
  offset = 0,
): Promise<{ mails: Mail[]; hasMore: boolean }> {
  return imapListInbox(naverConfig(email, appPassword), accountId, maxResults, offset)
}

export async function naverSearchInbox(
  email: string,
  appPassword: string,
  accountId: string,
  query: string,
  maxResults = 30,
  field?: "from" | "subject",
): Promise<Mail[]> {
  return imapSearchInbox(naverConfig(email, appPassword), accountId, query, maxResults, field)
}

export async function naverMarkAsRead(email: string, appPassword: string, uid: string): Promise<void> {
  return imapMarkAsRead(naverConfig(email, appPassword), uid)
}

export async function naverToggleStar(email: string, appPassword: string, uid: string, starred: boolean): Promise<void> {
  return imapToggleStar(naverConfig(email, appPassword), uid, starred)
}

export async function naverMarkAsUnread(email: string, appPassword: string, uid: string): Promise<void> {
  return imapMarkAsUnread(naverConfig(email, appPassword), uid)
}

export async function naverDeleteMail(email: string, appPassword: string, uid: string): Promise<void> {
  return imapDeleteMail(naverConfig(email, appPassword), uid)
}

export async function naverGetMailDetail(
  email: string,
  appPassword: string,
  accountId: string,
  uid: string,
): Promise<Mail> {
  return imapGetMailDetail(naverConfig(email, appPassword), accountId, uid)
}

export async function naverMarkAsReadBulk(email: string, appPassword: string, uids: string[], read: boolean): Promise<void> {
  return imapMarkAsReadBulk(naverConfig(email, appPassword), uids, read)
}

export async function naverMarkAllInboxUnreadAsRead(email: string, appPassword: string): Promise<void> {
  return imapMarkAllInboxUnreadAsRead(naverConfig(email, appPassword))
}

export async function naverToggleStarBulk(email: string, appPassword: string, uids: string[], starred: boolean): Promise<void> {
  return imapToggleStarBulk(naverConfig(email, appPassword), uids, starred)
}

export async function naverDeleteMailBulk(email: string, appPassword: string, uids: string[]): Promise<void> {
  return imapDeleteMailBulk(naverConfig(email, appPassword), uids)
}

export async function naverListTrash(
  email: string,
  appPassword: string,
  accountId: string,
  maxResults = 20,
  offset = 0,
): Promise<{ mails: Mail[]; hasMore: boolean }> {
  return imapListTrash(naverConfig(email, appPassword), accountId, maxResults, offset)
}

export async function naverPermanentDeleteBulk(email: string, appPassword: string, uids: string[]): Promise<void> {
  return imapPermanentDeleteBulk(naverConfig(email, appPassword), uids)
}

export async function naverRestoreFromTrashBulk(email: string, appPassword: string, uids: string[]): Promise<void> {
  return imapRestoreFromTrashBulk(naverConfig(email, appPassword), uids)
}

export async function naverEmptyTrash(email: string, appPassword: string): Promise<void> {
  return imapEmptyTrash(naverConfig(email, appPassword))
}

export async function naverFetchByUids(email: string, appPassword: string, accountId: string, uids: string[]): Promise<Mail[]> {
  return imapFetchByUids(naverConfig(email, appPassword), accountId, uids)
}

export async function naverGetAttachment(
  email: string,
  appPassword: string,
  uid: string,
  attachmentId: string,
): Promise<{ bytes: Uint8Array; mimeType: string; filename: string } | null> {
  return imapGetAttachment(naverConfig(email, appPassword), uid, attachmentId)
}

// ── Daum-specific exports ─────────────────────────────────────────────────────

export async function verifyDaumCredentials(email: string, password: string): Promise<void> {
  await imapVerify(daumConfig(email, password))
}

export async function daumMarkAsUnread(email: string, password: string, uid: string): Promise<void> {
  return imapMarkAsUnread(daumConfig(email, password), uid)
}

export async function daumDeleteMail(email: string, password: string, uid: string): Promise<void> {
  return imapDeleteMail(daumConfig(email, password), uid)
}

export async function daumListInbox(
  email: string,
  password: string,
  accountId: string,
  maxResults = 20,
  offset = 0,
): Promise<{ mails: Mail[]; hasMore: boolean }> {
  return imapListInbox(daumConfig(email, password), accountId, maxResults, offset)
}

export async function daumSearchInbox(
  email: string,
  password: string,
  accountId: string,
  query: string,
  maxResults = 30,
  field?: "from" | "subject",
): Promise<Mail[]> {
  return imapSearchInbox(daumConfig(email, password), accountId, query, maxResults, field)
}

export async function daumMarkAsRead(email: string, password: string, uid: string): Promise<void> {
  return imapMarkAsRead(daumConfig(email, password), uid)
}

export async function daumToggleStar(email: string, password: string, uid: string, starred: boolean): Promise<void> {
  return imapToggleStar(daumConfig(email, password), uid, starred)
}

export async function daumGetMailDetail(
  email: string,
  password: string,
  accountId: string,
  uid: string,
): Promise<Mail> {
  return imapGetMailDetail(daumConfig(email, password), accountId, uid)
}

export async function daumMarkAsReadBulk(email: string, password: string, uids: string[], read: boolean): Promise<void> {
  return imapMarkAsReadBulk(daumConfig(email, password), uids, read)
}

export async function daumMarkAllInboxUnreadAsRead(email: string, password: string): Promise<void> {
  return imapMarkAllInboxUnreadAsRead(daumConfig(email, password))
}

export async function daumToggleStarBulk(email: string, password: string, uids: string[], starred: boolean): Promise<void> {
  return imapToggleStarBulk(daumConfig(email, password), uids, starred)
}

export async function daumDeleteMailBulk(email: string, password: string, uids: string[]): Promise<void> {
  return imapDeleteMailBulk(daumConfig(email, password), uids)
}

export async function daumListTrash(
  email: string,
  password: string,
  accountId: string,
  maxResults = 20,
  offset = 0,
): Promise<{ mails: Mail[]; hasMore: boolean }> {
  return imapListTrash(daumConfig(email, password), accountId, maxResults, offset)
}

export async function daumPermanentDeleteBulk(email: string, password: string, uids: string[]): Promise<void> {
  return imapPermanentDeleteBulk(daumConfig(email, password), uids)
}

export async function daumRestoreFromTrashBulk(email: string, password: string, uids: string[]): Promise<void> {
  return imapRestoreFromTrashBulk(daumConfig(email, password), uids)
}

export async function daumEmptyTrash(email: string, password: string): Promise<void> {
  return imapEmptyTrash(daumConfig(email, password))
}

export async function daumFetchByUids(email: string, password: string, accountId: string, uids: string[]): Promise<Mail[]> {
  return imapFetchByUids(daumConfig(email, password), accountId, uids)
}

export async function daumGetAttachment(
  email: string,
  password: string,
  uid: string,
  attachmentId: string,
): Promise<{ bytes: Uint8Array; mimeType: string; filename: string } | null> {
  return imapGetAttachment(daumConfig(email, password), uid, attachmentId)
}
