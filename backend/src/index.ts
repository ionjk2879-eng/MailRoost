import { Hono } from "hono"
import { secureHeaders } from "hono/secure-headers"
import type { Env } from "./types"
import auth from "./routes/auth"
import naver from "./routes/naver"
import daum from "./routes/daum"
import imapGeneric from "./routes/imap-generic"
import api from "./routes/api"
import webhooks from "./routes/webhooks"

// Workers는 Durable Object 클래스를 wrangler.jsonc의 main이 가리키는 엔트리 모듈에서
// export해야 한다 (바인딩만으로는 부족함).
export { MailOrgStore } from "./durable/MailOrgStore"

const app = new Hono<{ Bindings: Env }>()

// 클릭재킹/MIME 스니핑/리퍼러 유출 등을 막는 기본 보안 헤더 + CSP. script-src에 'unsafe-inline'을
// 넣지 않으므로 인라인 <script>는 전부 막힌다(테마 깜빡임 방지 스크립트를 public/theme-init.js로
// 뺀 이유). 발신자 아이콘이 구글 파비콘 서비스에서 이미지를 가져오므로 img-src에만 그 호스트를
// 허용한다.
app.use(
  secureHeaders({
    referrerPolicy: "strict-origin-when-cross-origin",
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://www.google.com"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  }),
)

app.route("/auth", auth)
app.route("/auth/naver", naver)
app.route("/auth/daum", daum)
app.route("/auth/imap", imapGeneric)
app.route("/api", api)
app.route("/webhooks", webhooks)

app.notFound((c) => c.env.ASSETS.fetch(c.req.raw))

// 라우트에서 던진 에러를 그대로 삼키지 않고 프런트가 읽을 수 있는 JSON으로 전달한다.
// (이게 없으면 실패 이유가 뭐든 프런트에는 뭉뚱그려진 "실패했습니다"만 보임)
// 이 앱은 1인 전용이라 앱이 직접 만든 안내 문구(예: "네이버 로그인에 실패했습니다...")를
// 그대로 보여주는 게 디버깅에 실제로 도움이 되므로 기본적으로는 막지 않는다. 다만 어딘가에서
// 실수로 시크릿 값을 에러 메시지에 그대로 섞어 던지는 최악의 경우에 대비해, 그 값이 메시지에
// 포함돼 있으면 무조건 일반 메시지로 대체한다.
app.onError((err, c) => {
  console.error(err)
  const secrets = [c.env.GOOGLE_CLIENT_SECRET, c.env.ACCOUNT_ENCRYPTION_KEY, c.env.VAPID_PRIVATE_JWK, c.env.GMAIL_PUBSUB_TOKEN].filter(
    Boolean,
  )
  const leaksSecret = secrets.some((secret) => err.message.includes(secret))
  const message = leaksSecret ? "요청을 처리하는 중 오류가 발생했습니다." : err.message
  return c.json({ error: message }, 500)
})

// 전용 크론 트리거(하루 1번 실행)를 쓰려 했으나, 이 Cloudflare 계정은 무료 플랜 크론 5개 한도를
// 다른 프로젝트들로 이미 다 써서 배포가 실패했다(2026-08-16). 대신 routes/mail.ts의 GET /mail이
// 이미 20초 폴링으로 자주 호출되는 걸 이용해, 그 요청 안에서 만료 임박한 계정만 갱신한다
// (lib/gmailWatch.ts의 renewIfExpiringSoon). renewExpiringWatches(전체 순회 버전)는 나중에
// 크론 슬롯을 다시 확보하면 그대로 재사용할 수 있게 gmailWatch.ts에 남겨뒀다.
export default { fetch: app.fetch } satisfies ExportedHandler<Env>
