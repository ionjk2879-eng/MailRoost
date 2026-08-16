import { describe, expect, it } from "vitest"
import type { AutoClassifyRule, Mail } from "../types"
import { applyCategoryRules, matchRule } from "./rules"

function makeMail(overrides: Partial<Mail> = {}): Mail {
  return {
    id: "mail-1",
    accountId: "acct-1",
    fromName: "Alice",
    fromEmail: "alice@example.com",
    subject: "Weekly newsletter",
    snippet: "",
    body: "",
    category: "primary",
    receivedAt: new Date().toISOString(),
    isRead: false,
    isStarred: false,
    ...overrides,
  }
}

function makeRule(overrides: Partial<AutoClassifyRule> = {}): AutoClassifyRule {
  return {
    id: "rule-1",
    field: "from",
    keyword: "alice",
    targetFolderId: null,
    category: null,
    enabled: true,
    createdAt: Date.now(),
    ...overrides,
  }
}

describe("matchRule", () => {
  it("matches case-insensitively on the from field (fromName + fromEmail)", () => {
    const rule = makeRule({ field: "from", keyword: "ALICE" })
    const mail = makeMail({ fromName: "Alice", fromEmail: "alice@example.com" })
    expect(matchRule(rule, mail)).toBe(true)
  })

  it("matches on fromEmail even when keyword isn't in fromName", () => {
    const rule = makeRule({ field: "from", keyword: "example.com" })
    const mail = makeMail({ fromName: "Alice", fromEmail: "alice@example.com" })
    expect(matchRule(rule, mail)).toBe(true)
  })

  it("matches case-insensitively on the subject field", () => {
    const rule = makeRule({ field: "subject", keyword: "NEWSLETTER" })
    const mail = makeMail({ subject: "Weekly newsletter" })
    expect(matchRule(rule, mail)).toBe(true)
  })

  it("returns false when the keyword isn't present in the target field", () => {
    const rule = makeRule({ field: "subject", keyword: "invoice" })
    const mail = makeMail({ subject: "Weekly newsletter" })
    expect(matchRule(rule, mail)).toBe(false)
  })

  it("does not match a from-field keyword against the subject", () => {
    const rule = makeRule({ field: "from", keyword: "newsletter" })
    const mail = makeMail({ subject: "Weekly newsletter", fromName: "Alice", fromEmail: "alice@example.com" })
    expect(matchRule(rule, mail)).toBe(false)
  })
})

describe("applyCategoryRules", () => {
  it("returns the category of the first matching enabled rule (priority = array order)", () => {
    const rules: AutoClassifyRule[] = [
      makeRule({ id: "r1", field: "from", keyword: "alice", category: "social", enabled: true }),
      makeRule({ id: "r2", field: "from", keyword: "alice", category: "promotions", enabled: true }),
    ]
    const mail = makeMail({ fromName: "Alice", fromEmail: "alice@example.com" })
    expect(applyCategoryRules(rules, mail)).toBe("social")
  })

  it("skips a rule with enabled: false", () => {
    const rules: AutoClassifyRule[] = [
      makeRule({ id: "r1", field: "from", keyword: "alice", category: "social", enabled: false }),
      makeRule({ id: "r2", field: "from", keyword: "alice", category: "promotions", enabled: true }),
    ]
    const mail = makeMail({ fromName: "Alice", fromEmail: "alice@example.com" })
    expect(applyCategoryRules(rules, mail)).toBe("promotions")
  })

  it("skips a rule without a category even if it matches", () => {
    const rules: AutoClassifyRule[] = [
      makeRule({ id: "r1", field: "from", keyword: "alice", category: null, targetFolderId: "folder-1", enabled: true }),
      makeRule({ id: "r2", field: "from", keyword: "alice", category: "updates", enabled: true }),
    ]
    const mail = makeMail({ fromName: "Alice", fromEmail: "alice@example.com" })
    expect(applyCategoryRules(rules, mail)).toBe("updates")
  })

  it("falls back to the mail's original category when nothing matches", () => {
    const rules: AutoClassifyRule[] = [
      makeRule({ id: "r1", field: "from", keyword: "bob", category: "social", enabled: true }),
    ]
    const mail = makeMail({ fromName: "Alice", fromEmail: "alice@example.com", category: "forums" })
    expect(applyCategoryRules(rules, mail)).toBe("forums")
  })

  it("falls back to the mail's original category when the rule list is empty", () => {
    const mail = makeMail({ category: "primary" })
    expect(applyCategoryRules([], mail)).toBe("primary")
  })
})
