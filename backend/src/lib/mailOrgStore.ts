import type { Env } from "../types"
import type { MailOrgStore } from "../durable/MailOrgStore"

// 로그인한 사용자당 MailOrgStore Durable Object 인스턴스 하나를 결정론적으로 얻는다
// (idFromName은 같은 userId에 대해 항상 같은 id를 돌려주므로, 별도 매핑 저장 없이도 매 요청마다
// 같은 인스턴스로 라우팅된다).
export function getMailOrgStub(env: Env, userId: string): DurableObjectStub<MailOrgStore> {
  const id = env.MAIL_ORG.idFromName(userId)
  return env.MAIL_ORG.get(id)
}
