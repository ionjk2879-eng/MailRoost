import { Hono } from "hono"
import type { Env } from "./types"
import auth from "./routes/auth"
import naver from "./routes/naver"
import daum from "./routes/daum"
import imapGeneric from "./routes/imap-generic"
import api from "./routes/api"

const app = new Hono<{ Bindings: Env }>()

app.route("/auth", auth)
app.route("/auth/naver", naver)
app.route("/auth/daum", daum)
app.route("/auth/imap", imapGeneric)
app.route("/api", api)

app.notFound((c) => c.env.ASSETS.fetch(c.req.raw))

export default app
