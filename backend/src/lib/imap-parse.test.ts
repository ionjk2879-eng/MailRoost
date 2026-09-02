import { describe, expect, it } from "vitest"
import { mapFetchLinesToAttachments, mapFetchLinesToMails } from "./imap-parse"

function fetchLine(opts: {
  seq?: number
  uid: number
  flags?: string
  date?: string
  from: string
  subject: string
  messageId?: string
  references?: string
  inReplyTo?: string
}): string {
  const headerLines = [
    `From: ${opts.from}`,
    `Subject: ${opts.subject}`,
    ...(opts.messageId ? [`Message-ID: ${opts.messageId}`] : []),
    ...(opts.references ? [`References: ${opts.references}`] : []),
    ...(opts.inReplyTo ? [`In-Reply-To: ${opts.inReplyTo}`] : []),
  ]
  const literal = headerLines.join("\r\n") + "\r\n\r\n"
  return (
    `* ${opts.seq ?? 1} FETCH (UID ${opts.uid} FLAGS (${opts.flags ?? "\\Seen"}) ` +
    `INTERNALDATE "01-Jan-2026 10:00:00 +0000" ` +
    `BODY[HEADER.FIELDS (FROM SUBJECT MESSAGE-ID REFERENCES IN-REPLY-TO)] {${literal.length}}\r\n${literal})`
  )
}

describe("mapFetchLinesToMails", () => {
  it("extracts messageId, references and inReplyTo when present", () => {
    const line = fetchLine({
      uid: 101,
      from: "Alice <alice@example.com>",
      subject: "Re: Hi",
      messageId: "<msg2@mail.example>",
      references: "<msg1@mail.example>",
      inReplyTo: "<msg1@mail.example>",
    })
    const [mail] = mapFetchLinesToMails([line], "naver:me@naver.com")
    expect(mail.messageId).toBe("msg2@mail.example")
    expect(mail.references).toEqual(["msg1@mail.example"])
    expect(mail.inReplyTo).toBe("msg1@mail.example")
  })

  it("splits a multi-id References header into an array, stripping angle brackets", () => {
    const line = fetchLine({
      uid: 102,
      from: "Bob <bob@example.com>",
      subject: "Re: Hi",
      messageId: "<msg3@mail.example>",
      references: "<msg1@mail.example> <msg2@mail.example>",
    })
    const [mail] = mapFetchLinesToMails([line], "naver:me@naver.com")
    expect(mail.references).toEqual(["msg1@mail.example", "msg2@mail.example"])
  })

  it("leaves the fields undefined when the headers are absent", () => {
    const line = fetchLine({ uid: 103, from: "Carol <carol@example.com>", subject: "No thread info" })
    const [mail] = mapFetchLinesToMails([line], "naver:me@naver.com")
    expect(mail.messageId).toBeUndefined()
    expect(mail.references).toBeUndefined()
    expect(mail.inReplyTo).toBeUndefined()
  })
})

// 실제 ImapSocket.readLogicalLine은 IMAP 리터럴({n}\r\n<n바이트>)을 통째로 읽어
// {n} 표시를 없애고 CRLF를 LF로 바꾼 뒤 한 줄로 이어붙인다. 첨부함 스캔이 보는 FETCH 줄은
// 그래서 `* <seq> FETCH (UID .. INTERNALDATE ".." BODY[] <LF 줄바꿈 RFC822 원문>)` 모양이다.
// 아래 헬퍼는 그 형태를 그대로 재현한다 — 그래야 listMimeAttachments가 진짜 multipart를 파싱한다.
function base64(text: string): string {
  return btoa(text)
}

interface FixtureAttachment {
  filename: string
  mimeType: string
  content: string
}

function multipartFetchLine(opts: {
  seq?: number
  uid: number
  from: string
  subject: string
  attachments: FixtureAttachment[]
  boundary?: string
}): string {
  const boundary = opts.boundary ?? "MailRoostTestBoundary"
  const parts = [
    ["Content-Type: text/plain; charset=utf-8", "", "본문입니다."].join("\n"),
    ...opts.attachments.map((att) =>
      [
        `Content-Type: ${att.mimeType}; name="${att.filename}"`,
        `Content-Disposition: attachment; filename="${att.filename}"`,
        "Content-Transfer-Encoding: base64",
        "",
        base64(att.content),
      ].join("\n"),
    ),
  ]
  const raw = [
    `From: ${opts.from}`,
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    "이 메일은 MIME 형식입니다.",
    ...parts.map((part) => `--${boundary}\n${part}`),
    `--${boundary}--`,
    "",
  ].join("\n")
  return (
    `* ${opts.seq ?? 1} FETCH (UID ${opts.uid} INTERNALDATE "02-Feb-2026 09:30:00 +0000" ` +
    `BODY[] ${raw})`
  )
}

describe("mapFetchLinesToAttachments", () => {
  it("maps a single-attachment message to exactly one item with correct metadata", () => {
    const line = multipartFetchLine({
      uid: 501,
      from: "Alice <alice@example.com>",
      subject: "보고서 첨부",
      attachments: [{ filename: "report.pdf", mimeType: "application/pdf", content: "PDF-BYTES" }],
    })
    const items = mapFetchLinesToAttachments([line], "naver:me@naver.com")
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      accountId: "naver:me@naver.com",
      mailId: "501",
      attachmentId: "0",
      filename: "report.pdf",
      mimeType: "application/pdf",
      size: "PDF-BYTES".length,
      fromName: "Alice",
      fromEmail: "alice@example.com",
      subject: "보고서 첨부",
    })
    expect(items[0].receivedAt).toBe(new Date("2026-02-02T09:30:00+00:00").toISOString())
  })

  it("maps a two-attachment message to exactly two items", () => {
    const line = multipartFetchLine({
      uid: 502,
      from: "Bob <bob@example.com>",
      subject: "파일 두 개",
      attachments: [
        { filename: "a.txt", mimeType: "text/plain", content: "AAA" },
        { filename: "b.png", mimeType: "image/png", content: "BBBBB" },
      ],
    })
    const items = mapFetchLinesToAttachments([line], "acc1")
    expect(items).toHaveLength(2)
    expect(items.map((i) => i.filename)).toEqual(["a.txt", "b.png"])
    expect(items.map((i) => i.attachmentId)).toEqual(["0", "1"])
    expect(items.map((i) => i.size)).toEqual([3, 5])
    expect(items.every((i) => i.mailId === "502")).toBe(true)
  })

  it("contributes nothing for a message without attachments", () => {
    const line = multipartFetchLine({
      uid: 503,
      from: "Carol <carol@example.com>",
      subject: "첨부 없음",
      attachments: [],
    })
    expect(mapFetchLinesToAttachments([line], "acc1")).toEqual([])
  })

  it("flattens results across multiple FETCH lines and ignores non-FETCH lines", () => {
    const lines = [
      "* 7 EXISTS",
      multipartFetchLine({
        seq: 1,
        uid: 601,
        from: "Alice <alice@example.com>",
        subject: "첫 번째",
        attachments: [{ filename: "one.pdf", mimeType: "application/pdf", content: "1" }],
      }),
      multipartFetchLine({
        seq: 2,
        uid: 602,
        from: "Bob <bob@example.com>",
        subject: "두 번째",
        attachments: [
          { filename: "two-a.pdf", mimeType: "application/pdf", content: "22" },
          { filename: "two-b.pdf", mimeType: "application/pdf", content: "333" },
        ],
      }),
      multipartFetchLine({ seq: 3, uid: 603, from: "Carol <c@example.com>", subject: "빈 메일", attachments: [] }),
    ]
    const items = mapFetchLinesToAttachments(lines, "acc1")
    expect(items).toHaveLength(3)
    expect(items.map((i) => `${i.mailId}:${i.filename}`)).toEqual([
      "601:one.pdf",
      "602:two-a.pdf",
      "602:two-b.pdf",
    ])
  })
})
