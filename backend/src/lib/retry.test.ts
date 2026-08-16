import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { retryAsync } from "./retry"

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

// setTimeout 기반 재시도 지연을 실제로 기다리지 않고 즉시 진행시키기 위한 헬퍼.
async function runWithFakeTimers<T>(promise: Promise<T>): Promise<T> {
  let settled = false
  // .then(onFulfilled, onRejected)로 양쪽 다 처리해서, promise가 reject되더라도
  // 별도의 처리되지 않은 rejection을 새로 만들지 않는다 (.finally()는 그대로 다시 던진다).
  promise.then(() => { settled = true }, () => { settled = true })
  while (!settled) {
    await vi.advanceTimersByTimeAsync(10_000)
  }
  return promise
}

describe("retryAsync", () => {
  it("첫 시도가 성공하면 재시도하지 않는다", async () => {
    const fn = vi.fn(async () => "ok")
    const result = await retryAsync(fn)
    expect(result).toBe("ok")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("shouldRetryResult가 true인 동안 재시도하다 성공하면 반환한다", async () => {
    let calls = 0
    const fn = vi.fn(async () => { calls++; return calls < 3 ? "retry-me" : "done" })
    const result = await runWithFakeTimers(
      retryAsync(fn, { maxAttempts: 5, baseDelayMs: 100, shouldRetryResult: (r) => r === "retry-me" }),
    )
    expect(result).toBe("done")
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it("maxAttempts에 도달하면 마지막 결과를 그대로 반환한다", async () => {
    const fn = vi.fn(async () => "always-retry-me")
    const result = await runWithFakeTimers(
      retryAsync(fn, { maxAttempts: 3, baseDelayMs: 10, shouldRetryResult: () => true }),
    )
    expect(result).toBe("always-retry-me")
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it("shouldRetryError가 false를 반환하는 에러는 즉시 던진다", async () => {
    class PermanentError extends Error {}
    const fn = vi.fn(async () => { throw new PermanentError("nope") })
    await expect(
      retryAsync(fn, { maxAttempts: 5, shouldRetryError: () => false }),
    ).rejects.toBeInstanceOf(PermanentError)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("shouldRetryError가 true인 에러는 재시도하다 소진되면 마지막 에러를 던진다", async () => {
    const fn = vi.fn(async () => { throw new Error("transient") })
    const promise = retryAsync(fn, { maxAttempts: 3, baseDelayMs: 10, shouldRetryError: () => true })
    await expect(runWithFakeTimers(promise)).rejects.toThrow("transient")
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it("delayForResult가 지정한 지연 시간을 우선 사용한다", async () => {
    let calls = 0
    const fn = vi.fn(async () => { calls++; return calls < 2 ? "wait" : "ok" })
    const result = await runWithFakeTimers(
      retryAsync(fn, {
        maxAttempts: 5,
        baseDelayMs: 100_000, // 지수 백오프를 그대로 쓰면 오래 걸릴 값 — delayForResult가 이겨야 한다
        shouldRetryResult: (r) => r === "wait",
        delayForResult: () => 1,
      }),
    )
    expect(result).toBe("ok")
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
