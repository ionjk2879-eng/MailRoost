import { retryAsync } from "./retry"

// 429(rate limit)와 일시적인 5xx만 재시도한다. 그 외(4xx 등)는 서버가 요청 자체를 거부한 것이라
// 재시도해도 결과가 같으므로 그대로 반환한다 — 호출부의 `if (!res.ok) throw ...` 처리는 그대로 둔다.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])

// 네트워크 레벨 실패(fetch 자체가 throw하는 경우)는 재시도하지 않는다 — 전송(메일 발송 등)처럼
// 요청이 서버에 도달했는지 알 수 없는 경우 재시도가 중복 실행으로 이어질 수 있기 때문이다.
// 반면 429/5xx 응답은 서버가 요청을 실제로 처리하기 전에 명시적으로 거부한 것이므로 안전하게 재시도할 수 있다.

function parseRetryAfterMs(res: Response, maxDelayMs: number): number | undefined {
  const header = res.headers.get("Retry-After")
  if (!header) return undefined
  const seconds = Number(header)
  if (!Number.isNaN(seconds)) return Math.min(maxDelayMs, Math.max(0, seconds * 1000))
  const dateMs = Date.parse(header)
  if (!Number.isNaN(dateMs)) return Math.min(maxDelayMs, Math.max(0, dateMs - Date.now()))
  return undefined
}

// 공급자 API(Gmail 등)가 429/일시적 5xx를 반환할 때 지수 백오프(+ Retry-After 헤더 존중)로
// 재시도하는 fetch() 드롭인 대체. 계정 수가 늘어 요청량이 커져도 일시적인 요청 제한에
// 곧바로 실패하지 않고 자동으로 재시도하도록 하기 위함.
export async function fetchWithRetry(input: string, init?: RequestInit): Promise<Response> {
  const maxDelayMs = 8000
  return retryAsync(() => fetch(input, init), {
    maxAttempts: 4,
    baseDelayMs: 500,
    maxDelayMs,
    shouldRetryResult: (res) => RETRYABLE_STATUS.has(res.status),
    delayForResult: (res) => parseRetryAfterMs(res, maxDelayMs),
  })
}
