import { Hono } from "hono"
import type { Env } from "../types"
import accounts from "./accounts"
import folders from "./folders"
import memos from "./memos"
import quickReplies from "./quick-replies"
import drafts from "./drafts"
import rules from "./rules"
import savedFilters from "./saved-filters"
import mail from "./mail"
import trash from "./trash"
import notifications from "./notifications"
import snooze from "./snooze"
import push from "./push"

const api = new Hono<{ Bindings: Env }>()

api.route("/", accounts)
api.route("/", folders)
api.route("/", memos)
api.route("/", quickReplies)
api.route("/", drafts)
api.route("/", rules)
api.route("/", savedFilters)
api.route("/", mail)
api.route("/", trash)
api.route("/", notifications)
api.route("/", snooze)
api.route("/", push)

export default api
