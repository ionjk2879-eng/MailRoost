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
}

interface AttachmentPartInternal {
  filename: string
  mimeType: string
  transferEncoding: string
  rawBody: string
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
  const isAttachment = /attachment/i.test(disposition) || (!!filename && type !== "text/plain" && type !== "text/html")
  if (!isAttachment) return

  parts.push({
    filename: filename ?? "첨부파일",
    mimeType: type || "application/octet-stream",
    transferEncoding,
    rawBody: body.replace(/\r?\n$/, ""),
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
