import { afterEach, describe, expect, it } from "vitest"
import { mapMessageToMail, type GmailMessage } from "./gmail"
import { listAttachmentsForAccount } from "./gmail"

describe("listAttachmentsForAccount", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("searches has:attachment, batch-fetches format=full, and flattens attachments across messages", async () => {
    const calls: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString()
      calls.push(url)

      if (url.includes("/messages?")) {
        expect(url).toContain("q=has%3Aattachment")
        return new Response(JSON.stringify({ messages: [{ id: "m1" }, { id: "m2" }] }), { status: 200 })
      }

      // batch endpoint
      const body = await (init?.body as string)
      expect(body).toContain("format=full")
      const boundary = "batch_test"
      const partFor = (msg: {
        id: string
        threadId: string
        snippet: string
        internalDate: string
        labelIds: string[]
        payload: unknown
      }) =>
        `--${boundary}\r\nContent-Type: application/http\r\n\r\nHTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(msg)}\r\n\r\n`

      const msg1 = {
        id: "m1",
        threadId: "t1",
        snippet: "",
        internalDate: "1700000000000",
        labelIds: ["INBOX"],
        payload: {
          headers: [{ name: "From", value: "Alice <alice@example.com>" }, { name: "Subject", value: "Hi" }],
          parts: [
            { filename: "invoice.pdf", mimeType: "application/pdf", body: { attachmentId: "a1", size: 12345 } },
          ],
        },
      }
      const msg2 = {
        id: "m2",
        threadId: "t2",
        snippet: "",
        internalDate: "1700000001000",
        labelIds: ["INBOX"],
        payload: {
          headers: [{ name: "From", value: "Bob <bob@example.com>" }, { name: "Subject", value: "No attachment here" }],
          parts: [],
        },
      }
      const raw = partFor(msg1) + partFor(msg2) + `--${boundary}--`
      return new Response(raw, { status: 200, headers: { "Content-Type": `multipart/mixed; boundary=${boundary}` } })
    }) as typeof fetch

    const result = await listAttachmentsForAccount("token", "gmail:me@example.com")

    expect(calls[0]).toContain("q=has%3Aattachment")
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      accountId: "gmail:me@example.com",
      mailId: "m1",
      attachmentId: "a1",
      filename: "invoice.pdf",
      mimeType: "application/pdf",
      size: 12345,
      fromEmail: "alice@example.com",
      subject: "Hi",
    })
  })

  it("returns an empty array when the search finds no messages", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({}), { status: 200 })) as typeof fetch
    const result = await listAttachmentsForAccount("token", "gmail:me@example.com")
    expect(result).toEqual([])
  })
})

describe("mapMessageToMail", () => {
  it("maps threadId from the Gmail message", () => {
    const msg: GmailMessage = {
      id: "m1",
      threadId: "t1",
      snippet: "hello",
      internalDate: "1700000000000",
      labelIds: ["INBOX"],
      payload: {
        headers: [
          { name: "From", value: "Alice <alice@example.com>" },
          { name: "Subject", value: "Hi" },
        ],
      },
    }
    const mail = mapMessageToMail(msg, "gmail:me@example.com")
    expect(mail.threadId).toBe("t1")
  })

  it("keeps threadId undefined when the API response omits it", () => {
    const msg: GmailMessage = {
      id: "m2",
      snippet: "",
      labelIds: [],
      payload: { headers: [] },
    }
    const mail = mapMessageToMail(msg, "gmail:me@example.com")
    expect(mail.threadId).toBeUndefined()
  })
})
