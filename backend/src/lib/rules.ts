import type { AutoClassifyRule, Mail, MailCategory } from "../types"

// mailOrgOps.ts의 classifyMails 연산은 Mail 전체가 아니라 규칙 판정에 필요한 필드만 실어보내므로
// (구조적 복제 가능한 최소 데이터만 op에 담기 위해), Mail 전체가 아닌 이 최소 필드 집합을 받는다.
// Mail은 이 필드들을 전부 갖고 있으니 기존 호출부는 그대로 통과한다.
type MatchableMail = Pick<Mail, "fromName" | "fromEmail" | "subject">

function includesCI(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase())
}

// 조건은 전부 AND — 비어있는 조건("")은 따지지 않는다. include는 만족해야, exclude는 안 만족해야 통과.
export function matchRule(rule: AutoClassifyRule, mail: MatchableMail): boolean {
  const fromHaystack = `${mail.fromName} ${mail.fromEmail}`
  if (rule.from && !includesCI(fromHaystack, rule.from)) return false
  if (rule.subject && !includesCI(mail.subject, rule.subject)) return false
  if (rule.excludeFrom && includesCI(fromHaystack, rule.excludeFrom)) return false
  if (rule.excludeSubject && includesCI(mail.subject, rule.excludeSubject)) return false
  return true
}

// 카테고리는 저장되는 배정이 아니라 매번 새로 계산되는 값이라, 새 메일/기존 메일 구분 없이 매 조회마다 적용한다.
// enabled + category가 있는 규칙 중 배열 순서상 가장 먼저 매치되는 것을 쓰고, 아무것도 매치하지 않으면
// 메일의 원래 카테고리를 그대로 반환한다.
export function applyCategoryRules(rules: AutoClassifyRule[], mail: MatchableMail & { category: MailCategory }): MailCategory {
  for (const rule of rules) {
    if (!rule.enabled || !rule.category) continue
    if (matchRule(rule, mail)) return rule.category
  }
  return mail.category
}
