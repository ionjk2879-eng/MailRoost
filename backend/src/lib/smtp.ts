import { connect } from "cloudflare:sockets"

const dec = new TextDecoder("utf-8", { fatal: false, ignoreBOM: false })
const enc = new TextEncoder()

class SmtpSocket {
  private reader: ReadableStreamDefaultReader<Uint8Array>
  private writer: WritableStreamDefaultWriter<Uint8Array>
  private buf = new Uint8Array(0)

  constructor(socket: Socket) {
    this.reader = socket.readable.getReader()
    this.writer = socket.writable.getWriter()
  }

  async write(text: string): Promise<void> {
    await this.writer.write(enc.encode(text))
  }

  private async fill(): Promise<boolean> {
    const { value, done } = await this.reader.read()
    if (done || !value) return false
    const next = new Uint8Array(this.buf.length + value.length)
    next.set(this.buf)
    next.set(value, this.buf.length)
    this.buf = next
    return true
  }

  private async readLine(): Promise<string> {
    while (true) {
      for (let i = 0; i < this.buf.length - 1; i++) {
        if (this.buf[i] === 13 && this.buf[i + 1] === 10) {
          const line = dec.decode(this.buf.slice(0, i))
          this.buf = this.buf.slice(i + 2)
          return line
        }
      }
      if (!(await this.fill())) throw new Error("SMTP 연결이 예기치 않게 종료되었습니다.")
    }
  }

  // Reads a complete SMTP response, handling multi-line replies (xxx-text vs xxx text)
  async readResponse(): Promise<{ code: number; text: string }> {
    let lastText = ""
    while (true) {
      const line = await this.readLine()
      const code = Number(line.slice(0, 3))
      lastText = line.slice(4)
      if (line[3] !== "-") return { code, text: lastText }
    }
  }

  async close(): Promise<void> {
    try { await this.writer.close() } catch { /* ignore */ }
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function encodeRfc2047(str: string): string {
  if (!/[^\x00-\x7F]/.test(str)) return str
  return `=?UTF-8?B?${bytesToBase64(enc.encode(str))}?=`
}

function buildMessage(from: string, to: string, subject: string, body: string, cc?: string): string {
  const header = [
    `From: ${from}`,
    `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    `Subject: ${encodeRfc2047(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
  ].join("\r\n")

  // Escape SMTP dot-stuffing: lines starting with '.' get an extra '.'
  const escapedBody = body
    .split("\n")
    .map((line) => (line.startsWith(".") ? "." + line : line))
    .join("\r\n")

  return `${header}\r\n${escapedBody}`
}

function splitAddresses(value: string | undefined): string[] {
  return value ? value.split(",").map((s) => s.trim()).filter(Boolean) : []
}

export async function sendSmtp(
  host: string,
  port: number,
  email: string,
  password: string,
  to: string,
  subject: string,
  body: string,
  cc?: string,
  bcc?: string,
): Promise<void> {
  const socket = connect({ hostname: host, port }, { secureTransport: "on", allowHalfOpen: false })
  const smtp = new SmtpSocket(socket)
  try {
    const greeting = await smtp.readResponse()
    if (greeting.code !== 220) throw new Error(`SMTP 연결 실패: ${greeting.code} ${greeting.text}`)

    await smtp.write("EHLO localhost\r\n")
    const ehlo = await smtp.readResponse()
    if (ehlo.code !== 250) throw new Error(`SMTP EHLO 실패: ${ehlo.code}`)

    await smtp.write("AUTH LOGIN\r\n")
    const a1 = await smtp.readResponse()
    if (a1.code !== 334) throw new Error(`SMTP AUTH 요청 실패: ${a1.code}`)

    await smtp.write(`${btoa(email)}\r\n`)
    const a2 = await smtp.readResponse()
    if (a2.code !== 334) throw new Error(`SMTP 이메일 인증 실패: ${a2.code}`)

    await smtp.write(`${btoa(password)}\r\n`)
    const a3 = await smtp.readResponse()
    if (a3.code !== 235) throw new Error("메일 로그인에 실패했습니다. 이메일 또는 비밀번호를 확인해주세요.")

    await smtp.write(`MAIL FROM:<${email}>\r\n`)
    const mf = await smtp.readResponse()
    if (mf.code !== 250) throw new Error(`MAIL FROM 실패: ${mf.code}`)

    // 실제 수신 봉투(envelope)는 To/Cc/Bcc 구분 없이 전체 수신자에게 RCPT TO를 보내야 한다.
    // Bcc는 헤더에는 안 쓰지만 여기서는 똑같이 받아야 한다.
    const recipients = [...splitAddresses(to), ...splitAddresses(cc), ...splitAddresses(bcc)]
    for (const recipient of recipients) {
      await smtp.write(`RCPT TO:<${recipient}>\r\n`)
      const rt = await smtp.readResponse()
      if (rt.code !== 250) throw new Error(`수신자 오류(${recipient}): ${rt.code} — 유효한 이메일 주소인지 확인해주세요.`)
    }

    await smtp.write("DATA\r\n")
    const data = await smtp.readResponse()
    if (data.code !== 354) throw new Error(`DATA 실패: ${data.code}`)

    const msg = buildMessage(email, to, subject, body, cc)
    await smtp.write(`${msg}\r\n.\r\n`)
    const sent = await smtp.readResponse()
    if (sent.code !== 250) throw new Error(`메일 전송 실패: ${sent.code}`)

    await smtp.write("QUIT\r\n")
  } finally {
    await smtp.close()
  }
}

// Provider-specific helpers
export async function naverSendMail(
  email: string,
  appPassword: string,
  to: string,
  subject: string,
  body: string,
  cc?: string,
  bcc?: string,
): Promise<void> {
  await sendSmtp("smtp.naver.com", 465, email, appPassword, to, subject, body, cc, bcc)
}

export async function daumSendMail(
  email: string,
  password: string,
  to: string,
  subject: string,
  body: string,
  cc?: string,
  bcc?: string,
): Promise<void> {
  await sendSmtp("smtp.daum.net", 465, email, password, to, subject, body, cc, bcc)
}
