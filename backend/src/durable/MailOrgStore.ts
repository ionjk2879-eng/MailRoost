import { DurableObject } from "cloudflare:workers"
import type { Env, MailOrgState } from "../types"
import { getUserMailOrg } from "../lib/mailOrg"
import { applyMailOrgOp, type MailOrgOp } from "../lib/mailOrgOps"

// 로그인한 사용자당 하나씩 뜨는 Durable Object. MailOrgState(분류 메일함/규칙/배정/보관/스누즈/
// 뮤트/저장된 필터 등) 전체를 이 DO 하나가 들고 있다. Cloudflare가 같은 DO 인스턴스에 대한 동시
// 호출을 자동으로 직렬화해주므로, applyOp 하나(읽기+수정+쓰기를 전부 그 메서드 호출 "안에서" 처리)
// 로 노출하는 한 두 탭/폴링이 겹쳐도 레이스가 생기지 않는다 — Worker가 이걸 "RPC로 읽고 → 로컬에서
// 고치고 → RPC로 쓰고" 세 단계로 쪼개 부르면 이 보장이 깨지므로 절대 그렇게 호출하지 않는다.
export class MailOrgStore extends DurableObject<Env> {
  private async loadState(userId: string): Promise<MailOrgState> {
    const existing = await this.ctx.storage.get<MailOrgState>("state")
    if (existing) return existing
    // 이 DO에 처음 들어온 요청이면 레거시 KV blob(user:mailorg:<userId>)을 한 번 읽어들여
    // storage로 옮긴다 (지연 마이그레이션). 이후로는 이 DO의 storage가 유일한 출처가 된다.
    const migrated = await getUserMailOrg(this.env, userId)
    await this.ctx.storage.put("state", migrated)
    return migrated
  }

  async getState(userId: string): Promise<MailOrgState> {
    return this.loadState(userId)
  }

  async applyOp(userId: string, op: MailOrgOp): Promise<unknown> {
    const state = await this.loadState(userId)
    const result = applyMailOrgOp(state, op)
    await this.ctx.storage.put("state", state)
    return result
  }
}
