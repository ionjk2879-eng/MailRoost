import { Hono } from "hono"
import type { Env } from "./types"
import auth from "./routes/auth"
import naver from "./routes/naver"
import daum from "./routes/daum"
import imapGeneric from "./routes/imap-generic"
import api from "./routes/api"

// Workers는 Durable Object 클래스를 wrangler.jsonc의 main이 가리키는 엔트리 모듈에서
// export해야 한다 (바인딩만으로는 부족함).
export { MailOrgStore } from "./durable/MailOrgStore"

const app = new Hono<{ Bindings: Env }>()

app.route("/auth", auth)
app.route("/auth/naver", naver)
app.route("/auth/daum", daum)
app.route("/auth/imap", imapGeneric)
app.route("/api", api)

app.notFound((c) => c.env.ASSETS.fetch(c.req.raw))

// 라우트에서 던진 에러를 그대로 삼키지 않고 프런트가 읽을 수 있는 JSON으로 전달한다.
// (이게 없으면 실패 이유가 뭐든 프런트에는 뭉뚱그려진 "실패했습니다"만 보임)
// 이 앱은 1인 전용이라 앱이 직접 만든 안내 문구(예: "네이버 로그인에 실패했습니다...")를
// 그대로 보여주는 게 디버깅에 실제로 도움이 되므로 기본적으로는 막지 않는다. 다만 어딘가에서
// 실수로 시크릿 값을 에러 메시지에 그대로 섞어 던지는 최악의 경우에 대비해, 그 값이 메시지에
// 포함돼 있으면 무조건 일반 메시지로 대체한다.
app.onError((err, c) => {
  console.error(err)
  const secrets = [c.env.GOOGLE_CLIENT_SECRET, c.env.ACCOUNT_ENCRYPTION_KEY, c.env.VAPID_PRIVATE_JWK].filter(Boolean)
  const leaksSecret = secrets.some((secret) => err.message.includes(secret))
  const message = leaksSecret ? "요청을 처리하는 중 오류가 발생했습니다." : err.message
  return c.json({ error: message }, 500)
})

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>
