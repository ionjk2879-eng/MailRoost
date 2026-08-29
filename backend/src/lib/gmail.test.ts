import { describe, expect, it } from "vitest"
import { mapMessageToMail, type GmailMessage } from "./gmail"

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
