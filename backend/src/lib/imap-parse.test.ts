import { describe, expect, it } from "vitest"
import { mapFetchLinesToMails } from "./imap-parse"

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
