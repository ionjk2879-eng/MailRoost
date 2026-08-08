import { Hono } from "hono"
import type { Env } from "./types"
import auth from "./routes/auth"
import naver from "./routes/naver"
import daum from "./routes/daum"
import imapGeneric from "./routes/imap-generic"
import api from "./routes/api"
import { processDueScheduledMails } from "./lib/scheduledSend"

const app = new Hono<{ Bindings: Env }>()

app.route("/auth", auth)
app.route("/auth/naver", naver)
app.route("/auth/daum", daum)
app.route("/auth/imap", imapGeneric)
app.route("/api", api)

app.notFound((c) => c.env.ASSETS.fetch(c.req.raw))

// 라우트에서 던진 에러를 그대로 삼키지 않고 프런트가 읽을 수 있는 JSON으로 전달한다.
// (이게 없으면 실패 이유가 뭐든 프런트에는 뭉뚱그려진 "실패했습니다"만 보임)
app.onError((err, c) => {
  console.error(err)
  return c.json({ error: err.message }, 500)
})

export default {
  fetch: app.fetch,
  // 1분마다 도래한 예약발송 메일을 스캔해서 실제로 보낸다 (wrangler.jsonc의 triggers.crons).
  scheduled: async (_event, env, ctx) => {
    ctx.waitUntil(processDueScheduledMails(env, Date.now()))
  },
} satisfies ExportedHandler<Env>
