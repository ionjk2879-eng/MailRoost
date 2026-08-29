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
    from: "",
    subject: "",
    excludeFrom: "",
    excludeSubject: "",
    targetFolderId: null,
    category: null,
    enabled: true,
    createdAt: Date.now(),
    ...overrides,
  }
}

describe("matchRule", () => {
  it("matches case-insensitively on from (fromName + fromEmail)", () => {
    const rule = makeRule({ from: "ALICE" })
    const mail = makeMail({ fromName: "Alice", fromEmail: "alice@example.com" })
    expect(matchRule(rule, mail)).toBe(true)
  })

  it("matches on fromEmail even when the keyword isn't in fromName", () => {
    const rule = makeRule({ from: "example.com" })
    const mail = makeMail({ fromName: "Alice", fromEmail: "alice@example.com" })
    expect(matchRule(rule, mail)).toBe(true)
  })

  it("matches case-insensitively on subject", () => {
    const rule = makeRule({ subject: "NEWSLETTER" })
    const mail = makeMail({ subject: "Weekly newsletter" })
    expect(matchRule(rule, mail)).toBe(true)
  })

  it("returns false when subject doesn't contain the keyword", () => {
    const rule = makeRule({ subject: "invoice" })
    const mail = makeMail({ subject: "Weekly newsletter" })
    expect(matchRule(rule, mail)).toBe(false)
  })

  it("does not match a from condition against the subject", () => {
    const rule = makeRule({ from: "newsletter" })
    const mail = makeMail({ subject: "Weekly newsletter", fromName: "Alice", fromEmail: "alice@example.com" })
    expect(matchRule(rule, mail)).toBe(false)
  })

  it("combines from and subject with AND — both must match", () => {
    const rule = makeRule({ from: "alice", subject: "invoice" })
    const matching = makeMail({ fromName: "Alice", fromEmail: "alice@example.com", subject: "Your invoice" })
    const onlyFromMatches = makeMail({ fromName: "Alice", fromEmail: "alice@example.com", subject: "Weekly newsletter" })
    expect(matchRule(rule, matching)).toBe(true)
    expect(matchRule(rule, onlyFromMatches)).toBe(false)
  })

  it("excludeFrom rejects a mail that would otherwise match", () => {
    const rule = makeRule({ subject: "newsletter", excludeFrom: "spam.example" })
    const fromSpam = makeMail({ fromEmail: "x@spam.example", subject: "Weekly newsletter" })
    const fromElsewhere = makeMail({ fromEmail: "x@good.example", subject: "Weekly newsletter" })
    expect(matchRule(rule, fromSpam)).toBe(false)
    expect(matchRule(rule, fromElsewhere)).toBe(true)
  })

  it("excludeSubject rejects a mail that would otherwise match", () => {
    const rule = makeRule({ from: "alice", excludeSubject: "unsubscribe" })
    const unsub = makeMail({ fromEmail: "alice@example.com", subject: "Please unsubscribe" })
    const normal = makeMail({ fromEmail: "alice@example.com", subject: "Hello" })
    expect(matchRule(rule, unsub)).toBe(false)
    expect(matchRule(rule, normal)).toBe(true)
  })

  it("a rule with no conditions at all matches everything (defensive — routes validate this can't be created)", () => {
    const rule = makeRule()
    expect(matchRule(rule, makeMail())).toBe(true)
  })
})

describe("applyCategoryRules", () => {
  it("returns the category of the first matching enabled rule (priority = array order)", () => {
    const rules: AutoClassifyRule[] = [
      makeRule({ id: "r1", from: "alice", category: "social", enabled: true }),
      makeRule({ id: "r2", from: "alice", category: "promotions", enabled: true }),
    ]
    const mail = makeMail({ fromName: "Alice", fromEmail: "alice@example.com" })
    expect(applyCategoryRules(rules, mail)).toBe("social")
  })

  it("skips a rule with enabled: false", () => {
    const rules: AutoClassifyRule[] = [
      makeRule({ id: "r1", from: "alice", category: "social", enabled: false }),
      makeRule({ id: "r2", from: "alice", category: "promotions", enabled: true }),
    ]
    const mail = makeMail({ fromName: "Alice", fromEmail: "alice@example.com" })
    expect(applyCategoryRules(rules, mail)).toBe("promotions")
  })

  it("skips a rule without a category even if it matches", () => {
    const rules: AutoClassifyRule[] = [
      makeRule({ id: "r1", from: "alice", category: null, targetFolderId: "folder-1", enabled: true }),
      makeRule({ id: "r2", from: "alice", category: "updates", enabled: true }),
    ]
    const mail = makeMail({ fromName: "Alice", fromEmail: "alice@example.com" })
    expect(applyCategoryRules(rules, mail)).toBe("updates")
  })

  it("falls back to the mail's original category when nothing matches", () => {
    const rules: AutoClassifyRule[] = [
      makeRule({ id: "r1", from: "bob", category: "social", enabled: true }),
    ]
    const mail = makeMail({ fromName: "Alice", fromEmail: "alice@example.com", category: "forums" })
    expect(applyCategoryRules(rules, mail)).toBe("forums")
  })

  it("falls back to the mail's original category when the rule list is empty", () => {
    const mail = makeMail({ category: "primary" })
    expect(applyCategoryRules([], mail)).toBe("primary")
  })
})
