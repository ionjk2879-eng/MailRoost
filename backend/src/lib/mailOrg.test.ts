import { describe, expect, it } from "vitest"
import type { Env, StoredSession } from "../types"
import { assignmentKey, getUserMailOrg, mutateMailOrg, parseAssignmentKey } from "./mailOrg"

// env.TOKENS의 get/put만 구현한 최소 페이크. getUserMailOrg/saveUserMailOrg가 쓰는
// 정확한 시그니처(get(key): string | null, put(key, value): void)와 맞춘다.
class FakeTokensKV {
  private store = new Map<string, string>()

  async get(key: string): Promise<string | null> {
    return this.store.has(key) ? (this.store.get(key) as string) : null
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value)
  }
}

function fakeEnv(): Env {
  return { TOKENS: new FakeTokensKV() } as unknown as Env
}

describe("assignmentKey / parseAssignmentKey", () => {
  it("round-trips a simple accountId/mailId pair", () => {
    const accountId = "gmail:abc123"
    const mailId = "msg-1"
    const key = assignmentKey(accountId, mailId)
    const parsed = parseAssignmentKey(key, [accountId, "other-account"])
    expect(parsed).toEqual({ accountId, mailId })
  })

  it("picks the longest matching accountId when one is a prefix of another", () => {
    // "acct12"로 만든 키를 ["acct1", "acct12"]와 대조하면 "acct1"도 접두사로 매치되지만
    // 더 긴 "acct12"가 정답이어야 한다 (그렇지 않으면 mailId가 "2m1"처럼 잘못 잘린다).
    const key = assignmentKey("acct12", "m1")
    const parsed = parseAssignmentKey(key, ["acct1", "acct12"])
    expect(parsed).toEqual({ accountId: "acct12", mailId: "m1" })
  })

  it("strips a legacy leading control character (U+0001) after the accountId", () => {
    const accountId = "acct1"
    const mailId = "m1"
    const legacyKey = `${accountId}${String.fromCharCode(1)}${mailId}`
    const parsed = parseAssignmentKey(legacyKey, [accountId])
    expect(parsed).toEqual({ accountId, mailId })
  })

  it("returns null when no connected accountId matches", () => {
    const parsed = parseAssignmentKey("unknown-account-m1", ["acct1", "acct2"])
    expect(parsed).toBeNull()
  })
})

describe("mutateMailOrg concurrency pattern (재조회 후 반영)", () => {
  it("sequential mutateMailOrg calls each see the other's prior write (no lost update)", async () => {
    const env = fakeEnv()
    const session: StoredSession = { userId: "user-1", accounts: {} }
    const sessionId = "session-1"

    await mutateMailOrg(env, sessionId, session, (org) => {
      org.folders.push({ id: "folder-a", name: "A", color: "#111111", createdAt: 1 })
    })

    await mutateMailOrg(env, sessionId, session, (org) => {
      org.folders.push({ id: "folder-b", name: "B", color: "#222222", createdAt: 2 })
    })

    const finalState = await getUserMailOrg(env, "user-1")
    expect(finalState.folders.map((f) => f.id).sort()).toEqual(["folder-a", "folder-b"])
  })
})
