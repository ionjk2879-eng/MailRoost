import { describe, expect, it } from "vitest"
import type { AutoClassifyRule, MailFolder, MailOrgState } from "../types"
import { emptyMailOrgState } from "./mailOrg"
import { applyMailOrgOp } from "./mailOrgOps"

function makeOrg(overrides: Partial<MailOrgState> = {}): MailOrgState {
  return { ...emptyMailOrgState(), ...overrides }
}

function makeFolder(overrides: Partial<MailFolder> = {}): MailFolder {
  return { id: "folder-1", name: "Folder 1", color: "#111111", createdAt: 1, ...overrides }
}

function makeRule(overrides: Partial<AutoClassifyRule> = {}): AutoClassifyRule {
  return {
    id: "rule-1",
    name: "Rule 1",
    field: "from",
    keyword: "alice",
    targetFolderId: "folder-1",
    category: null,
    enabled: true,
    createdAt: 1,
    ...overrides,
  }
}

describe("folders", () => {
  it("createFolder adds a folder and returns it", () => {
    const org = makeOrg()
    const result = applyMailOrgOp(org, { type: "createFolder", id: "f1", name: "Work", color: "#abcdef", createdAt: 1 }) as
      | { ok: true; folder: MailFolder }
      | { ok: false; error: string }
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.folder).toEqual({ id: "f1", name: "Work", color: "#abcdef", createdAt: 1 })
    expect(org.folders).toHaveLength(1)
  })

  it("createFolder rejects a duplicate name", () => {
    const org = makeOrg({ folders: [makeFolder({ name: "Work" })] })
    const result = applyMailOrgOp(org, { type: "createFolder", id: "f2", name: "Work", color: "#abcdef", createdAt: 2 }) as
      | { ok: true }
      | { ok: false; error: string }
    expect(result.ok).toBe(false)
    expect(org.folders).toHaveLength(1)
  })

  it("renameFolder renames and optionally recolors", () => {
    const org = makeOrg({ folders: [makeFolder({ id: "f1", name: "Old" })] })
    const result = applyMailOrgOp(org, { type: "renameFolder", folderId: "f1", name: "New", color: "#222222" }) as
      | { ok: true; folder: MailFolder }
      | { ok: false }
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.folder.name).toBe("New")
      expect(result.folder.color).toBe("#222222")
    }
  })

  it("renameFolder returns 404 when the folder doesn't exist", () => {
    const org = makeOrg()
    const result = applyMailOrgOp(org, { type: "renameFolder", folderId: "missing", name: "New" }) as
      | { ok: true }
      | { ok: false; status: number; error: string }
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(404)
  })

  it("deleteFolder removes the folder and strips it from assignments", () => {
    const org = makeOrg({
      folders: [makeFolder({ id: "f1" }), makeFolder({ id: "f2" })],
      assignments: { "acct1mail1": ["f1", "f2"], "acct1mail2": ["f1"] },
    })
    applyMailOrgOp(org, { type: "deleteFolder", folderId: "f1" })
    expect(org.folders.map((f) => f.id)).toEqual(["f2"])
    expect(org.assignments["acct1mail1"]).toEqual(["f2"])
    expect(org.assignments["acct1mail2"]).toBeUndefined()
  })
})

describe("rules", () => {
  it("createRule adds a rule when the target folder exists", () => {
    const org = makeOrg({ folders: [makeFolder({ id: "f1" })] })
    const result = applyMailOrgOp(org, {
      type: "createRule",
      id: "r1",
      name: "R1",
      field: "from",
      keyword: "alice",
      targetFolderId: "f1",
      category: null,
      createdAt: 1,
    }) as { ok: true; rule: AutoClassifyRule } | { ok: false; error: string }
    expect(result.ok).toBe(true)
    expect(org.rules).toHaveLength(1)
  })

  it("createRule fails when the target folder doesn't exist", () => {
    const org = makeOrg()
    const result = applyMailOrgOp(org, {
      type: "createRule",
      id: "r1",
      name: "R1",
      field: "from",
      keyword: "alice",
      targetFolderId: "missing",
      category: null,
      createdAt: 1,
    }) as { ok: true } | { ok: false; error: string }
    expect(result.ok).toBe(false)
    expect(org.rules).toHaveLength(0)
  })

  it("updateRule updates only the provided fields", () => {
    const org = makeOrg({ folders: [makeFolder({ id: "f1" })], rules: [makeRule({ id: "r1", keyword: "alice" })] })
    const result = applyMailOrgOp(org, { type: "updateRule", ruleId: "r1", keyword: "bob" }) as
      | { ok: true; rule: AutoClassifyRule }
      | { ok: false }
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.rule.keyword).toBe("bob")
      expect(result.rule.field).toBe("from")
    }
  })

  it("updateRule returns 404 for an unknown rule", () => {
    const org = makeOrg()
    const result = applyMailOrgOp(org, { type: "updateRule", ruleId: "missing", keyword: "bob" }) as
      | { ok: true }
      | { ok: false; status: number; error: string }
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(404)
  })

  it("deleteRule removes the rule", () => {
    const org = makeOrg({ rules: [makeRule({ id: "r1" }), makeRule({ id: "r2" })] })
    applyMailOrgOp(org, { type: "deleteRule", ruleId: "r1" })
    expect(org.rules.map((r) => r.id)).toEqual(["r2"])
  })
})

describe("applyRuleMatches", () => {
  it("assigns new matches and counts already-classified ones", () => {
    const org = makeOrg({
      folders: [makeFolder({ id: "f1" })],
      assignments: { acctmail2: ["f1"] },
    })
    const result = applyMailOrgOp(org, {
      type: "applyRuleMatches",
      targetFolderId: "f1",
      matches: [
        { accountId: "acct", mailId: "mail1" },
        { accountId: "acct", mailId: "mail2" },
      ],
    }) as { count: number; alreadyClassified: number }
    expect(result.count).toBe(1)
    expect(result.alreadyClassified).toBe(1)
    expect(org.assignments["acctmail1"]).toEqual(["f1"])
    expect(org.classified["acctmail1"]).toBe(true)
  })

  it("skips archived mail", () => {
    const org = makeOrg({ folders: [makeFolder({ id: "f1" })], archived: { acctmail1: true } })
    const result = applyMailOrgOp(org, {
      type: "applyRuleMatches",
      targetFolderId: "f1",
      matches: [{ accountId: "acct", mailId: "mail1" }],
    }) as { count: number; alreadyClassified: number }
    expect(result.count).toBe(0)
    expect(org.assignments["acctmail1"]).toBeUndefined()
  })
})

describe("moveMail", () => {
  const items = [{ accountId: "acct", mailId: "mail1" }]

  it("archives when folderId is the archive id", () => {
    const org = makeOrg()
    const result = applyMailOrgOp(org, { type: "moveMail", items, folderId: "archive", fromFolderId: null }) as { ok: true } | { ok: false }
    expect(result.ok).toBe(true)
    expect(org.archived["acctmail1"]).toBe(true)
  })

  it("assigns a custom folder", () => {
    const org = makeOrg({ folders: [makeFolder({ id: "f1" })] })
    const result = applyMailOrgOp(org, { type: "moveMail", items, folderId: "f1", fromFolderId: null }) as { ok: true } | { ok: false; error: string }
    expect(result.ok).toBe(true)
    expect(org.assignments["acctmail1"]).toEqual(["f1"])
  })

  it("fails when the target folder doesn't exist", () => {
    const org = makeOrg()
    const result = applyMailOrgOp(org, { type: "moveMail", items, folderId: "missing", fromFolderId: null }) as
      | { ok: true }
      | { ok: false; error: string }
    expect(result.ok).toBe(false)
  })

  it("un-assigns from a specific folder when moving back to inbox with fromFolderId", () => {
    const org = makeOrg({ folders: [makeFolder({ id: "f1" })], assignments: { acctmail1: ["f1"] } })
    const result = applyMailOrgOp(org, { type: "moveMail", items, folderId: null, fromFolderId: "f1" }) as { ok: true } | { ok: false }
    expect(result.ok).toBe(true)
    expect(org.assignments["acctmail1"]).toBeUndefined()
  })

  it("unarchives when moving back to inbox with fromFolderId 'archive'", () => {
    const org = makeOrg({ archived: { acctmail1: true } })
    applyMailOrgOp(org, { type: "moveMail", items, folderId: null, fromFolderId: "archive" })
    expect(org.archived["acctmail1"]).toBeUndefined()
  })

  it("clears both archived and assignments when moving to inbox with no fromFolderId context", () => {
    const org = makeOrg({ folders: [makeFolder({ id: "f1" })], assignments: { acctmail1: ["f1"] }, archived: { acctmail1: true } })
    applyMailOrgOp(org, { type: "moveMail", items, folderId: null, fromFolderId: null })
    expect(org.assignments["acctmail1"]).toBeUndefined()
    expect(org.archived["acctmail1"]).toBeUndefined()
  })
})

describe("toggleMailFolder", () => {
  it("assigns and unassigns a folder for a single mail", () => {
    const org = makeOrg({ folders: [makeFolder({ id: "f1" })] })
    const assignResult = applyMailOrgOp(org, { type: "toggleMailFolder", accountId: "acct", mailId: "mail1", folderId: "f1", assign: true }) as
      | { ok: true }
      | { ok: false }
    expect(assignResult.ok).toBe(true)
    expect(org.assignments["acctmail1"]).toEqual(["f1"])

    applyMailOrgOp(org, { type: "toggleMailFolder", accountId: "acct", mailId: "mail1", folderId: "f1", assign: false })
    expect(org.assignments["acctmail1"]).toBeUndefined()
  })

  it("fails when the folder doesn't exist", () => {
    const org = makeOrg()
    const result = applyMailOrgOp(org, { type: "toggleMailFolder", accountId: "acct", mailId: "mail1", folderId: "missing", assign: true }) as
      | { ok: true }
      | { ok: false; error: string }
    expect(result.ok).toBe(false)
  })
})

describe("snoozeMail / unsnooze", () => {
  it("round-trips a snooze", () => {
    const org = makeOrg()
    applyMailOrgOp(org, { type: "snoozeMail", accountId: "acct", mailId: "mail1", until: 1000 })
    expect(org.snoozed["acctmail1"]).toBe(1000)

    applyMailOrgOp(org, { type: "unsnooze", accountId: "acct", mailId: "mail1" })
    expect(org.snoozed["acctmail1"]).toBeUndefined()
  })

  it("pruneExpiredSnoozes removes only expired entries", () => {
    const org = makeOrg({ snoozed: { a: 100, b: 5000 } })
    const result = applyMailOrgOp(org, { type: "pruneExpiredSnoozes", now: 1000 }) as Record<string, number>
    expect(result).toEqual({ b: 5000 })
    expect(org.snoozed).toEqual({ b: 5000 })
  })
})

describe("classifyMails", () => {
  it("classifies a new mail against an enabled rule and marks it classified", () => {
    const org = makeOrg({
      folders: [makeFolder({ id: "f1" })],
      rules: [makeRule({ targetFolderId: "f1", enabled: true, field: "from", keyword: "alice" })],
    })
    const result = applyMailOrgOp(org, {
      type: "classifyMails",
      items: [{ accountId: "acct", mailId: "mail1", fromName: "Alice", fromEmail: "alice@example.com", subject: "Hi", category: "primary" }],
    }) as { archived: boolean; folderIds: string[]; category: string }[]

    expect(result[0].folderIds).toEqual(["f1"])
    expect(org.classified["acctmail1"]).toBe(true)
  })

  it("does not re-classify a mail already marked classified", () => {
    const org = makeOrg({
      folders: [makeFolder({ id: "f1" })],
      rules: [makeRule({ targetFolderId: "f1", enabled: true })],
      classified: { acctmail1: true },
    })
    const result = applyMailOrgOp(org, {
      type: "classifyMails",
      items: [{ accountId: "acct", mailId: "mail1", fromName: "Alice", fromEmail: "alice@example.com", subject: "Hi", category: "primary" }],
    }) as { archived: boolean; folderIds: string[]; category: string }[]

    expect(result[0].folderIds).toEqual([])
    expect(org.assignments["acctmail1"]).toBeUndefined()
  })
})

describe("clearMailKeys", () => {
  it("clears assignments/archived/snoozed/classified for the given mail ids", () => {
    const org = makeOrg({
      assignments: { acctmail1: ["f1"] },
      archived: { acctmail1: true },
      snoozed: { acctmail1: 1000 },
      classified: { acctmail1: true },
    })
    applyMailOrgOp(org, { type: "clearMailKeys", accountId: "acct", mailIds: ["mail1"] })
    expect(org.assignments["acctmail1"]).toBeUndefined()
    expect(org.archived["acctmail1"]).toBeUndefined()
    expect(org.snoozed["acctmail1"]).toBeUndefined()
    expect(org.classified["acctmail1"]).toBeUndefined()
  })
})

describe("muteSender / unmuteSender", () => {
  it("round-trips muting a sender", () => {
    const org = makeOrg()
    applyMailOrgOp(org, { type: "muteSender", email: "spam@example.com" })
    expect(org.muted).toEqual(["spam@example.com"])

    applyMailOrgOp(org, { type: "muteSender", email: "spam@example.com" })
    expect(org.muted).toEqual(["spam@example.com"])

    applyMailOrgOp(org, { type: "unmuteSender", email: "spam@example.com" })
    expect(org.muted).toEqual([])
  })
})

describe("createSavedFilter / deleteSavedFilter", () => {
  it("creates a filter and rejects an unknown folderId", () => {
    const org = makeOrg()
    const badResult = applyMailOrgOp(org, {
      type: "createSavedFilter",
      id: "sf1",
      name: "Filter",
      accountId: null,
      from: "",
      subject: "",
      isUnread: null,
      isStarred: null,
      hasAttachment: null,
      folderId: "missing",
      createdAt: 1,
    }) as { ok: true } | { ok: false; error: string }
    expect(badResult.ok).toBe(false)

    const goodResult = applyMailOrgOp(org, {
      type: "createSavedFilter",
      id: "sf1",
      name: "Filter",
      accountId: null,
      from: "",
      subject: "",
      isUnread: null,
      isStarred: null,
      hasAttachment: null,
      folderId: null,
      createdAt: 1,
    }) as { ok: true; filter: { id: string } } | { ok: false }
    expect(goodResult.ok).toBe(true)
    expect(org.savedFilters).toHaveLength(1)
  })

  it("deletes a filter", () => {
    const org = makeOrg()
    applyMailOrgOp(org, {
      type: "createSavedFilter",
      id: "sf1",
      name: "Filter",
      accountId: null,
      from: "",
      subject: "",
      isUnread: null,
      isStarred: null,
      hasAttachment: null,
      folderId: null,
      createdAt: 1,
    })
    applyMailOrgOp(org, { type: "deleteSavedFilter", filterId: "sf1" })
    expect(org.savedFilters).toHaveLength(0)
  })
})
