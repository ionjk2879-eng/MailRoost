// Gmail(JSON 응답의 base64url 필드)과 네이버 IMAP(raw RFC822 텍스트) 양쪽에서
// 공통으로 쓰는 MIME/헤더 디코딩 유틸리티.

export function decodeBase64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[\r\n\s]/g, "").replace(/-/g, "+").replace(/_/g, "/")
  const binary = atob(clean)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

export function decodeQuotedPrintableToBytes(input: string): Uint8Array {
  const withoutSoftBreaks = input.replace(/=\r?\n/g, "")
  const bytes: number[] = []
  for (let i = 0; i < withoutSoftBreaks.length; i++) {
    const ch = withoutSoftBreaks[i]
    if (ch === "=" && i + 2 < withoutSoftBreaks.length) {
      const hex = withoutSoftBreaks.slice(i + 1, i + 3)
      const code = Number.parseInt(hex, 16)
      if (!Number.isNaN(code)) {
        bytes.push(code)
        i += 2
        continue
      }
    }
    bytes.push(ch.charCodeAt(0))
  }
  return Uint8Array.from(bytes)
}

export function decodeBytesToText(bytes: Uint8Array, charset?: string): string {
  const normalized = (charset || "utf-8").toLowerCase().replace(/^"|"$/g, "")
  try {
    return new TextDecoder(normalized, { fatal: false, ignoreBOM: false }).decode(bytes)
  } catch {
    return new TextDecoder("utf-8", { fatal: false, ignoreBOM: false }).decode(bytes)
  }
}

// RFC 2047 encoded-word 디코딩: 제목/발신자 헤더에 들어있는 =?UTF-8?B?...?= 같은 값을 사람이 읽을 수 있게 바꾼다.
export function decodeRfc2047(input: string): string {
  return input.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_match, charset: string, encoding: string, text: string) => {
      try {
        const bytes =
          encoding.toUpperCase() === "B"
            ? decodeBase64ToBytes(text)
            : decodeQuotedPrintableToBytes(text.replace(/_/g, " "))
        return decodeBytesToText(bytes, charset)
      } catch {
        return text
      }
    },
  )
}

export function parseFromHeader(from: string): { name: string; email: string } {
  const decoded = decodeRfc2047(from)
  const match = decoded.match(/^(.*?)\s*<(.+)>$/)
  if (match) {
    return { name: match[1].replace(/"/g, "").trim() || match[2], email: match[2] }
  }
  return { name: decoded, email: decoded }
}

// To/Cc처럼 콤마로 구분된 여러 주소가 들어있는 헤더를 파싱한다 (전체회신 수신자 목록용).
// 따옴표로 감싼 표시 이름 안의 콤마("Doe, John" <a@b.com>)는 건너뛰도록 따옴표 안팎을 추적한다.
export function parseAddressList(header: string): string[] {
  const decoded = decodeRfc2047(header)
  const parts: string[] = []
  let current = ""
  let inQuotes = false
  for (const ch of decoded) {
    if (ch === '"') inQuotes = !inQuotes
    if (ch === "," && !inQuotes) {
      parts.push(current)
      current = ""
      continue
    }
    current += ch
  }
  if (current.trim()) parts.push(current)

  return parts
    .map((part) => {
      const trimmed = part.trim()
      const match = trimmed.match(/<(.+)>$/)
      return (match ? match[1] : trimmed).trim()
    })
    .filter(Boolean)
}

export function stripHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// 이메일 HTML은 sandboxed iframe(스크립트 실행 자체가 차단됨) 안에서만 렌더링하지만,
// 방어 심층화 차원에서 스크립트/이벤트 핸들러/javascript: URL/자동 리다이렉트는 미리 제거한다.
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<base\b[^>]*>/gi, "")
    .replace(/<meta\s+[^>]*http-equiv=["']?refresh["']?[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, `$1=$2#$2`)
}

function unfoldHeaders(block: string): string {
  return block.replace(/\r?\n[ \t]+/g, " ")
}

export function parseHeaderBlock(block: string): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const line of unfoldHeaders(block).split(/\r?\n/)) {
    const idx = line.indexOf(":")
    if (idx === -1) continue
    headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim()
  }
  return headers
}

function parseContentType(value: string | undefined): { type: string; params: Record<string, string> } {
  if (!value) return { type: "text/plain", params: {} }
  const segments = value.split(";").map((s) => s.trim())
  const type = segments[0].toLowerCase()
  const params: Record<string, string> = {}
  for (const segment of segments.slice(1)) {
    const eq = segment.indexOf("=")
    if (eq === -1) continue
    const key = segment.slice(0, eq).trim().toLowerCase()
    params[key] = segment
      .slice(eq + 1)
      .trim()
      .replace(/^"|"$/g, "")
  }
  return { type, params }
}

export function splitHeaderAndBody(raw: string): { headerBlock: string; bodyBlock: string } {
  const match = raw.match(/\r?\n\r?\n/)
  if (!match || match.index === undefined) return { headerBlock: raw, bodyBlock: "" }
  return {
    headerBlock: raw.slice(0, match.index),
    bodyBlock: raw.slice(match.index + match[0].length),
  }
}

function decodePartBody(body: string, transferEncoding: string, charset?: string): string {
  const encoding = transferEncoding.toLowerCase()
  if (encoding === "base64") return decodeBytesToText(decodeBase64ToBytes(body), charset)
  if (encoding === "quoted-printable") return decodeBytesToText(decodeQuotedPrintableToBytes(body), charset)
  return body
}

const HEADER_LINE_START = /^[!-9;-~]+:/

function extractFromPart(headers: Record<string, string>, body: string): { text?: string; html?: string } {
  const { type, params } = parseContentType(headers["content-type"])
  const transferEncoding = headers["content-transfer-encoding"] || "7bit"

  if (type.startsWith("multipart/") && params.boundary) {
    const delimiter = `--${params.boundary}`
    let text: string | undefined
    let html: string | undefined
    for (const segment of body.split(delimiter)) {
      const trimmed = segment.replace(/^\r?\n/, "")
      if (!trimmed || trimmed.startsWith("--") || !HEADER_LINE_START.test(trimmed)) continue
      const { headerBlock, bodyBlock } = splitHeaderAndBody(trimmed)
      const result = extractFromPart(parseHeaderBlock(headerBlock), bodyBlock)
      if (!text && result.text) text = result.text
      if (!html && result.html) html = result.html
      if (text && html) break
    }
    return { text, html }
  }

  const decoded = decodePartBody(body.replace(/\r?\n$/, ""), transferEncoding, params.charset)
  if (type === "text/html") return { html: decoded }
  if (type === "text/plain") return { text: decoded }
  return {}
}

// 네이버 IMAP처럼 구조화되지 않은 raw RFC822 메시지 원문(헤더+본문)을 받아
// text/plain, text/html 파트를 재귀적으로 찾아 디코딩한다.
export function parseMimeMessage(raw: string): { text?: string; html?: string } {
  const { headerBlock, bodyBlock } = splitHeaderAndBody(raw)
  return extractFromPart(parseHeaderBlock(headerBlock), bodyBlock)
}

// ── 첨부파일 ───────────────────────────────────────────────────────────────────

export interface MimeAttachmentMeta {
  id: string
  filename: string
  mimeType: string
  size: number
  contentId?: string
}

interface AttachmentPartInternal {
  filename: string
  mimeType: string
  transferEncoding: string
  rawBody: string
  contentId?: string
}

// RFC 2231 확장 파라미터(filename*=UTF-8''%ED...)와 RFC 2047 encoded-word, 일반 따옴표 문자열을 모두 처리한다.
function extractFilename(disposition: string, typeParams: Record<string, string>): string | undefined {
  const starMatch = disposition.match(/filename\*\s*=\s*([^;]+)/i)
  if (starMatch) {
    const parts = starMatch[1].trim().split("'")
    if (parts.length === 3) {
      try {
        return decodeURIComponent(parts[2])
      } catch {
        // 디코딩 실패 시 다른 후보로 폴백
      }
    }
  }
  const plainMatch = disposition.match(/filename\s*=\s*("([^"]*)"|[^;]+)/i)
  if (plainMatch) {
    const raw = (plainMatch[2] ?? plainMatch[1]).trim()
    if (raw) return decodeRfc2047(raw)
  }
  if (typeParams["filename"]) return decodeRfc2047(typeParams["filename"])
  if (typeParams["name"]) return decodeRfc2047(typeParams["name"])
  return undefined
}

function decodeAttachmentBytes(body: string, transferEncoding: string): Uint8Array {
  const encoding = transferEncoding.toLowerCase()
  if (encoding === "base64") return decodeBase64ToBytes(body)
  if (encoding === "quoted-printable") return decodeQuotedPrintableToBytes(body)
  return new TextEncoder().encode(body)
}

function collectAttachmentParts(
  headers: Record<string, string>,
  body: string,
  parts: AttachmentPartInternal[],
): void {
  const { type, params } = parseContentType(headers["content-type"])
  const transferEncoding = headers["content-transfer-encoding"] || "7bit"
  const disposition = headers["content-disposition"] || ""

  if (type.startsWith("multipart/") && params.boundary) {
    const delimiter = `--${params.boundary}`
    for (const segment of body.split(delimiter)) {
      const trimmed = segment.replace(/^\r?\n/, "")
      if (!trimmed || trimmed.startsWith("--") || !HEADER_LINE_START.test(trimmed)) continue
      const { headerBlock, bodyBlock } = splitHeaderAndBody(trimmed)
      collectAttachmentParts(parseHeaderBlock(headerBlock), bodyBlock, parts)
    }
    return
  }

  const filename = extractFilename(disposition, params)
  const contentId = (headers["content-id"] ?? "").trim().replace(/^<|>$/g, "") || undefined
  const isAttachment = /attachment/i.test(disposition) || (!!filename && type !== "text/plain" && type !== "text/html") || (!!contentId && type.startsWith("image/"))
  if (!isAttachment) return

  parts.push({
    filename: filename ?? "첨부파일",
    mimeType: type || "application/octet-stream",
    transferEncoding,
    rawBody: body.replace(/\r?\n$/, ""),
    contentId,
  })
}

// raw RFC822 메시지에서 첨부파일 메타데이터(파일명/타입/크기)만 뽑아낸다. 목록/상세 조회에서 사용.
export function listMimeAttachments(raw: string): MimeAttachmentMeta[] {
  const { headerBlock, bodyBlock } = splitHeaderAndBody(raw)
  const parts: AttachmentPartInternal[] = []
  collectAttachmentParts(parseHeaderBlock(headerBlock), bodyBlock, parts)
  return parts.map((p, i) => ({
    id: String(i),
    filename: p.filename,
    mimeType: p.mimeType,
    size: decodeAttachmentBytes(p.rawBody, p.transferEncoding).length,
    contentId: p.contentId,
  }))
}

// listMimeAttachments가 매긴 id(파트 순서 인덱스)로 실제 바이트를 뽑아낸다. 다운로드 시 raw 메시지를 다시 조회해 호출.
export function extractMimeAttachment(
  raw: string,
  id: string,
): { bytes: Uint8Array; mimeType: string; filename: string } | null {
  const { headerBlock, bodyBlock } = splitHeaderAndBody(raw)
  const parts: AttachmentPartInternal[] = []
  collectAttachmentParts(parseHeaderBlock(headerBlock), bodyBlock, parts)
  const part = parts[Number(id)]
  if (!part) return null
  return {
    bytes: decodeAttachmentBytes(part.rawBody, part.transferEncoding),
    mimeType: part.mimeType,
    filename: part.filename,
  }
}

// ── 발송용 MIME 메시지 빌더 (첨부파일 포함) ──────────────────────────────────────

// IMAP 상세 조회는 이미 RFC822 원문 전체를 내려받는다. cid 이미지를 별도 URL로 두면
// 이미지마다 같은 원문을 다시 FETCH하게 되므로, 작은 인라인 이미지는 즉시 data URL로 치환한다.
export function embedInlineMimeImages(raw: string, html: string, maxTotalBytes = 5 * 1024 * 1024): string {
  const { headerBlock, bodyBlock } = splitHeaderAndBody(raw)
  const parts: AttachmentPartInternal[] = []
  collectAttachmentParts(parseHeaderBlock(headerBlock), bodyBlock, parts)

  let result = html
  let embeddedBytes = 0
  for (const part of parts) {
    if (!part.contentId || !part.mimeType.startsWith("image/")) continue
    const escapedId = part.contentId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const cidPattern = new RegExp(`cid:(?:%3C|<)?${escapedId}(?:%3E|>)?`, "gi")
    if (!cidPattern.test(result)) continue

    const bytes = decodeAttachmentBytes(part.rawBody, part.transferEncoding)
    if (embeddedBytes + bytes.length > maxTotalBytes) continue
    embeddedBytes += bytes.length
    result = result.replace(cidPattern, `data:${part.mimeType};base64,${bytesToBase64(bytes)}`)
  }
  return result
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

// RFC 2045: base64 본문은 한 줄에 76자를 넘지 않아야 한다.
function wrapBase64Lines(base64: string): string {
  const lines: string[] = []
  for (let i = 0; i < base64.length; i += 76) lines.push(base64.slice(i, i + 76))
  return lines.join("\r\n")
}

function encodeRfc2047Header(str: string): string {
  if (!/[^\x00-\x7F]/.test(str)) return str
  return `=?UTF-8?B?${bytesToBase64(new TextEncoder().encode(str))}?=`
}

export interface OutgoingAttachment {
  filename: string
  mimeType: string
  bytes: Uint8Array
}

// 첨부파일이 있으면 multipart/mixed로, 없으면 기존처럼 단순 text/plain으로 raw RFC822 메시지를 만든다.
//
// bcc 헤더 주의: 일반 SMTP 릴레이는 메시지 내용을 수신자 전원에게 그대로 전달하므로, 헤더에 Bcc를
// 넣으면 모두에게 숨은참조 목록이 노출된다 (SMTP는 RCPT TO 봉투로만 숨은참조를 구현해야 함 — 이 함수를
// SMTP 발송에 쓸 때는 bcc를 넘기면 안 된다). 반면 Gmail API는 raw 메시지의 Bcc 헤더를 자기가 파싱해서
// 수신자로만 쓰고 실제 배달 전에 제거해주므로, Gmail 발송에서만 bcc를 넘긴다.
export function buildMimeMessage(params: {
  from: string
  to: string
  cc?: string
  bcc?: string
  subject: string
  textBody: string
  htmlBody?: string
  attachments?: OutgoingAttachment[]
}): string {
  const { from, to, cc, bcc, subject, attachments, htmlBody } = params
  // 본문은 보통 textarea에서 온 LF(\n) 줄바꿈이라 SMTP 전송 규격(CRLF)에 맞게 통일한다.
  const textBody = params.textBody.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n")
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    ...(bcc ? [`Bcc: ${bcc}`] : []),
    `Subject: ${encodeRfc2047Header(subject)}`,
    `MIME-Version: 1.0`,
  ]

  if (!htmlBody && (!attachments || attachments.length === 0)) {
    return [...headers, `Content-Type: text/plain; charset=utf-8`, `Content-Transfer-Encoding: 8bit`, ``, textBody].join(
      "\r\n",
    )
  }

  const alternativeBoundary = `MailRoost_alt_${crypto.randomUUID().replace(/-/g, "")}`
  const contentPart = htmlBody
    ? [
        `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`, ``,
        `--${alternativeBoundary}`, `Content-Type: text/plain; charset=utf-8`, `Content-Transfer-Encoding: 8bit`, ``, textBody,
        `--${alternativeBoundary}`, `Content-Type: text/html; charset=utf-8`, `Content-Transfer-Encoding: 8bit`, ``, htmlBody.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n"),
        `--${alternativeBoundary}--`,
      ].join("\r\n")
    : [`Content-Type: text/plain; charset=utf-8`, `Content-Transfer-Encoding: 8bit`, ``, textBody].join("\r\n")

  if (!attachments || attachments.length === 0) return [...headers, contentPart].join("\r\n")

  const boundary = `MailRoost_${crypto.randomUUID().replace(/-/g, "")}`
  const bodyParts = [
    [`--${boundary}`, contentPart].join("\r\n"),
    ...attachments.map((att) => {
      const safeName = att.filename.replace(/"/g, "")
      return [
        `--${boundary}`,
        `Content-Type: ${att.mimeType || "application/octet-stream"}; name="${safeName}"`,
        `Content-Disposition: attachment; filename="${safeName}"`,
        `Content-Transfer-Encoding: base64`,
        ``,
        wrapBase64Lines(bytesToBase64(att.bytes)),
      ].join("\r\n")
    }),
    `--${boundary}--`,
  ]

  return [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, ``, bodyParts.join("\r\n")].join("\r\n")
}
