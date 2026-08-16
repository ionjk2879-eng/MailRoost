function backoffDelayMs(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))
  return exp * (0.5 + Math.random() * 0.5) // 50~100% 지터를 섞어 동시에 재시도가 몰리는 것을 피한다
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface RetryOptions<T> {
  maxAttempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  shouldRetryResult?: (result: T) => boolean
  shouldRetryError?: (error: unknown) => boolean
  // 재시도 지연 시간을 직접 정하고 싶을 때 (예: 429 응답의 Retry-After 헤더 존중).
  // undefined를 반환하면 기본 지수 백오프를 쓴다.
  delayForResult?: (result: T) => number | undefined
}

// 결과값(HTTP 응답 상태 등) 또는 예외를 기준으로 지수 백오프 재시도를 수행하는 범용 헬퍼.
export async function retryAsync<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions<T> = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 4
  const baseDelayMs = opts.baseDelayMs ?? 500
  const maxDelayMs = opts.maxDelayMs ?? 8000

  for (let attempt = 1; ; attempt++) {
    const isLastAttempt = attempt >= maxAttempts
    try {
      const result = await fn(attempt)
      if (isLastAttempt || !(opts.shouldRetryResult?.(result) ?? false)) return result
      await sleep(opts.delayForResult?.(result) ?? backoffDelayMs(attempt, baseDelayMs, maxDelayMs))
    } catch (err) {
      if (isLastAttempt || !(opts.shouldRetryError?.(err) ?? false)) throw err
      await sleep(backoffDelayMs(attempt, baseDelayMs, maxDelayMs))
    }
  }
}
