import { describe, expect, it } from "vitest"
import type { Env } from "../types"
import { assignmentKey, mutateMailOrg, parseAssignmentKey } from "./mailOrg"
import { readSession, writeSession } from "./session"

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

// 로그인한 사용자의 mutateMailOrg는 이제 MailOrgStore Durable Object의 applyOp RPC 호출 하나로
// 위임되므로(lib/mailOrg.ts), 그 경로의 "겹친 요청에도 업데이트가 유실되지 않는다"는 보장은 DO가
// 같은 인스턴스에 대한 동시 호출을 자동으로 직렬화해주는 플랫폼 차원의 성질이라 이 파일의 순수
// KV 페이크로는 재현할 수 없다 (실제 DO 런타임 시뮬레이션에는 @cloudflare/vitest-pool-workers 같은
// 별도 설정이 필요한데, 이 저장소는 plain vitest만 쓴다). 그래서 이 테스트는 지금도 KV에 직접
// 쓰는 게스트 경로(session.userId 없음)를 대상으로, "매 요청이 readSession으로 최신 세션을 다시
// 읽은 뒤 mutateMailOrg를 호출하면 이전 요청의 쓰기를 잃지 않는다"를 검증한다.
describe("mutateMailOrg concurrency pattern (guest/KV 경로, 재조회 후 반영)", () => {
  it("sequential requests (each starting from a fresh readSession) don't lose an update", async () => {
    const env = fakeEnv()
    const sessionId = "session-1"
    await writeSession(env, sessionId, { accounts: {} })

    const session1 = await readSession(env, sessionId)
    await mutateMailOrg(env, sessionId, session1, {
      type: "createFolder",
      id: "folder-a",
      name: "A",
      color: "#111111",
      createdAt: 1,
    })

    const session2 = await readSession(env, sessionId)
    await mutateMailOrg(env, sessionId, session2, {
      type: "createFolder",
      id: "folder-b",
      name: "B",
      color: "#222222",
      createdAt: 2,
    })

    const finalSession = await readSession(env, sessionId)
    expect(finalSession.mailOrg?.folders.map((f) => f.id).sort()).toEqual(["folder-a", "folder-b"])
  })
})
