# 스레드 뷰 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gmail + 네이버/다음/범용 IMAP 계정 전부에서 답장 체인을 하나의 대화(스레드)로 묶어서 리스트/상세 패널에 보여준다.

**Architecture:** 백엔드는 각 provider의 스레딩 원본 헤더(Gmail `threadId`, IMAP `Message-ID`/`References`/`In-Reply-To`)만 `Mail`에 실어보내고, 그룹핑 계산은 프런트가 이미 로드된 `allMails` 위에서 순수 함수로 한다 (백엔드 API 변경 없이 기존 bulk 액션 엔드포인트를 그대로 재사용). 상세 패널은 `MessageCard`(메일 한 통) + `MailDetail`(스레드 전체를 아코디언으로 감싸는 얇은 래퍼)로 나눈다.

**Tech Stack:** Cloudflare Workers + Hono (backend), React 19 + Vite (frontend), Vitest (unit tests, 백엔드는 이미 사용 중 / 프런트엔드는 이번에 신설)

**Spec:** `docs/superpowers/specs/2026-08-29-thread-view-design.md`

## Global Constraints

- 계정을 넘나드는 스레드 병합 금지 (accountId가 다르면 절대 같은 그룹에 안 들어감)
- 제목 기반 fallback 그룹핑 금지 (헤더 매칭 실패 시 단독 스레드로 둔다)
- 검색 결과는 그룹핑하지 않는다 (개별 메일로 표시)
- 안읽음 카운트는 메일 단위 그대로 유지 (스레드 단위로 바꾸지 않는다)
- 기존 bulk 액션 API(`/api/mail/bulk-*` 등)는 변경하지 않는다 — 프런트에서 그룹을 개별 mail id로 펼쳐서 그대로 호출

---

## Task 1: Gmail threadId

**Files:**
- Modify: `backend/src/types.ts` (`Mail` 인터페이스)
- Modify: `backend/src/lib/gmail.ts:151-209`
- Create: `backend/src/lib/gmail.test.ts`

**Interfaces:**
- Produces: `Mail.threadId?: string`, `Mail.messageId?: string`, `Mail.references?: string[]`, `Mail.inReplyTo?: string` (뒤 3개는 Task 2가 채움, 여기서는 타입만 같이 추가), `export interface GmailMessage`, `export function mapMessageToMail(msg: GmailMessage, accountId: string): Mail`

- [ ] **Step 1: `Mail` 타입에 스레딩 필드 추가**

`backend/src/types.ts`에서 `folderIds?: string[]` 다음 줄에 추가:

```ts
  // 스레드 그룹핑용 — Gmail은 threadId만, IMAP(네이버/다음/범용)은 messageId/references/inReplyTo만 채워진다.
  threadId?: string
  messageId?: string
  references?: string[]
  inReplyTo?: string
```

- [ ] **Step 2: 실패하는 테스트 작성**

`backend/src/lib/gmail.test.ts` 신설:

```ts
import { describe, expect, it } from "vitest"
import { mapMessageToMail, type GmailMessage } from "./gmail"

describe("mapMessageToMail", () => {
  it("maps threadId from the Gmail message", () => {
    const msg: GmailMessage = {
      id: "m1",
      threadId: "t1",
      snippet: "hello",
      internalDate: "1700000000000",
      labelIds: ["INBOX"],
      payload: {
        headers: [
          { name: "From", value: "Alice <alice@example.com>" },
          { name: "Subject", value: "Hi" },
        ],
      },
    }
    const mail = mapMessageToMail(msg, "gmail:me@example.com")
    expect(mail.threadId).toBe("t1")
  })

  it("keeps threadId undefined when the API response omits it", () => {
    const msg: GmailMessage = {
      id: "m2",
      snippet: "",
      labelIds: [],
      payload: { headers: [] },
    }
    const mail = mapMessageToMail(msg, "gmail:me@example.com")
    expect(mail.threadId).toBeUndefined()
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

Run (backend 디렉터리에서): `npx vitest run src/lib/gmail.test.ts`
Expected: FAIL — `mapMessageToMail`/`GmailMessage`가 export되지 않아 타입/임포트 에러

- [ ] **Step 4: `GmailMessage`에 `threadId` 추가하고 export, `mapMessageToMail` export + 매핑 추가**

`backend/src/lib/gmail.ts:164-170`을 다음으로 교체:

```ts
export interface GmailMessage {
  id: string
  threadId?: string
  snippet?: string
  internalDate?: string
  labelIds?: string[]
  payload?: { headers?: GmailHeader[] } & GmailMessagePart
}
```

`backend/src/lib/gmail.ts:192` (`function mapMessageToMail(msg: GmailMessage, accountId: string): Mail {`)를:

```ts
export function mapMessageToMail(msg: GmailMessage, accountId: string): Mail {
```

그리고 같은 함수 안, `return { id: msg.id, ... }` 객체 리터럴의 `isStarred: labelIds.includes("STARRED"),` 다음 줄에 추가:

```ts
    threadId: msg.threadId,
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/lib/gmail.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: 전체 백엔드 테스트 + 타입체크**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 전부 PASS, 타입 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add backend/src/types.ts backend/src/lib/gmail.ts backend/src/lib/gmail.test.ts
git commit -m "feat: expose Gmail threadId on Mail for thread grouping"
```

---

## Task 2: IMAP 스레딩 헤더 (Message-ID / References / In-Reply-To)

**Files:**
- Create: `backend/src/lib/imap-parse.ts` (기존 `imap.ts`의 파싱 전용 함수 추출 + 확장)
- Create: `backend/src/lib/imap-parse.test.ts`
- Modify: `backend/src/lib/imap.ts` (추출한 함수를 import로 교체, FETCH 명령 헤더 필드 확장)

**Interfaces:**
- Consumes: `Mail` 타입에 이미 있는 `messageId?`, `references?`, `inReplyTo?` (Task 1에서 추가됨)
- Produces: `export interface ParsedFetchLine`, `export function parseFetchLine(line: string): ParsedFetchLine | null`, `export function parseInternalDate(raw: string | undefined): string`, `export function mapFetchLinesToMails(lines: string[], accountId: string): Mail[]`

`imap.ts`가 지금 `cloudflare:sockets`를 모듈 최상단에서 import해서, 순수 파싱 로직까지 같은 파일에 있으면 plain vitest(node 환경)로 직접 테스트할 수 없다 (`Cannot find package 'cloudflare:sockets'`로 즉시 실패 — 확인됨). 파싱 로직을 소켓 의존성이 없는 별도 파일로 뽑아내는 게 이 문제를 근본적으로 해결한다.

- [ ] **Step 1: 실패하는 테스트부터 작성**

`backend/src/lib/imap-parse.test.ts` 신설 (아직 `imap-parse.ts`가 없으므로 import가 실패하는 게 정상):

```ts
import { describe, expect, it } from "vitest"
import { mapFetchLinesToMails } from "./imap-parse"

function fetchLine(opts: {
  seq?: number
  uid: number
  flags?: string
  date?: string
  from: string
  subject: string
  messageId?: string
  references?: string
  inReplyTo?: string
}): string {
  const headerLines = [
    `From: ${opts.from}`,
    `Subject: ${opts.subject}`,
    ...(opts.messageId ? [`Message-ID: ${opts.messageId}`] : []),
    ...(opts.references ? [`References: ${opts.references}`] : []),
    ...(opts.inReplyTo ? [`In-Reply-To: ${opts.inReplyTo}`] : []),
  ]
  const literal = headerLines.join("\r\n") + "\r\n\r\n"
  return (
    `* ${opts.seq ?? 1} FETCH (UID ${opts.uid} FLAGS (${opts.flags ?? "\\Seen"}) ` +
    `INTERNALDATE "01-Jan-2026 10:00:00 +0000" ` +
    `BODY[HEADER.FIELDS (FROM SUBJECT MESSAGE-ID REFERENCES IN-REPLY-TO)] {${literal.length}}\r\n${literal})`
  )
}

describe("mapFetchLinesToMails", () => {
  it("extracts messageId, references and inReplyTo when present", () => {
    const line = fetchLine({
      uid: 101,
      from: "Alice <alice@example.com>",
      subject: "Re: Hi",
      messageId: "<msg2@mail.example>",
      references: "<msg1@mail.example>",
      inReplyTo: "<msg1@mail.example>",
    })
    const [mail] = mapFetchLinesToMails([line], "naver:me@naver.com")
    expect(mail.messageId).toBe("msg2@mail.example")
    expect(mail.references).toEqual(["msg1@mail.example"])
    expect(mail.inReplyTo).toBe("msg1@mail.example")
  })

  it("splits a multi-id References header into an array, stripping angle brackets", () => {
    const line = fetchLine({
      uid: 102,
      from: "Bob <bob@example.com>",
      subject: "Re: Hi",
      messageId: "<msg3@mail.example>",
      references: "<msg1@mail.example> <msg2@mail.example>",
    })
    const [mail] = mapFetchLinesToMails([line], "naver:me@naver.com")
    expect(mail.references).toEqual(["msg1@mail.example", "msg2@mail.example"])
  })

  it("leaves the fields undefined when the headers are absent", () => {
    const line = fetchLine({ uid: 103, from: "Carol <carol@example.com>", subject: "No thread info" })
    const [mail] = mapFetchLinesToMails([line], "naver:me@naver.com")
    expect(mail.messageId).toBeUndefined()
    expect(mail.references).toBeUndefined()
    expect(mail.inReplyTo).toBeUndefined()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/imap-parse.test.ts`
Expected: FAIL — `Cannot find module './imap-parse'`

- [ ] **Step 3: `imap-parse.ts` 신설 — 기존 파싱 함수를 옮기고 헤더 3개 추가**

`backend/src/lib/imap.ts:210-249`(`ParsedFetchLine` 인터페이스부터 `parseHeaderFields`까지)와 `backend/src/lib/imap.ts:368-394`(`mapFetchLinesToMails`)의 내용을 그대로 가져와 아래처럼 새 파일을 만든다:

```ts
import type { Mail } from "../types"
import { decodeRfc2047, parseFromHeader, parseHeaderBlock } from "./mime"

export interface ParsedFetchLine {
  uid?: number
  flags: string[]
  internalDate?: string
  literalText?: string
}

export function parseFetchLine(line: string): ParsedFetchLine | null {
  if (!/^\*\s+\d+\s+FETCH/i.test(line)) return null
  const uidMatch = line.match(/\bUID\s+(\d+)/i)
  const flagsMatch = line.match(/FLAGS\s*\(([^)]*)\)/i)
  const dateMatch = line.match(/INTERNALDATE\s+"([^"]+)"/i)
  const literalMatch = line.match(/BODY\[[^\]]*\]\s*([\s\S]*)\)\s*$/i)
  return {
    uid: uidMatch ? Number(uidMatch[1]) : undefined,
    flags: flagsMatch ? flagsMatch[1].split(/\s+/).filter(Boolean) : [],
    internalDate: dateMatch?.[1],
    literalText: literalMatch?.[1],
  }
}

const MONTH_NUMBERS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
}

export function parseInternalDate(raw: string | undefined): string {
  const match = raw?.match(/^(\d{1,2})-(\w{3})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+([+-]\d{4})$/)
  if (!match) return new Date().toISOString()
  const [, day, monthName, year, hh, mm, ss, tz] = match
  const month = MONTH_NUMBERS[monthName] ?? "01"
  const isoLike = `${year}-${month}-${day.padStart(2, "0")}T${hh}:${mm}:${ss}${tz.slice(0, 3)}:${tz.slice(3)}`
  const date = new Date(isoLike)
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

// References/Message-ID/In-Reply-To 헤더는 <local@domain> 형식 — 꺾쇠괄호를 벗겨서 순수 id로 맞춘다.
function stripAngleBrackets(id: string): string {
  return id.replace(/^<|>$/g, "")
}

function parseHeaderFields(text: string | undefined): {
  from: string
  subject: string
  messageId: string
  references: string[]
  inReplyTo: string
} {
  const headers = parseHeaderBlock(text ?? "")
  const references = (headers["references"] ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map(stripAngleBrackets)
  return {
    from: headers["from"] ?? "",
    subject: headers["subject"] ?? "",
    messageId: headers["message-id"] ? stripAngleBrackets(headers["message-id"]) : "",
    references,
    inReplyTo: headers["in-reply-to"] ? stripAngleBrackets(headers["in-reply-to"]) : "",
  }
}

export function mapFetchLinesToMails(lines: string[], accountId: string): Mail[] {
  const mails: Mail[] = []
  for (const line of lines) {
    if (!/^\*\s+\d+\s+FETCH/i.test(line)) continue
    const parsed = parseFetchLine(line)
    if (!parsed || parsed.uid === undefined) {
      console.error(`[imap] failed to parse FETCH line, skipping message: ${line.slice(0, 300)}`)
      continue
    }
    const { from, subject, messageId, references, inReplyTo } = parseHeaderFields(parsed.literalText)
    const { name: fromName, email: fromEmail } = parseFromHeader(from)
    mails.push({
      id: String(parsed.uid),
      accountId,
      fromName,
      fromEmail,
      subject: decodeRfc2047(subject) || "(제목 없음)",
      snippet: "",
      body: "",
      category: "primary",
      receivedAt: parseInternalDate(parsed.internalDate),
      isRead: parsed.flags.includes("\\Seen"),
      isStarred: parsed.flags.includes("\\Flagged"),
      messageId: messageId || undefined,
      references: references.length > 0 ? references : undefined,
      inReplyTo: inReplyTo || undefined,
    })
  }
  return mails
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/imap-parse.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: `imap.ts`가 새 모듈을 쓰도록 교체**

`backend/src/lib/imap.ts:210-249`(`ParsedFetchLine` 인터페이스 ~ `parseHeaderFields` 함수 전체)와 `backend/src/lib/imap.ts:368-394`(`mapFetchLinesToMails` 함수 전체)를 **삭제**한다.

`backend/src/lib/imap.ts:3`의 import를:

```ts
import { decodeRfc2047, embedInlineMimeImages, extractMimeAttachment, listMimeAttachments, parseAddressList, parseFromHeader, parseHeaderBlock, parseMimeMessage, sanitizeHtml, stripHtml } from "./mime"
```

로 유지하되(이 파일은 `parseHeaderBlock`/`parseFromHeader`/`decodeRfc2047`을 `imapGetMailDetail` 등 다른 곳에서 여전히 직접 쓰므로 그대로 둔다), 바로 아래 줄에 추가:

```ts
import { mapFetchLinesToMails, parseFetchLine, parseInternalDate } from "./imap-parse"
```

- [ ] **Step 6: FETCH 명령의 헤더 필드 확장 (3곳)**

`backend/src/lib/imap.ts`에서 `HEADER.FIELDS (FROM SUBJECT)`가 나오는 3곳을 전부 `HEADER.FIELDS (FROM SUBJECT MESSAGE-ID REFERENCES IN-REPLY-TO)`로 바꾼다:

1. `fetchMailPageFromSelected` 안 (원래 line ~350):
```ts
  const fetchResult = await client.command(
    `FETCH ${start}:${end} (UID FLAGS INTERNALDATE BODY.PEEK[HEADER.FIELDS (FROM SUBJECT MESSAGE-ID REFERENCES IN-REPLY-TO)])`,
  )
```

2. `imapSearchInbox` 안 (원래 line ~445):
```ts
    const fetchResult = await client.command(
      `UID FETCH ${targetUids.join(",")} (UID FLAGS INTERNALDATE BODY.PEEK[HEADER.FIELDS (FROM SUBJECT MESSAGE-ID REFERENCES IN-REPLY-TO)])`,
    )
```

3. `imapFetchByUids` 안 (원래 line ~476):
```ts
    const fetchResult = await client.command(
      `UID FETCH ${uids.join(",")} (UID FLAGS INTERNALDATE BODY.PEEK[HEADER.FIELDS (FROM SUBJECT MESSAGE-ID REFERENCES IN-REPLY-TO)])`,
    )
```

- [ ] **Step 7: 타입체크 + 전체 테스트**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 타입 에러 없음, 모든 테스트 PASS (`imap-parse.test.ts` 3개 포함 새 파일들 전부)

- [ ] **Step 8: 커밋**

```bash
git add backend/src/lib/imap-parse.ts backend/src/lib/imap-parse.test.ts backend/src/lib/imap.ts
git commit -m "refactor: extract IMAP FETCH parsing into imap-parse.ts and read threading headers"
```

---

## Task 3: 프런트엔드 vitest 설정 + 스레드 그룹핑 알고리즘

**Files:**
- Modify: `frontend/package.json` (devDependency + script)
- Create: `frontend/vitest.config.ts`
- Modify: `frontend/src/types/mail.ts` (`Mail` 인터페이스)
- Create: `frontend/src/lib/threading.ts`
- Create: `frontend/src/lib/threading.test.ts`

**Interfaces:**
- Produces: `export function groupIntoThreads(mails: Mail[]): Mail[][]`

프런트엔드엔 지금 vitest가 전혀 없다 (테스트 파일 0개, devDependency에도 없음). `groupIntoThreads`는 union-find로 엣지케이스가 많은 순수 함수라 유닛테스트 가치가 커서, 이 작업의 첫 단계로 최소 설정만 추가한다 (jsdom/컴포넌트 테스트 도구는 이번 범위에 없음 — 순수 함수 테스트에는 필요 없다).

- [ ] **Step 1: vitest devDependency + 스크립트 추가**

`frontend/package.json`의 `"scripts"`에 추가:

```json
    "test": "vitest run",
```

`"devDependencies"`에 추가:

```json
    "vitest": "^4.1.10",
```

Run (frontend 디렉터리에서): `npm install`

- [ ] **Step 2: vitest 설정 파일 생성**

`frontend/vitest.config.ts` 신설:

```ts
import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: { environment: "node" },
})
```

- [ ] **Step 3: `Mail` 타입에 스레딩 필드 추가**

`frontend/src/types/mail.ts`의 `folderIds?: string[]` 다음 줄에 추가 (백엔드 `Mail`과 동일한 필드):

```ts
  threadId?: string
  messageId?: string
  references?: string[]
  inReplyTo?: string
```

- [ ] **Step 4: 실패하는 테스트 작성**

`frontend/src/lib/threading.test.ts` 신설:

```ts
import { describe, expect, it } from "vitest"
import { groupIntoThreads } from "./threading"
import type { Mail } from "@/types/mail"

function makeMail(overrides: Partial<Mail> & { id: string; accountId: string }): Mail {
  return {
    fromName: "Sender",
    fromEmail: "sender@example.com",
    subject: "Subject",
    snippet: "",
    body: "",
    category: "primary",
    receivedAt: "2026-01-01T00:00:00.000Z",
    isRead: true,
    isStarred: false,
    ...overrides,
  }
}

describe("groupIntoThreads", () => {
  it("groups Gmail mails sharing accountId + threadId", () => {
    const a = makeMail({ id: "1", accountId: "gmail:me", threadId: "t1", receivedAt: "2026-01-01T00:00:00.000Z" })
    const b = makeMail({ id: "2", accountId: "gmail:me", threadId: "t1", receivedAt: "2026-01-02T00:00:00.000Z" })
    const c = makeMail({ id: "3", accountId: "gmail:me", threadId: "t2", receivedAt: "2026-01-01T00:00:00.000Z" })

    const groups = groupIntoThreads([a, b, c])

    expect(groups).toHaveLength(2)
    const grouped = groups.find((g) => g.length === 2)!
    expect(grouped.map((m) => m.id)).toEqual(["1", "2"]) // 오래된 것 → 최신 순
  })

  it("does not merge the same Gmail threadId across different accounts", () => {
    const a = makeMail({ id: "1", accountId: "gmail:work", threadId: "t1" })
    const b = makeMail({ id: "2", accountId: "gmail:personal", threadId: "t1" })

    const groups = groupIntoThreads([a, b])

    expect(groups).toHaveLength(2)
  })

  it("chains IMAP mails via messageId/references within one account", () => {
    const original = makeMail({
      id: "1", accountId: "naver:me", messageId: "m1",
      receivedAt: "2026-01-01T00:00:00.000Z",
    })
    const reply = makeMail({
      id: "2", accountId: "naver:me", messageId: "m2", references: ["m1"], inReplyTo: "m1",
      receivedAt: "2026-01-02T00:00:00.000Z",
    })
    const replyToReply = makeMail({
      id: "3", accountId: "naver:me", messageId: "m3", references: ["m1", "m2"], inReplyTo: "m2",
      receivedAt: "2026-01-03T00:00:00.000Z",
    })

    const groups = groupIntoThreads([reply, original, replyToReply])

    expect(groups).toHaveLength(1)
    expect(groups[0].map((m) => m.id)).toEqual(["1", "2", "3"])
  })

  it("does not merge IMAP references across different accounts", () => {
    const a = makeMail({ id: "1", accountId: "naver:me", messageId: "m1" })
    const b = makeMail({ id: "2", accountId: "daum:me", messageId: "m2", references: ["m1"], inReplyTo: "m1" })

    const groups = groupIntoThreads([a, b])

    expect(groups).toHaveLength(2)
  })

  it("keeps mails with no thread headers as solo threads", () => {
    const a = makeMail({ id: "1", accountId: "naver:me" })
    const b = makeMail({ id: "2", accountId: "naver:me" })

    const groups = groupIntoThreads([a, b])

    expect(groups).toHaveLength(2)
  })

  it("does not group by matching subject alone", () => {
    const a = makeMail({ id: "1", accountId: "naver:me", subject: "Newsletter" })
    const b = makeMail({ id: "2", accountId: "naver:me", subject: "Newsletter" })

    const groups = groupIntoThreads([a, b])

    expect(groups).toHaveLength(2)
  })
})
```

- [ ] **Step 5: 테스트 실패 확인**

Run: `npx vitest run src/lib/threading.test.ts`
Expected: FAIL — `Cannot find module './threading'`

- [ ] **Step 6: `groupIntoThreads` 구현**

`frontend/src/lib/threading.ts` 신설:

```ts
import type { Mail } from "@/types/mail"

// Union-Find (경로 압축만 — 이 규모의 메일함에선 랭크까지 필요 없다)
class DisjointSet {
  private parent = new Map<string, string>()

  private find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x)
    const p = this.parent.get(x)!
    if (p === x) return x
    const root = this.find(p)
    this.parent.set(x, root)
    return root
  }

  union(a: string, b: string): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent.set(ra, rb)
  }

  groupOf(x: string): string {
    return this.find(x)
  }
}

// Gmail은 accountId+threadId로, IMAP은 계정 안에서 messageId/references/inReplyTo 체인으로 묶는다.
// 계정 경계는 절대 넘지 않는다 — accountId를 모든 노드 키에 접두어로 넣어 강제한다.
export function groupIntoThreads(mails: Mail[]): Mail[][] {
  const ds = new DisjointSet()
  const nodeKeyOf = (mail: Mail): string => {
    if (mail.threadId) return `${mail.accountId} thread:${mail.threadId}`
    if (mail.messageId) return `${mail.accountId} msg:${mail.messageId}`
    return `${mail.accountId} mail:${mail.id}`
  }

  for (const mail of mails) {
    const key = nodeKeyOf(mail)
    ds.groupOf(key) // 노드를 등록해둔다 (union 호출이 없는 단독 메일도 그룹이 생기도록)

    if (!mail.messageId) continue
    const refs = [...(mail.references ?? []), ...(mail.inReplyTo ? [mail.inReplyTo] : [])]
    for (const ref of refs) {
      const refKey = `${mail.accountId} msg:${ref}`
      ds.union(key, refKey)
    }
  }

  const byRoot = new Map<string, Mail[]>()
  for (const mail of mails) {
    const root = ds.groupOf(nodeKeyOf(mail))
    const group = byRoot.get(root)
    if (group) group.push(mail)
    else byRoot.set(root, [mail])
  }

  return [...byRoot.values()].map((group) =>
    [...group].sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()),
  )
}
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `npx vitest run src/lib/threading.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 8: 타입체크 + 빌드**

Run: `npx tsc -b && npm run build`
Expected: 에러 없음

- [ ] **Step 9: 커밋**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.ts frontend/src/types/mail.ts frontend/src/lib/threading.ts frontend/src/lib/threading.test.ts
git commit -m "feat: add frontend vitest + thread grouping algorithm"
```

---

## Task 4: MailList — 스레드 단위 렌더링

**Files:**
- Modify: `frontend/src/components/mail/mail-list.tsx`

**Interfaces:**
- Consumes: `groupIntoThreads(mails: Mail[]): Mail[][]` (Task 3)

기존 `checkedIds`/`onToggleCheck`/`onCheckRange`/`onSelectMail` prop 타입은 전혀 안 바뀐다 — 그룹 단위 체크/선택은 이미 있는 단일-id 콜백을 여러 번 호출하는 식으로 컴포넌트 내부에서만 처리한다.

- [ ] **Step 1: `groupThreads` prop 추가 + import**

`frontend/src/components/mail/mail-list.tsx:1-8`의 import 블록에 추가:

```ts
import { groupIntoThreads } from "@/lib/threading"
```

`MailListProps` 인터페이스(`interface MailListProps { ... }`)에 추가 (마지막 필드 `onLoadMore?: () => void` 다음 줄):

```ts
  // 답장 체인을 하나의 대화로 묶어서 보여줄지. 검색 결과 화면에서는 false로 넘어온다.
  groupThreads?: boolean
```

- [ ] **Step 2: 컴포넌트 시그니처에 기본값 추가 + 그룹 계산**

`export function MailList({ ... }: MailListProps) {`의 destructure에 추가:

```ts
  groupThreads = true,
```

컴포넌트 본문 최상단(`const [filterOpen, setFilterOpen] = useState(false)` 앞)에 추가:

```ts
  const groups = groupThreads ? groupIntoThreads(mails) : mails.map((mail) => [mail])
```

- [ ] **Step 3: 전체선택/부분선택 판정을 그룹 기준으로**

`const allChecked = mails.length > 0 && mails.every((m) => checkedIds.has(m.id))`를 아래로 교체 (모든 메일이 체크되어 있어야 전체선택 — 의미는 그대로, `mails` 대신 그대로 `mails` 써도 되지만 그룹 렌더링과 일관되게 유지):

이 줄은 그대로 둔다 (`mails` 기준 전체선택 판정은 그룹핑 여부와 무관하게 정확하다 — 변경 없음).

- [ ] **Step 4: 렌더링 루프를 그룹 단위로 교체**

`{mails.map((mail, index) => {` (원래 line ~278)부터 그 블록이 끝나는 `})}` (원래 line ~397, `{hasMore && (` 바로 앞)까지 전체를 아래로 교체:

```tsx
          {groups.length === 0 && (
            <p className="text-muted-foreground p-6 text-sm">메일이 없습니다.</p>
          )}
          {groups.map((group, index) => {
            const mail = group[group.length - 1] // 그룹 대표 = 최신 메일
            const groupIds = group.map((m) => m.id)
            const isChecked = groupIds.every((id) => checkedIds.has(id))

            // shift 범위선택이면 true를 반환해 호출부가 별도 처리를 건너뛰게 한다.
            const trySelectRange = (e: React.MouseEvent): boolean => {
              if (!e.shiftKey || !anchorId) return false
              const anchorIndex = groups.findIndex((g) => g[g.length - 1].id === anchorId)
              if (anchorIndex === -1) return false
              const [start, end] = anchorIndex < index ? [anchorIndex, index] : [index, anchorIndex]
              onCheckRange(groups.slice(start, end + 1).flatMap((g) => g.map((m) => m.id)))
              setAnchorId(mail.id)
              return true
            }

            // 그룹 체크박스는 항상 "전부 켜기" 또는 "전부 끄기"로 귀결되도록, 목표 상태와 다른
            // 멤버만 골라 기존 단일-id 토글을 호출한다 (그룹 전용 콜백을 새로 추가하지 않는다).
            const toggleGroup = () => {
              const target = !isChecked
              for (const id of groupIds) {
                if (checkedIds.has(id) !== target) onToggleCheck(id)
              }
            }

            const handleRowClick = (e: React.MouseEvent) => {
              if (trySelectRange(e)) return
              if (e.ctrlKey || e.metaKey) {
                toggleGroup()
                setAnchorId(mail.id)
                return
              }
              if (isSelecting) {
                toggleGroup()
              } else {
                onSelectMail(mail.id)
              }
              setAnchorId(mail.id)
            }

            return (
              <button
                key={mail.id}
                id={`mail-row-${mail.id}`}
                type="button"
                onMouseDown={(e) => {
                  if (e.shiftKey) e.preventDefault()
                }}
                onClick={handleRowClick}
                className={cn(
                  "group flex w-full min-w-0 flex-col items-start gap-1.5 border-b border-l-2 border-l-transparent px-4 py-3.5 text-left text-sm outline-none transition-colors",
                  "hover:bg-muted/60",
                  !mail.isRead && "border-l-primary bg-primary/[0.035]",
                  !isSelecting && selectedMailId === mail.id && "border-l-primary bg-primary/[0.09]",
                  isChecked && "bg-primary/5",
                  focusedMailId === mail.id && "ring-primary/50 ring-2 ring-inset",
                )}
              >
                <div className="flex w-full min-w-0 items-center gap-2.5">
                  <div className="relative flex size-4 shrink-0 items-center justify-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (trySelectRange(e)) return
                        toggleGroup()
                        setAnchorId(mail.id)
                      }}
                      aria-label={isChecked ? "선택 해제" : "선택"}
                      className={cn(
                        "border-input bg-background absolute inset-0 flex items-center justify-center rounded-sm border transition-opacity",
                        isChecked
                          ? "bg-primary border-primary opacity-100"
                          : "opacity-0 group-hover:opacity-100",
                      )}
                    >
                      {isChecked && <Check className="text-primary-foreground size-3" />}
                    </button>
                  </div>

                  <SenderIcon email={mail.fromEmail} senderName={mail.fromName} className="size-6 rounded-md" />
                  <span className={cn("min-w-0 flex-1 truncate text-[13px]", !mail.isRead && "font-semibold text-foreground")}>
                    {mail.fromName}
                  </span>
                  {group.length > 1 && (
                    <span className="text-muted-foreground shrink-0 text-[11px] font-medium">{group.length}</span>
                  )}
                  <span className="text-muted-foreground ml-auto shrink-0 text-[11px]">
                    {formatTime(mail.receivedAt)}
                  </span>
                </div>

                <div className="flex w-full min-w-0 items-center gap-2">
                  <span className="flex size-4 shrink-0 items-center justify-center">
                    {selectedMailId === mail.id && !isChecked && (
                      <span className="bg-primary size-2 rounded-full" aria-hidden="true" />
                    )}
                  </span>
                  <span className={cn("min-w-0 flex-1 truncate text-[13px]", !mail.isRead && "font-semibold")}>
                    {mail.subject}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleStar(mail.id, mail.accountId, !mail.isStarred)
                    }}
                    className={cn(
                      "shrink-0 rounded p-0.5 transition-opacity",
                      mail.isStarred
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-40 hover:!opacity-60",
                    )}
                    aria-label={mail.isStarred ? "별표 해제" : "별표 추가"}
                  >
                    <Star
                      className={cn(
                        "size-3.5",
                        mail.isStarred ? "fill-amber-400 text-amber-400" : "text-muted-foreground",
                      )}
                    />
                  </button>
                </div>

                <span className="text-muted-foreground w-full min-w-0 truncate pl-6 text-xs">
                  {mail.snippet}
                </span>
              </button>
            )
          })}
```

- [ ] **Step 5: 타입체크 + 빌드**

Run (frontend 디렉터리에서): `npx tsc -b && npm run build`
Expected: 에러 없음 (이 시점에선 `groupThreads`를 아직 아무도 `false`로 넘기지 않으므로 항상 그룹핑 켜진 채로 동작 — App.tsx 연결은 Task 7에서)

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/components/mail/mail-list.tsx
git commit -m "feat: group thread replies into a single row in MailList"
```

---

## Task 5: MessageCard 추출 (동작 변화 없는 리팩터)

**Files:**
- Create: `frontend/src/components/mail/message-card.tsx`
- Modify: `frontend/src/components/mail/mail-detail.tsx`

**Interfaces:**
- Produces: `export interface MessageCardProps`, `export function MessageCard(props: MessageCardProps)`

이 태스크는 **동작을 하나도 바꾸지 않는다** — `mail-detail.tsx`의 헤더/툴바/첨부/본문 렌더링을 그대로 `message-card.tsx`로 옮기고, `MailDetail`은 그 컴포넌트를 그대로 호출만 하도록 만든다. 다음 태스크(6)에서 이 카드를 스레드 아코디언에 쓴다.

- [ ] **Step 1: `message-card.tsx` 생성 — 기존 헤더+본문 JSX를 그대로 옮긴다**

`frontend/src/components/mail/mail-detail.tsx`에서 다음을 그대로 가져온다:
- 최상단 import 중 이 카드가 실제로 쓰는 것들: `Archive, Check, Clock, Download, Eye, Folder, FolderInput, Forward, Inbox, MailOpen, Paperclip, Reply, ReplyAll, Star, Trash2, VolumeX` (lucide-react), `Badge`, `Button`, `ProviderIcon`, `SenderIcon`, `AttachmentPreview, isPreviewableAttachment`, `attachmentDownloadUrl, inlineAttachmentUrl`, `cn`, `ARCHIVE_FOLDER_ID`, `Account, Mail, MailAttachment, MailFolder`
- 헬퍼 함수: `formatFullDate`, `formatFileSize`, `buildIframeDoc`, `LinkifiedText` (원래 `mail-detail.tsx:69-127`)
- `getSnoozeOptions` (원래 `mail-detail.tsx:36-67`)
- `mail-detail.tsx:214-478`의 return 블록 전체(비어있지 않을 때의 JSX — 헤더 툴바 + 첨부 + Separator + 본문)와, 그 블록이 쓰는 state(`moveOpen`, `moveRef`, `snoozeOpen`, `snoozeRef`, `previewAttachment`)와 두 개의 click-outside `useEffect`(원래 155-171)

`frontend/src/components/mail/message-card.tsx`:

```tsx
import { Archive, Check, Clock, Download, Eye, Folder, FolderInput, Forward, Inbox, MailOpen, Paperclip, Reply, ReplyAll, Star, Trash2, VolumeX } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ProviderIcon } from "@/components/mail/provider-icon"
import { SenderIcon } from "@/components/mail/sender-icon"
import { AttachmentPreview, isPreviewableAttachment } from "@/components/mail/attachment-preview"
import { attachmentDownloadUrl, inlineAttachmentUrl } from "@/lib/api"
import { cn } from "@/lib/utils"
import { ARCHIVE_FOLDER_ID } from "@/types/mail"
import type { Account, Mail, MailAttachment, MailFolder } from "@/types/mail"

export interface MessageCardProps {
  mail: Mail
  accounts: Account[]
  onToggleStar?: (mailId: string, accountId: string, starred: boolean) => void
  onMarkAsUnread?: (mailId: string, accountId: string) => void
  onDelete?: (mailId: string, accountId: string) => void
  onArchive?: (mailId: string, accountId: string) => void
  onReply?: (mail: Mail) => void
  onReplyAll?: (mail: Mail) => void
  onForward?: (mail: Mail) => void
  folders?: MailFolder[]
  currentFolderId?: string
  onMove?: (mailId: string, accountId: string, folderId: string | null) => void
  onToggleFolder?: (mailId: string, accountId: string, folderId: string, assign: boolean) => void
  onSnooze?: (mailId: string, accountId: string, until: number) => void
  onMute?: (fromEmail: string) => void
  isMuted?: boolean
}

function getSnoozeOptions(): Array<{ label: string; subtitle: string; until: number }> {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const opts: Array<{ label: string; subtitle: string; until: number }> = []

  const today5pm = new Date(today.getTime() + 17 * 3600_000)
  if (today5pm.getTime() > now.getTime()) {
    opts.push({ label: "오늘 오후 5시", subtitle: "오늘 저녁에 다시", until: today5pm.getTime() })
  }

  const tomorrow9am = new Date(today.getTime() + 25 * 3600_000)
  tomorrow9am.setHours(9, 0, 0, 0)
  tomorrow9am.setDate(today.getDate() + 1)
  opts.push({ label: "내일 오전 9시", subtitle: "내일 아침에 다시", until: tomorrow9am.getTime() })

  const dow = now.getDay()
  const daysToSat = ((6 - dow) + 7) % 7 || 7
  const sat = new Date(today.getTime())
  sat.setDate(today.getDate() + daysToSat)
  sat.setHours(9, 0, 0, 0)
  if (sat.getTime() > tomorrow9am.getTime()) {
    opts.push({ label: "이번 주 토요일", subtitle: "주말에 다시", until: sat.getTime() })
  }

  const daysToMon = ((8 - dow) % 7) || 7
  const mon = new Date(today.getTime())
  mon.setDate(today.getDate() + daysToMon)
  mon.setHours(9, 0, 0, 0)
  opts.push({ label: "다음 주 월요일", subtitle: "다음 주에 다시", until: mon.getTime() })

  return opts
}

function formatFullDate(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function buildIframeDoc(mail: Mail): string {
  const inlineImages = new Map(
    (mail.attachments ?? [])
      .filter((attachment) => attachment.contentId)
      .map((attachment) => [attachment.contentId!.toLowerCase(), inlineAttachmentUrl(mail.id, mail.accountId, attachment)]),
  )
  const bodyHtml = mail.bodyHtml!.replace(
    /\b(src|background)\s*=\s*(["'])cid:([^"']+)\2/gi,
    (match, attribute: string, quote: string, rawContentId: string) => {
      let decodedContentId = rawContentId
      try { decodedContentId = decodeURIComponent(rawContentId) } catch { /* malformed encoding: use the raw id */ }
      const contentId = decodedContentId.replace(/^<|>$/g, "").toLowerCase()
      const url = inlineImages.get(contentId)
      return url ? `${attribute}=${quote}${url}${quote}` : match
    },
  )
    .replace(/<img\b(?![^>]*\breferrerpolicy=)/gi, '<img referrerpolicy="no-referrer" loading="lazy"')
    .replace(/<a\b([^>]*)>/gi, (_match, attributes: string) => {
      const withoutTarget = attributes.replace(/\s+target\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      const withoutRel = withoutTarget.replace(/\s+rel\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      return `<a${withoutRel} target="_blank" rel="noopener noreferrer">`
    })
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light"><base target="_blank"><style>
body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;line-height:1.6;word-wrap:break-word;overflow-wrap:break-word;margin:0;padding:16px;color:#1a1a1a;background:#fff}
img{max-width:100%;height:auto}
table{max-width:100%;border-collapse:collapse}
a{color:#2563eb;text-decoration:underline;cursor:pointer}
</style></head><body>${bodyHtml}</body></html>`
}

function LinkifiedText({ text }: { text: string }) {
  const urlPattern = /(https?:\/\/[^\s]+|mailto:[^\s]+|www\.[^\s]+)/gi
  return <p className="max-w-3xl text-[15px] leading-7 whitespace-pre-wrap">
    {text.split(urlPattern).map((part, index) => {
      if (!/^(https?:\/\/|mailto:|www\.)/i.test(part)) return part
      const trailing = part.match(/[),.!?;:]+$/)?.[0] ?? ""
      const rawUrl = trailing ? part.slice(0, -trailing.length) : part
      const href = rawUrl.startsWith("www.") ? `https://${rawUrl}` : rawUrl
      return <span key={`${part}-${index}`}><a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline underline-offset-2 hover:text-blue-800">{rawUrl}</a>{trailing}</span>
    })}
  </p>
}

export function MessageCard({
  mail,
  accounts,
  onToggleStar,
  onMarkAsUnread,
  onDelete,
  onArchive,
  onReply,
  onReplyAll,
  onForward,
  folders,
  currentFolderId,
  onMove,
  onToggleFolder,
  onSnooze,
  onMute,
  isMuted,
}: MessageCardProps) {
  const [moveOpen, setMoveOpen] = useState(false)
  const moveRef = useRef<HTMLDivElement>(null)
  const [snoozeOpen, setSnoozeOpen] = useState(false)
  const snoozeRef = useRef<HTMLDivElement>(null)
  const [previewAttachment, setPreviewAttachment] = useState<MailAttachment | null>(null)

  useEffect(() => {
    if (!moveOpen) return
    const handler = (e: MouseEvent) => {
      if (moveRef.current && !moveRef.current.contains(e.target as Node)) setMoveOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [moveOpen])

  useEffect(() => {
    if (!snoozeOpen) return
    const handler = (e: MouseEvent) => {
      if (snoozeRef.current && !snoozeRef.current.contains(e.target as Node)) setSnoozeOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [snoozeOpen])

  const account = accounts.find((a) => a.id === mail.accountId)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-4 border-b bg-background px-7 py-5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="text-xl font-semibold leading-snug tracking-tight break-words">{mail.subject}</h2>
          <div className="flex flex-wrap items-center gap-1">
            {onReply && (
              <Button variant="ghost" size="icon" className="size-8" title="답장" onClick={() => onReply(mail)}>
                <Reply className="size-4" />
              </Button>
            )}
            {onReplyAll && (
              <Button variant="ghost" size="icon" className="size-8" title="전체답장" onClick={() => onReplyAll(mail)}>
                <ReplyAll className="size-4" />
              </Button>
            )}
            {onForward && (
              <Button variant="ghost" size="icon" className="size-8" title="전달" onClick={() => onForward(mail)}>
                <Forward className="size-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              title={mail.isRead ? "읽지 않음으로 표시" : "이미 읽지 않은 메일"}
              onClick={() => onMarkAsUnread?.(mail.id, mail.accountId)}
              disabled={!mail.isRead}
            >
              <MailOpen className="size-4" />
            </Button>
            <button
              type="button"
              onClick={() => onToggleStar?.(mail.id, mail.accountId, !mail.isStarred)}
              className="hover:bg-accent flex size-8 items-center justify-center rounded-md transition-colors"
              aria-label={mail.isStarred ? "별표 해제" : "별표 추가"}
              title={mail.isStarred ? "별표 해제" : "별표 추가"}
            >
              <Star className={mail.isStarred ? "size-4 fill-amber-400 text-amber-400" : "size-4 text-muted-foreground"} />
            </button>
            {onArchive && (
              <Button variant="ghost" size="icon" className="size-8" title="보관" onClick={() => onArchive(mail.id, mail.accountId)}>
                <Archive className="size-4" />
              </Button>
            )}
            {(onMove || onToggleFolder) && (
              <div ref={moveRef} className="relative">
                <Button variant="ghost" size="icon" className="size-8" title="분류 메일함으로 이동" onClick={() => setMoveOpen((v) => !v)}>
                  <FolderInput className="size-4" />
                </Button>
                {moveOpen && (
                  <div className="bg-background absolute top-full right-0 z-20 mt-1 min-w-[160px] rounded-md border shadow-md">
                    {currentFolderId === ARCHIVE_FOLDER_ID && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            onMove?.(mail.id, mail.accountId, null)
                            setMoveOpen(false)
                          }}
                          className="hover:bg-accent flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
                        >
                          <Inbox className="text-muted-foreground size-3.5" />
                          보관함에서 꺼내기
                        </button>
                        <div className="my-1 border-t" />
                      </>
                    )}
                    {(folders ?? []).map((folder) => {
                      const checked = mail.folderIds?.includes(folder.id) ?? false
                      return (
                        <button
                          key={folder.id}
                          type="button"
                          onClick={() => onToggleFolder?.(mail.id, mail.accountId, folder.id, !checked)}
                          className="hover:bg-accent flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
                        >
                          <span className="border-input flex size-3.5 shrink-0 items-center justify-center rounded-sm border">
                            {checked && <Check className="size-2.5" />}
                          </span>
                          <Folder className="size-3.5 shrink-0" style={{ color: folder.color, fill: folder.color, fillOpacity: 0.25 }} />
                          <span className="truncate">{folder.name}</span>
                        </button>
                      )
                    })}
                    {(!folders || folders.length === 0) && currentFolderId !== ARCHIVE_FOLDER_ID && (
                      <p className="text-muted-foreground px-3 py-1.5 text-xs">분류 메일함이 없습니다.</p>
                    )}
                  </div>
                )}
              </div>
            )}
            {onSnooze && (
              <div ref={snoozeRef} className="relative">
                <Button variant="ghost" size="icon" className="size-8" title="스누즈" onClick={() => setSnoozeOpen((v) => !v)}>
                  <Clock className="size-4" />
                </Button>
                {snoozeOpen && (
                  <div className="bg-background absolute top-full right-0 z-20 mt-1 min-w-[160px] rounded-md border shadow-md">
                    <p className="text-muted-foreground px-3 pt-2 pb-1 text-xs">나중에 다시 보기</p>
                    {getSnoozeOptions().map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => {
                          onSnooze(mail.id, mail.accountId, opt.until)
                          setSnoozeOpen(false)
                        }}
                        className="hover:bg-accent flex w-full flex-col items-start px-3 py-1.5 text-left"
                      >
                        <span className="text-sm">{opt.label}</span>
                        <span className="text-muted-foreground text-xs">{opt.subtitle}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {onMute && (
              <Button
                variant="ghost"
                size="icon"
                className={cn("size-8", isMuted && "text-primary")}
                title={isMuted ? "뮤트 해제" : "이 발신자 뮤트"}
                onClick={() => onMute(mail.fromEmail)}
              >
                <VolumeX className="size-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="hover:text-destructive size-8" title="삭제" onClick={() => onDelete?.(mail.id, mail.accountId)}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-3 border-t pt-4">
          <SenderIcon email={mail.fromEmail} senderName={mail.fromName} className="size-9" />
          <div className="flex min-w-0 flex-1 flex-col text-sm">
            <span className="truncate">
              <span className="font-medium">{mail.fromName}</span>{" "}
              <span className="text-muted-foreground">&lt;{mail.fromEmail}&gt;</span>
            </span>
            <span className="text-muted-foreground text-xs">{formatFullDate(mail.receivedAt)}</span>
          </div>
          {account && (
            <Badge variant="secondary" className="max-w-[45%] shrink-0 gap-1.5 py-1 pr-2 pl-1">
              <ProviderIcon provider={account.provider} className="size-5 rounded" label={account.email} />
              <span className="truncate">
                {account.provider === "gmail" || account.provider === "naver" || account.provider === "daum"
                  ? account.email
                  : account.label}
              </span>
            </Badge>
          )}
        </div>
        {mail.attachments && mail.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {mail.attachments.map((attachment) =>
              isPreviewableAttachment(attachment.mimeType) ? (
                <button
                  key={attachment.id}
                  type="button"
                  onClick={() => setPreviewAttachment(attachment)}
                  className="border-input hover:bg-accent flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors"
                >
                  <Paperclip className="text-muted-foreground size-3.5 shrink-0" />
                  <span className="max-w-[160px] truncate">{attachment.filename}</span>
                  <span className="text-muted-foreground shrink-0">{formatFileSize(attachment.size)}</span>
                  <Eye className="text-muted-foreground size-3.5 shrink-0" />
                </button>
              ) : (
                <a
                  key={attachment.id}
                  href={attachmentDownloadUrl(mail.id, mail.accountId, attachment)}
                  download={attachment.filename}
                  className="border-input hover:bg-accent flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors"
                >
                  <Paperclip className="text-muted-foreground size-3.5 shrink-0" />
                  <span className="max-w-[160px] truncate">{attachment.filename}</span>
                  <span className="text-muted-foreground shrink-0">{formatFileSize(attachment.size)}</span>
                  <Download className="text-muted-foreground size-3.5 shrink-0" />
                </a>
              ),
            )}
          </div>
        )}
        {previewAttachment && (
          <AttachmentPreview mail={mail} attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {mail.bodyHtml ? (
          <iframe
            key={mail.id}
            title={mail.subject}
            srcDoc={buildIframeDoc(mail)}
            sandbox="allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
            className="h-full w-full border-0"
          />
        ) : (
          <div className="h-full overflow-auto px-8 py-7">
            <LinkifiedText text={mail.body} />
          </div>
        )}
      </div>
    </div>
  )
}
```

(원래 있던 `Separator` import/사용과 로딩 스켈레톤은 옮기지 않았다 — `Separator`는 헤더와 본문 사이 구분선이라 카드 내부에도 여전히 필요하므로, 위 헤더 `<div>`의 `border-b` 클래스가 그 역할을 대신한다. 로딩 스켈레톤은 `MailDetail`이 스레드 전체 단위로 계속 갖는다 — Step 2에서 처리.)

- [ ] **Step 2: `mail-detail.tsx`를 `MessageCard`를 감싸는 얇은 래퍼로 축소**

`frontend/src/components/mail/mail-detail.tsx` 전체를 아래로 교체 (기존 `MailDetailProps`의 `mail: Mail | null`은 그대로 두고, 이번 스텝에서는 아직 스레드가 아니라 단일 메일을 배열 하나짜리로만 감싼다 — 진짜 다중 메시지 아코디언은 Task 6):

```tsx
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { MessageCard } from "@/components/mail/message-card"
import { ChevronLeft } from "lucide-react"
import type { Account, Mail, MailFolder } from "@/types/mail"

interface MailDetailProps {
  mail: Mail | null
  accounts: Account[]
  isLoadingBody?: boolean
  onBack?: () => void
  onToggleStar?: (mailId: string, accountId: string, starred: boolean) => void
  onMarkAsUnread?: (mailId: string, accountId: string) => void
  onDelete?: (mailId: string, accountId: string) => void
  onArchive?: (mailId: string, accountId: string) => void
  onReply?: (mail: Mail) => void
  onReplyAll?: (mail: Mail) => void
  onForward?: (mail: Mail) => void
  folders?: MailFolder[]
  currentFolderId?: string
  onMove?: (mailId: string, accountId: string, folderId: string | null) => void
  onToggleFolder?: (mailId: string, accountId: string, folderId: string, assign: boolean) => void
  onSnooze?: (mailId: string, accountId: string, until: number) => void
  onMute?: (fromEmail: string) => void
  isMuted?: boolean
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="-ml-2 w-fit gap-1" onClick={onBack}>
      <ChevronLeft className="size-4" />
      목록으로
    </Button>
  )
}

export function MailDetail({ mail, isLoadingBody, onBack, ...rest }: MailDetailProps) {
  if (!mail) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col">
        {onBack && <BackButton onBack={onBack} />}
        <div className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden px-6 pb-16">
          <div className="flex -translate-y-2 flex-col items-center text-center">
            <img
              src="/mail-empty-roost.png"
              alt="새들이 메일을 나르는 새집"
              className="h-auto w-[min(25rem,78vw)] select-none"
              draggable={false}
            />
            <div className="-mt-3 flex flex-col items-center">
              <h2 className="text-foreground text-xl font-bold tracking-tight sm:text-2xl">
                메일을 선택해 내용을 확인하세요
              </h2>
              <p className="text-muted-foreground mt-2 text-sm sm:text-base">
                여러 계정의 메일을 한 곳에서 관리할 수 있어요.
              </p>
              <div className="mt-5 flex items-center gap-2 text-orange-500">
                <svg aria-hidden="true" viewBox="0 0 92 52" className="h-11 w-20 -rotate-6" fill="none">
                  <path
                    d="M88 45C67 48 56 40 59 29c3-10 19-7 16 2-4 12-31 9-45-11C23 10 15 7 5 8"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeDasharray="5 5"
                  />
                  <path d="M13 2 4 8l6 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <span className="text-sm font-medium sm:text-base">왼쪽에서 메일을 선택해보세요!</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {onBack && (
        <div className="shrink-0 border-b bg-background px-7 pt-4">
          <BackButton onBack={onBack} />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        {isLoadingBody ? (
          <div className="flex flex-col gap-3 p-6">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : (
          <MessageCard mail={mail} {...rest} />
        )}
      </div>
    </div>
  )
}
```

주의: `rest`에 `accounts`가 포함되도록, 구조분해에서 `accounts`를 명시적으로 꺼내지 말고 `...rest`로 넘어가게 둔다 (`MessageCardProps`가 `accounts`를 요구하므로).

- [ ] **Step 3: import 확인**

`mail-detail.tsx`는 이제 이 컴포넌트 안에서 React 훅을 직접 쓰지 않으므로 `"react"`에서 아무것도 import하지 않는다 (위 교체본이 이미 그렇게 되어 있음 — Task 6에서 `useState`가 다시 필요해진다).

- [ ] **Step 4: 타입체크 + 빌드**

Run (frontend 디렉터리에서): `npx tsc -b && npm run build`
Expected: 에러 없음 (App.tsx는 아직 손대지 않았으므로 기존 `mail={selectedMail}` prop 그대로 컴파일되어야 함)

- [ ] **Step 5: 로컬에서 동작 변화 없는지 수동 확인**

Run: `npx vite --port 5183` (frontend 디렉터리) + 이미 로그인된 브라우저 세션에서 메일 하나 열어 헤더/본문/첨부/답장·보관·이동·스누즈·뮤트 버튼이 리팩터 전과 동일하게 보이고 동작하는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/components/mail/message-card.tsx frontend/src/components/mail/mail-detail.tsx
git commit -m "refactor: extract MessageCard out of MailDetail (no behavior change)"
```

---

## Task 6: MailDetail — 스레드 아코디언

**Files:**
- Modify: `frontend/src/components/mail/mail-detail.tsx`

**Interfaces:**
- Consumes: `MessageCard`, `MessageCardProps` (Task 5)
- Produces: `MailDetailProps.thread: Mail[] | null` (기존 `mail: Mail | null` 대체), `MailDetailProps.mutedSet: Set<string>` (기존 `isMuted: boolean` 대체)

- [ ] **Step 1: props를 `mail` → `thread`, `isMuted` → `mutedSet`으로 교체**

`frontend/src/components/mail/mail-detail.tsx`의 `MailDetailProps`에서:

```ts
  mail: Mail | null
```

```ts
  thread: Mail[] | null
```

로, 그리고:

```ts
  isMuted?: boolean
```

```ts
  mutedSet?: Set<string>
```

로 바꾼다.

- [ ] **Step 2: 컴포넌트 본문을 스레드 아코디언으로 교체**

`export function MailDetail({ mail, isLoadingBody, onBack, ...rest }: MailDetailProps) {` 이하 함수 전체를 아래로 교체:

```tsx
function MailDetailBody({
  thread,
  onBack,
  mutedSet,
  ...rest
}: {
  thread: Mail[]
  onBack?: () => void
  mutedSet?: Set<string>
} & Omit<MailDetailProps, "thread" | "mail" | "isLoadingBody" | "onBack" | "mutedSet">) {
  // thread가 바뀔 때마다(다른 대화를 열 때마다) 이 컴포넌트가 새 key로 다시 마운트되므로,
  // expandedIds는 항상 "새로 연 스레드는 최신 메일만 펼침"으로 초기화된다.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set([thread[thread.length - 1].id]))

  const toggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {onBack && (
        <div className="shrink-0 border-b bg-background px-7 pt-4">
          <BackButton onBack={onBack} />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {thread.map((mail) => {
          const expanded = expandedIds.has(mail.id)
          if (!expanded) {
            return (
              <button
                key={mail.id}
                type="button"
                onClick={() => toggle(mail.id)}
                className="hover:bg-muted/40 flex w-full items-center gap-3 border-b px-7 py-3 text-left transition-colors"
              >
                <span className="min-w-0 flex-1 truncate text-sm">
                  <span className="font-medium">{mail.fromName}</span>{" "}
                  <span className="text-muted-foreground">{mail.snippet}</span>
                </span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {new Date(mail.receivedAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}
                </span>
              </button>
            )
          }
          return (
            <div key={mail.id} className="border-b last:border-b-0">
              <MessageCard mail={mail} isMuted={mutedSet?.has(mail.fromEmail)} {...rest} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function MailDetail({ thread, isLoadingBody, onBack, mutedSet, ...rest }: MailDetailProps) {
  if (!thread || thread.length === 0) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col">
        {onBack && <BackButton onBack={onBack} />}
        <div className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden px-6 pb-16">
          <div className="flex -translate-y-2 flex-col items-center text-center">
            <img
              src="/mail-empty-roost.png"
              alt="새들이 메일을 나르는 새집"
              className="h-auto w-[min(25rem,78vw)] select-none"
              draggable={false}
            />
            <div className="-mt-3 flex flex-col items-center">
              <h2 className="text-foreground text-xl font-bold tracking-tight sm:text-2xl">
                메일을 선택해 내용을 확인하세요
              </h2>
              <p className="text-muted-foreground mt-2 text-sm sm:text-base">
                여러 계정의 메일을 한 곳에서 관리할 수 있어요.
              </p>
              <div className="mt-5 flex items-center gap-2 text-orange-500">
                <svg aria-hidden="true" viewBox="0 0 92 52" className="h-11 w-20 -rotate-6" fill="none">
                  <path
                    d="M88 45C67 48 56 40 59 29c3-10 19-7 16 2-4 12-31 9-45-11C23 10 15 7 5 8"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeDasharray="5 5"
                  />
                  <path d="M13 2 4 8l6 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <span className="text-sm font-medium sm:text-base">왼쪽에서 메일을 선택해보세요!</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (isLoadingBody) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {onBack && (
          <div className="shrink-0 border-b bg-background px-7 pt-4">
            <BackButton onBack={onBack} />
          </div>
        )}
        <div className="flex flex-col gap-3 p-6">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    )
  }

  return <MailDetailBody key={thread[0].id} thread={thread} onBack={onBack} mutedSet={mutedSet} {...rest} />
}
```

`useState`를 이제 다시 쓰므로 파일 맨 위(첫 import 줄 앞)에 추가한다:

```ts
import { useState } from "react"
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc -b`
Expected: `App.tsx`에서 에러 발생 — `mail`/`isMuted` prop을 아직 넘기고 있음 (Task 7에서 고침). 이 태스크에서는 `mail-detail.tsx` 자체에는 타입 에러가 없는지만 확인한다: `npx tsc -b 2>&1 | grep mail-detail.tsx` → 출력 없음이어야 함.

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/components/mail/mail-detail.tsx
git commit -m "feat: render MailDetail as a thread accordion of MessageCards"
```

(App.tsx가 아직 옛 prop을 넘기고 있어 이 시점의 `main`은 빌드가 깨진 상태 — Task 7에서 바로 이어서 고친다. 이 계획을 subagent-driven으로 실행한다면 Task 6/7을 한 리뷰 사이클로 묶는 걸 권장.)

---

## Task 7: App.tsx — 스레드 계산/프리페치 연결

**Files:**
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `groupIntoThreads` (Task 3), `MailList`의 `groupThreads?: boolean` (Task 4), `MailDetail`의 `thread`/`mutedSet` props (Task 6)

- [ ] **Step 1: import 추가**

`frontend/src/App.tsx`의 import 블록에 추가:

```ts
import { groupIntoThreads } from "@/lib/threading"
```

- [ ] **Step 2: `selectedThread` 계산 추가**

`const selectedMailStub = ...` 블록(기존) 바로 다음에 추가:

```ts
  // 상세 패널에 넘길 스레드 — visibleMails(받은편지함/중요메일) 우선, 없으면 folderMails(분류함/
  // 보관함/휴지통) 순으로 찾는다. selectedMailStub과 동일한 우선순위를 그대로 따른다.
  const selectedThread = useMemo(() => {
    if (!selectedMailStub) return null
    const fromVisible = groupIntoThreads(visibleMails).find((t) => t.some((m) => m.id === selectedMailStub.id))
    if (fromVisible) return fromVisible
    const fromFolder = groupIntoThreads(workspace.folderMails).find((t) => t.some((m) => m.id === selectedMailStub.id))
    if (fromFolder) return fromFolder
    return [selectedMailStub]
  }, [visibleMails, workspace.folderMails, selectedMailStub])
```

- [ ] **Step 3: 상세 fetch 이펙트를 스레드 전체로 확장**

기존:

```ts
  useEffect(() => {
    if (!selectedMailStub || !isRealAccountId(selectedMailStub.accountId)) return
    if (workspace.mailDetails[selectedMailStub.id]) return
    fetchMailDetail(selectedMailStub.id, selectedMailStub.accountId).then((detail) => {
      if (detail) workspace.setMailDetail(detail)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMailStub, workspace.mailDetails])
```

를 아래로 교체 (스레드를 열면 스레드 안의 모든 메일 본문을 한꺼번에 미리 불러온다 — 나중에 개별 메시지를 펼칠 때 추가로 fetch할 필요가 없어진다):

```ts
  useEffect(() => {
    if (!selectedThread) return
    for (const m of selectedThread) {
      if (!isRealAccountId(m.accountId)) continue
      if (workspace.mailDetails[m.id]) continue
      fetchMailDetail(m.id, m.accountId).then((detail) => {
        if (detail) workspace.setMailDetail(detail)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThread, workspace.mailDetails])
```

- [ ] **Step 4: `isLoadingDetail`을 스레드 전체 기준으로 일반화**

기존:

```ts
  const isLoadingDetail =
    selectedMailStub !== null &&
    isRealAccountId(selectedMailStub.accountId) &&
    !workspace.mailDetails[selectedMailStub.id]
```

를:

```ts
  const isLoadingDetail =
    selectedThread !== null &&
    selectedThread.some((m) => isRealAccountId(m.accountId) && !workspace.mailDetails[m.id])
```

로 교체. `selectedMail`(단일 메일, 키보드 단축키용) 계산부는 **그대로 둔다** — `mail-list.tsx`의 J/K/Backspace/R/S/U 단축키가 여전히 "현재 선택된 메일 한 통"을 기준으로 동작해야 하므로 이건 건드리지 않는다.

- [ ] **Step 5: 스레드 상세 데이터(merge) 계산 추가**

`isLoadingDetail` 선언 바로 다음에 추가:

```ts
  // 이미 상세가 로드된 메일은 workspace.mailDetails로 덮어써서(bodyHtml/attachments 포함)
  // MailDetail에 넘긴다. 아직 안 불러와진 메일은 리스트에서 온 스텁 그대로 넘어간다 —
  // isLoadingDetail이 true인 동안은 MailDetail이 스켈레톤을 보여주므로 화면엔 안 보인다.
  const threadWithDetails = selectedThread?.map((m) => workspace.mailDetails[m.id] ?? m) ?? null
```

- [ ] **Step 6: `MailDetail` 두 호출부 교체**

`mailDetailPane`과 `folderDetailPane` 안, 각각의 `<MailDetail ... />` 호출에서:

```tsx
      mail={selectedMail}
```

를:

```tsx
      thread={threadWithDetails}
```

로 교체. 그리고 `mailDetailPane`의 `<MailDetail>`에만 있는:

```tsx
      isMuted={!!selectedMailStub && mailOrg.mutedSet.has(selectedMailStub.fromEmail)}
```

줄을 삭제하고, 대신 두 `<MailDetail>` 호출부 모두에 다음 줄을 추가:

```tsx
      mutedSet={mailOrg.mutedSet}
```

- [ ] **Step 7: 검색 중엔 그룹핑 끄기**

`mailListPane`(`const mailListPane = (...)`) 안의 `<MailList ... />` 호출에 prop 추가:

```tsx
      groupThreads={!workspace.searchQuery}
```

(`folderListPane`은 검색 개념이 없으므로 손대지 않는다 — `groupThreads` 기본값 `true`가 그대로 적용된다.)

- [ ] **Step 8: J/K 키보드 탐색이 그룹 대표만 가리키도록 수정**

`MailList`는 이제 그룹의 대표(최신) 메일 id로만 DOM 행(`id="mail-row-<id>"`)을 렌더링한다 (Task 4). 그런데 J/K 키보드 탐색용 `activeList`는 지금 `visibleMails`/`workspace.folderMails`를 그대로(개별 메일 단위로) 쓰고 있어서, 스레드에 묶여 접힌 메일로 포커스가 이동하면 해당 `mail-row-<id>` DOM이 존재하지 않아 `scrollIntoView`가 조용히 실패한다.

`App.tsx`의 단축키 `useEffect` 안, 다음 줄을:

```ts
    const activeList = view === "folder" || view === "archive" ? workspace.folderMails : view === "inbox" || view === "starred" ? visibleMails : []
```

아래로 교체:

```ts
    const activeList = (
      view === "folder" || view === "archive"
        ? groupIntoThreads(workspace.folderMails)
        : view === "inbox" || view === "starred"
          ? groupIntoThreads(visibleMails)
          : []
    ).map((group) => group[group.length - 1])
```

`activeList`의 타입은 여전히 `Mail[]`이라(그룹 대표들의 배열) 이 아래에서 `activeList`를 쓰는 `moveFocus`/Enter/Backspace/R/S/U 핸들러 코드는 전혀 안 바꿔도 된다.

- [ ] **Step 9: 타입체크 + 빌드**

Run (frontend 디렉터리에서): `npx tsc -b && npm run build`
Expected: 에러 없음

- [ ] **Step 10: 전체 프런트 테스트 + 백엔드 테스트**

Run: `npx vitest run` (frontend), `cd ../backend && npx vitest run`
Expected: 전부 PASS

- [ ] **Step 11: 로컬 수동 확인**

Run: `npx wrangler dev`(backend) + `npx vite --port 5183`(frontend), 실제 로그인 계정으로:
1. 답장을 주고받은 적 있는 메일이 리스트에서 한 줄로 묶여 개수 배지가 보이는지
2. 클릭하면 최신 메일이 펼쳐진 채 나머지는 접힌 헤더로 보이는지, 접힌 헤더 클릭 시 펼쳐지는지
3. 검색창에 뭔가 입력하면 그 결과는 그룹핑 없이 개별 메일로 나오는지
4. 스레드 행을 체크해서 일괄삭제/보관/이동 시 스레드 안의 메일이 전부 대상이 되는지
5. 리스트에서 J/K로 메일 사이를 이동할 때 스레드로 묶인 행에서도 포커스 표시와 스크롤이 정상 동작하는지

- [ ] **Step 12: 커밋**

```bash
git add frontend/src/App.tsx
git commit -m "feat: wire thread grouping and prefetch into App.tsx"
```
