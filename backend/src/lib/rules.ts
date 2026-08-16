import type { AutoClassifyRule, Mail, MailCategory } from "../types"

export function matchRule(rule: AutoClassifyRule, mail: Mail): boolean {
  const haystack = (rule.field === "from" ? `${mail.fromName} ${mail.fromEmail}` : mail.subject).toLowerCase()
  return haystack.includes(rule.keyword.toLowerCase())
}

// 카테고리는 저장되는 배정이 아니라 매번 새로 계산되는 값이라, 새 메일/기존 메일 구분 없이 매 조회마다 적용한다.
// enabled + category가 있는 규칙 중 배열 순서상 가장 먼저 매치되는 것을 쓰고, 아무것도 매치하지 않으면
// 메일의 원래 카테고리를 그대로 반환한다.
export function applyCategoryRules(rules: AutoClassifyRule[], mail: Mail): MailCategory {
  for (const rule of rules) {
    if (!rule.enabled || !rule.category) continue
    if (matchRule(rule, mail)) return rule.category
  }
  return mail.category
}
