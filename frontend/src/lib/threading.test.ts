import { describe, expect, it } from "vitest"
import { groupIntoThreads } from "./threading"
import type { Mail } from "@/types/mail"

function makeMail(overrides: Partial<Mail> & { id: string; accountId: string }): Mail {
  return {
    fromName: "Sender",
    fromEmail: "sender@example.com",
    subject: "Subject",
    snippet: "",
    body: "",
    category: "primary",
    receivedAt: "2026-01-01T00:00:00.000Z",
    isRead: true,
    isStarred: false,
    ...overrides,
  }
}

describe("groupIntoThreads", () => {
  it("groups Gmail mails sharing accountId + threadId", () => {
    const a = makeMail({ id: "1", accountId: "gmail:me", threadId: "t1", receivedAt: "2026-01-01T00:00:00.000Z" })
    const b = makeMail({ id: "2", accountId: "gmail:me", threadId: "t1", receivedAt: "2026-01-02T00:00:00.000Z" })
    const c = makeMail({ id: "3", accountId: "gmail:me", threadId: "t2", receivedAt: "2026-01-01T00:00:00.000Z" })

    const groups = groupIntoThreads([a, b, c])

    expect(groups).toHaveLength(2)
    const grouped = groups.find((g) => g.length === 2)!
    expect(grouped.map((m) => m.id)).toEqual(["1", "2"]) // 오래된 것 → 최신 순
  })

  it("does not merge the same Gmail threadId across different accounts", () => {
    const a = makeMail({ id: "1", accountId: "gmail:work", threadId: "t1" })
    const b = makeMail({ id: "2", accountId: "gmail:personal", threadId: "t1" })

    const groups = groupIntoThreads([a, b])

    expect(groups).toHaveLength(2)
  })

  it("chains IMAP mails via messageId/references within one account", () => {
    const original = makeMail({
      id: "1", accountId: "naver:me", messageId: "m1",
      receivedAt: "2026-01-01T00:00:00.000Z",
    })
    const reply = makeMail({
      id: "2", accountId: "naver:me", messageId: "m2", references: ["m1"], inReplyTo: "m1",
      receivedAt: "2026-01-02T00:00:00.000Z",
    })
    const replyToReply = makeMail({
      id: "3", accountId: "naver:me", messageId: "m3", references: ["m1", "m2"], inReplyTo: "m2",
      receivedAt: "2026-01-03T00:00:00.000Z",
    })

    const groups = groupIntoThreads([reply, original, replyToReply])

    expect(groups).toHaveLength(1)
    expect(groups[0].map((m) => m.id)).toEqual(["1", "2", "3"])
  })

  it("does not merge IMAP references across different accounts", () => {
    const a = makeMail({ id: "1", accountId: "naver:me", messageId: "m1" })
    const b = makeMail({ id: "2", accountId: "daum:me", messageId: "m2", references: ["m1"], inReplyTo: "m1" })

    const groups = groupIntoThreads([a, b])

    expect(groups).toHaveLength(2)
  })

  it("keeps mails with no thread headers as solo threads", () => {
    const a = makeMail({ id: "1", accountId: "naver:me" })
    const b = makeMail({ id: "2", accountId: "naver:me" })

    const groups = groupIntoThreads([a, b])

    expect(groups).toHaveLength(2)
  })

  it("does not group by matching subject alone", () => {
    const a = makeMail({ id: "1", accountId: "naver:me", subject: "Newsletter" })
    const b = makeMail({ id: "2", accountId: "naver:me", subject: "Newsletter" })

    const groups = groupIntoThreads([a, b])

    expect(groups).toHaveLength(2)
  })
})
