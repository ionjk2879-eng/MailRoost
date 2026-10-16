# ?ㅻ젅??酉?Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Gmail + ?ㅼ씠踰??ㅼ쓬/踰붿슜 IMAP 怨꾩젙 ?꾨??먯꽌 ?듭옣 泥댁씤???섎굹??????ㅻ젅??濡?臾띠뼱??由ъ뒪???곸꽭 ?⑤꼸??蹂댁뿬以??

**Architecture:** 諛깆뿏?쒕뒗 媛?provider???ㅻ젅???먮낯 ?ㅻ뜑(Gmail `threadId`, IMAP `Message-ID`/`References`/`In-Reply-To`)留?`Mail`???ㅼ뼱蹂대궡怨? 洹몃９??怨꾩궛? ?꾨윴?멸? ?대? 濡쒕뱶??`allMails` ?꾩뿉???쒖닔 ?⑥닔濡??쒕떎 (諛깆뿏??API 蹂寃??놁씠 湲곗〈 bulk ?≪뀡 ?붾뱶?ъ씤?몃? 洹몃?濡??ъ궗??. ?곸꽭 ?⑤꼸? `MessageCard`(硫붿씪 ???? + `MailDetail`(?ㅻ젅???꾩껜瑜??꾩퐫?붿뼵?쇰줈 媛먯떥???뉗? ?섑띁)濡??섎늿??

**Tech Stack:** Cloudflare Workers + Hono (backend), React 19 + Vite (frontend), Vitest (unit tests, 諛깆뿏?쒕뒗 ?대? ?ъ슜 以?/ ?꾨윴?몄뿏?쒕뒗 ?대쾲???좎꽕)

**Spec:** `docs/superpowers/specs/2026-08-29-thread-view-design.md`

## Global Constraints

- 怨꾩젙???섎굹?쒕뒗 ?ㅻ젅??蹂묓빀 湲덉? (accountId媛 ?ㅻⅤ硫??덈? 媛숈? 洹몃９?????ㅼ뼱媛?
- ?쒕ぉ 湲곕컲 fallback 洹몃９??湲덉? (?ㅻ뜑 留ㅼ묶 ?ㅽ뙣 ???⑤룆 ?ㅻ젅?쒕줈 ?붾떎)
- 寃??寃곌낵??洹몃９?묓븯吏 ?딅뒗??(媛쒕퀎 硫붿씪濡??쒖떆)
- ?덉씫??移댁슫?몃뒗 硫붿씪 ?⑥쐞 洹몃?濡??좎? (?ㅻ젅???⑥쐞濡?諛붽씀吏 ?딅뒗??
- 湲곗〈 bulk ?≪뀡 API(`/api/mail/bulk-*` ????蹂寃쏀븯吏 ?딅뒗?????꾨윴?몄뿉??洹몃９??媛쒕퀎 mail id濡??쇱퀜??洹몃?濡??몄텧

---

## Task 1: Gmail threadId

**Files:**
- Modify: `backend/src/types.ts` (`Mail` ?명꽣?섏씠??
- Modify: `backend/src/lib/gmail.ts:151-209`
- Create: `backend/src/lib/gmail.test.ts`

**Interfaces:**
- Produces: `Mail.threadId?: string`, `Mail.messageId?: string`, `Mail.references?: string[]`, `Mail.inReplyTo?: string` (??3媛쒕뒗 Task 2媛 梨꾩?, ?ш린?쒕뒗 ??낅쭔 媛숈씠 異붽?), `export interface GmailMessage`, `export function mapMessageToMail(msg: GmailMessage, accountId: string): Mail`

- [x] **Step 1: `Mail` ??낆뿉 ?ㅻ젅???꾨뱶 異붽?**

`backend/src/types.ts`?먯꽌 `folderIds?: string[]` ?ㅼ쓬 以꾩뿉 異붽?:

```ts
  // ?ㅻ젅??洹몃９?묒슜 ??Gmail? threadId留? IMAP(?ㅼ씠踰??ㅼ쓬/踰붿슜)? messageId/references/inReplyTo留?梨꾩썙吏꾨떎.
  threadId?: string
  messageId?: string
  references?: string[]
  inReplyTo?: string
```

- [x] **Step 2: ?ㅽ뙣?섎뒗 ?뚯뒪???묒꽦**

`backend/src/lib/gmail.test.ts` ?좎꽕:

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

- [x] **Step 3: ?뚯뒪???ㅽ뙣 ?뺤씤**

Run (backend ?붾젆?곕━?먯꽌): `npx vitest run src/lib/gmail.test.ts`
Expected: FAIL ??`mapMessageToMail`/`GmailMessage`媛 export?섏? ?딆븘 ????꾪룷???먮윭

- [x] **Step 4: `GmailMessage`??`threadId` 異붽??섍퀬 export, `mapMessageToMail` export + 留ㅽ븨 異붽?**

`backend/src/lib/gmail.ts:164-170`???ㅼ쓬?쇰줈 援먯껜:

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

`backend/src/lib/gmail.ts:192` (`function mapMessageToMail(msg: GmailMessage, accountId: string): Mail {`)瑜?

```ts
export function mapMessageToMail(msg: GmailMessage, accountId: string): Mail {
```

洹몃━怨?媛숈? ?⑥닔 ?? `return { id: msg.id, ... }` 媛앹껜 由ы꽣?댁쓽 `isStarred: labelIds.includes("STARRED"),` ?ㅼ쓬 以꾩뿉 異붽?:

```ts
    threadId: msg.threadId,
```

- [x] **Step 5: ?뚯뒪???듦낵 ?뺤씤**

Run: `npx vitest run src/lib/gmail.test.ts`
Expected: PASS (2 tests)

- [x] **Step 6: ?꾩껜 諛깆뿏???뚯뒪??+ ??낆껜??*

Run: `npx vitest run && npx tsc --noEmit`
Expected: ?꾨? PASS, ????먮윭 ?놁쓬

- [x] **Step 7: 而ㅻ컠**

```bash
git add backend/src/types.ts backend/src/lib/gmail.ts backend/src/lib/gmail.test.ts
git commit -m "feat: expose Gmail threadId on Mail for thread grouping"
```

---

## Task 2: IMAP ?ㅻ젅???ㅻ뜑 (Message-ID / References / In-Reply-To)

**Files:**
- Create: `backend/src/lib/imap-parse.ts` (湲곗〈 `imap.ts`???뚯떛 ?꾩슜 ?⑥닔 異붿텧 + ?뺤옣)
- Create: `backend/src/lib/imap-parse.test.ts`
- Modify: `backend/src/lib/imap.ts` (異붿텧???⑥닔瑜?import濡?援먯껜, FETCH 紐낅졊 ?ㅻ뜑 ?꾨뱶 ?뺤옣)

**Interfaces:**
- Consumes: `Mail` ??낆뿉 ?대? ?덈뒗 `messageId?`, `references?`, `inReplyTo?` (Task 1?먯꽌 異붽???
- Produces: `export interface ParsedFetchLine`, `export function parseFetchLine(line: string): ParsedFetchLine | null`, `export function parseInternalDate(raw: string | undefined): string`, `export function mapFetchLinesToMails(lines: string[], accountId: string): Mail[]`

`imap.ts`媛 吏湲?`cloudflare:sockets`瑜?紐⑤뱢 理쒖긽?⑥뿉??import?댁꽌, ?쒖닔 ?뚯떛 濡쒖쭅源뚯? 媛숈? ?뚯씪???덉쑝硫?plain vitest(node ?섍꼍)濡?吏곸젒 ?뚯뒪?명븷 ???녿떎 (`Cannot find package 'cloudflare:sockets'`濡?利됱떆 ?ㅽ뙣 ???뺤씤??. ?뚯떛 濡쒖쭅???뚯폆 ?섏〈?깆씠 ?녿뒗 蹂꾨룄 ?뚯씪濡?戮묒븘?대뒗 寃???臾몄젣瑜?洹쇰낯?곸쑝濡??닿껐?쒕떎.

- [x] **Step 1: ?ㅽ뙣?섎뒗 ?뚯뒪?몃????묒꽦**

`backend/src/lib/imap-parse.test.ts` ?좎꽕 (?꾩쭅 `imap-parse.ts`媛 ?놁쑝誘濡?import媛 ?ㅽ뙣?섎뒗 寃??뺤긽):

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

- [x] **Step 2: ?뚯뒪???ㅽ뙣 ?뺤씤**

Run: `npx vitest run src/lib/imap-parse.test.ts`
Expected: FAIL ??`Cannot find module './imap-parse'`

- [x] **Step 3: `imap-parse.ts` ?좎꽕 ??湲곗〈 ?뚯떛 ?⑥닔瑜???린怨??ㅻ뜑 3媛?異붽?**

`backend/src/lib/imap.ts:210-249`(`ParsedFetchLine` ?명꽣?섏씠?ㅻ???`parseHeaderFields`源뚯?)? `backend/src/lib/imap.ts:368-394`(`mapFetchLinesToMails`)???댁슜??洹몃?濡?媛?몄? ?꾨옒泥섎읆 ???뚯씪??留뚮뱺??

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

// References/Message-ID/In-Reply-To ?ㅻ뜑??<local@domain> ?뺤떇 ??爰얠뇿愿꾪샇瑜?踰쀪꺼???쒖닔 id濡?留욎텣??
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
      subject: decodeRfc2047(subject) || "(?쒕ぉ ?놁쓬)",
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

- [x] **Step 4: ?뚯뒪???듦낵 ?뺤씤**

Run: `npx vitest run src/lib/imap-parse.test.ts`
Expected: PASS (3 tests)

- [x] **Step 5: `imap.ts`媛 ??紐⑤뱢???곕룄濡?援먯껜**

`backend/src/lib/imap.ts:210-249`(`ParsedFetchLine` ?명꽣?섏씠??~ `parseHeaderFields` ?⑥닔 ?꾩껜)? `backend/src/lib/imap.ts:368-394`(`mapFetchLinesToMails` ?⑥닔 ?꾩껜)瑜?**??젣**?쒕떎.

`backend/src/lib/imap.ts:3`??import瑜?

```ts
import { decodeRfc2047, embedInlineMimeImages, extractMimeAttachment, listMimeAttachments, parseAddressList, parseFromHeader, parseHeaderBlock, parseMimeMessage, sanitizeHtml, stripHtml } from "./mime"
```

濡??좎??섎릺(???뚯씪? `parseHeaderBlock`/`parseFromHeader`/`decodeRfc2047`??`imapGetMailDetail` ???ㅻⅨ 怨녹뿉???ъ쟾??吏곸젒 ?곕?濡?洹몃?濡??붾떎), 諛붾줈 ?꾨옒 以꾩뿉 異붽?:

```ts
import { mapFetchLinesToMails, parseFetchLine, parseInternalDate } from "./imap-parse"
```

- [x] **Step 6: FETCH 紐낅졊???ㅻ뜑 ?꾨뱶 ?뺤옣 (3怨?**

`backend/src/lib/imap.ts`?먯꽌 `HEADER.FIELDS (FROM SUBJECT)`媛 ?섏삤??3怨녹쓣 ?꾨? `HEADER.FIELDS (FROM SUBJECT MESSAGE-ID REFERENCES IN-REPLY-TO)`濡?諛붽씔??

1. `fetchMailPageFromSelected` ??(?먮옒 line ~350):
```ts
  const fetchResult = await client.command(
    `FETCH ${start}:${end} (UID FLAGS INTERNALDATE BODY.PEEK[HEADER.FIELDS (FROM SUBJECT MESSAGE-ID REFERENCES IN-REPLY-TO)])`,
  )
```

2. `imapSearchInbox` ??(?먮옒 line ~445):
```ts
    const fetchResult = await client.command(
      `UID FETCH ${targetUids.join(",")} (UID FLAGS INTERNALDATE BODY.PEEK[HEADER.FIELDS (FROM SUBJECT MESSAGE-ID REFERENCES IN-REPLY-TO)])`,
    )
```

3. `imapFetchByUids` ??(?먮옒 line ~476):
```ts
    const fetchResult = await client.command(
      `UID FETCH ${uids.join(",")} (UID FLAGS INTERNALDATE BODY.PEEK[HEADER.FIELDS (FROM SUBJECT MESSAGE-ID REFERENCES IN-REPLY-TO)])`,
    )
```

- [x] **Step 7: ??낆껜??+ ?꾩껜 ?뚯뒪??*

Run: `npx tsc --noEmit && npx vitest run`
Expected: ????먮윭 ?놁쓬, 紐⑤뱺 ?뚯뒪??PASS (`imap-parse.test.ts` 3媛??ы븿 ???뚯씪???꾨?)

- [x] **Step 8: 而ㅻ컠**

```bash
git add backend/src/lib/imap-parse.ts backend/src/lib/imap-parse.test.ts backend/src/lib/imap.ts
git commit -m "refactor: extract IMAP FETCH parsing into imap-parse.ts and read threading headers"
```

---

## Task 3: ?꾨윴?몄뿏??vitest ?ㅼ젙 + ?ㅻ젅??洹몃９???뚭퀬由ъ쬁

**Files:**
- Modify: `frontend/package.json` (devDependency + script)
- Create: `frontend/vitest.config.ts`
- Modify: `frontend/src/types/mail.ts` (`Mail` ?명꽣?섏씠??
- Create: `frontend/src/lib/threading.ts`
- Create: `frontend/src/lib/threading.test.ts`

**Interfaces:**
- Produces: `export function groupIntoThreads(mails: Mail[]): Mail[][]`

?꾨윴?몄뿏?쒖뿏 吏湲?vitest媛 ?꾪? ?녿떎 (?뚯뒪???뚯씪 0媛? devDependency?먮룄 ?놁쓬). `groupIntoThreads`??union-find濡??ｌ?耳?댁뒪媛 留롮? ?쒖닔 ?⑥닔???좊떅?뚯뒪??媛移섍? 而ㅼ꽌, ???묒뾽??泥??④퀎濡?理쒖냼 ?ㅼ젙留?異붽??쒕떎 (jsdom/而댄룷?뚰듃 ?뚯뒪???꾧뎄???대쾲 踰붿쐞???놁쓬 ???쒖닔 ?⑥닔 ?뚯뒪?몄뿉???꾩슂 ?녿떎).

- [x] **Step 1: vitest devDependency + ?ㅽ겕由쏀듃 異붽?**

`frontend/package.json`??`"scripts"`??異붽?:

```json
    "test": "vitest run",
```

`"devDependencies"`??異붽?:

```json
    "vitest": "^4.1.10",
```

Run (frontend ?붾젆?곕━?먯꽌): `npm install`

- [x] **Step 2: vitest ?ㅼ젙 ?뚯씪 ?앹꽦**

`frontend/vitest.config.ts` ?좎꽕:

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

- [x] **Step 3: `Mail` ??낆뿉 ?ㅻ젅???꾨뱶 異붽?**

`frontend/src/types/mail.ts`??`folderIds?: string[]` ?ㅼ쓬 以꾩뿉 異붽? (諛깆뿏??`Mail`怨??숈씪???꾨뱶):

```ts
  threadId?: string
  messageId?: string
  references?: string[]
  inReplyTo?: string
```

- [x] **Step 4: ?ㅽ뙣?섎뒗 ?뚯뒪???묒꽦**

`frontend/src/lib/threading.test.ts` ?좎꽕:

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
    expect(grouped.map((m) => m.id)).toEqual(["1", "2"]) // ?ㅻ옒??寃???理쒖떊 ??  })

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

- [x] **Step 5: ?뚯뒪???ㅽ뙣 ?뺤씤**

Run: `npx vitest run src/lib/threading.test.ts`
Expected: FAIL ??`Cannot find module './threading'`

- [x] **Step 6: `groupIntoThreads` 援ы쁽**

`frontend/src/lib/threading.ts` ?좎꽕:

```ts
import type { Mail } from "@/types/mail"

// Union-Find (寃쎈줈 ?뺤텞留?????洹쒕え??硫붿씪?⑥뿉????겕源뚯? ?꾩슂 ?녿떎)
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

// Gmail? accountId+threadId濡? IMAP? 怨꾩젙 ?덉뿉??messageId/references/inReplyTo 泥댁씤?쇰줈 臾띕뒗??
// 怨꾩젙 寃쎄퀎???덈? ?섏? ?딅뒗????accountId瑜?紐⑤뱺 ?몃뱶 ?ㅼ뿉 ?묐몢?대줈 ?ｌ뼱 媛뺤젣?쒕떎.
export function groupIntoThreads(mails: Mail[]): Mail[][] {
  const ds = new DisjointSet()
  const nodeKeyOf = (mail: Mail): string => {
    if (mail.threadId) return `${mail.accountId} thread:${mail.threadId}`
    if (mail.messageId) return `${mail.accountId} msg:${mail.messageId}`
    return `${mail.accountId} mail:${mail.id}`
  }

  for (const mail of mails) {
    const key = nodeKeyOf(mail)
    ds.groupOf(key) // ?몃뱶瑜??깅줉?대몦??(union ?몄텧???녿뒗 ?⑤룆 硫붿씪??洹몃９???앷린?꾨줉)

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

- [x] **Step 7: ?뚯뒪???듦낵 ?뺤씤**

Run: `npx vitest run src/lib/threading.test.ts`
Expected: PASS (6 tests)

- [x] **Step 8: ??낆껜??+ 鍮뚮뱶**

Run: `npx tsc -b && npm run build`
Expected: ?먮윭 ?놁쓬

- [x] **Step 9: 而ㅻ컠**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.ts frontend/src/types/mail.ts frontend/src/lib/threading.ts frontend/src/lib/threading.test.ts
git commit -m "feat: add frontend vitest + thread grouping algorithm"
```

---

## Task 4: MailList ???ㅻ젅???⑥쐞 ?뚮뜑留?
**Files:**
- Modify: `frontend/src/components/mail/mail-list.tsx`

**Interfaces:**
- Consumes: `groupIntoThreads(mails: Mail[]): Mail[][]` (Task 3)

湲곗〈 `checkedIds`/`onToggleCheck`/`onCheckRange`/`onSelectMail` prop ??낆? ?꾪? ??諛붾먮떎 ??洹몃９ ?⑥쐞 泥댄겕/?좏깮? ?대? ?덈뒗 ?⑥씪-id 肄쒕갚???щ윭 踰??몄텧?섎뒗 ?앹쑝濡?而댄룷?뚰듃 ?대??먯꽌留?泥섎━?쒕떎.

- [x] **Step 1: `groupThreads` prop 異붽? + import**

`frontend/src/components/mail/mail-list.tsx:1-8`??import 釉붾줉??異붽?:

```ts
import { groupIntoThreads } from "@/lib/threading"
```

`MailListProps` ?명꽣?섏씠??`interface MailListProps { ... }`)??異붽? (留덉?留??꾨뱶 `onLoadMore?: () => void` ?ㅼ쓬 以?:

```ts
  // ?듭옣 泥댁씤???섎굹????붾줈 臾띠뼱??蹂댁뿬以꾩?. 寃??寃곌낵 ?붾㈃?먯꽌??false濡??섏뼱?⑤떎.
  groupThreads?: boolean
```

- [x] **Step 2: 而댄룷?뚰듃 ?쒓렇?덉쿂??湲곕낯媛?異붽? + 洹몃９ 怨꾩궛**

`export function MailList({ ... }: MailListProps) {`??destructure??異붽?:

```ts
  groupThreads = true,
```

而댄룷?뚰듃 蹂몃Ц 理쒖긽??`const [filterOpen, setFilterOpen] = useState(false)` ????異붽?:

```ts
  const groups = groupThreads ? groupIntoThreads(mails) : mails.map((mail) => [mail])
```

- [x] **Step 3: ?꾩껜?좏깮/遺遺꾩꽑???먯젙??洹몃９ 湲곗??쇰줈**

`const allChecked = mails.length > 0 && mails.every((m) => checkedIds.has(m.id))`瑜??꾨옒濡?援먯껜 (紐⑤뱺 硫붿씪??泥댄겕?섏뼱 ?덉뼱???꾩껜?좏깮 ???섎???洹몃?濡? `mails` ???洹몃?濡?`mails` ?⑤룄 ?섏?留?洹몃９ ?뚮뜑留곴낵 ?쇨??섍쾶 ?좎?):

??以꾩? 洹몃?濡??붾떎 (`mails` 湲곗? ?꾩껜?좏깮 ?먯젙? 洹몃９???щ?? 臾닿??섍쾶 ?뺥솗?섎떎 ??蹂寃??놁쓬).

- [x] **Step 4: ?뚮뜑留?猷⑦봽瑜?洹몃９ ?⑥쐞濡?援먯껜**

`{mails.map((mail, index) => {` (?먮옒 line ~278)遺??洹?釉붾줉???앸굹??`})}` (?먮옒 line ~397, `{hasMore && (` 諛붾줈 ??源뚯? ?꾩껜瑜??꾨옒濡?援먯껜:

```tsx
          {groups.length === 0 && (
            <p className="text-muted-foreground p-6 text-sm">硫붿씪???놁뒿?덈떎.</p>
          )}
          {groups.map((group, index) => {
            const mail = group[group.length - 1] // 洹몃９ ???= 理쒖떊 硫붿씪
            const groupIds = group.map((m) => m.id)
            const isChecked = groupIds.every((id) => checkedIds.has(id))

            // shift 踰붿쐞?좏깮?대㈃ true瑜?諛섑솚???몄텧遺媛 蹂꾨룄 泥섎━瑜?嫄대꼫?곌쾶 ?쒕떎.
            const trySelectRange = (e: React.MouseEvent): boolean => {
              if (!e.shiftKey || !anchorId) return false
              const anchorIndex = groups.findIndex((g) => g[g.length - 1].id === anchorId)
              if (anchorIndex === -1) return false
              const [start, end] = anchorIndex < index ? [anchorIndex, index] : [index, anchorIndex]
              onCheckRange(groups.slice(start, end + 1).flatMap((g) => g.map((m) => m.id)))
              setAnchorId(mail.id)
              return true
            }

            // 洹몃９ 泥댄겕諛뺤뒪????긽 "?꾨? 耳쒓린" ?먮뒗 "?꾨? ?꾧린"濡?洹寃곕릺?꾨줉, 紐⑺몴 ?곹깭? ?ㅻⅨ
            // 硫ㅻ쾭留?怨⑤씪 湲곗〈 ?⑥씪-id ?좉????몄텧?쒕떎 (洹몃９ ?꾩슜 肄쒕갚???덈줈 異붽??섏? ?딅뒗??.
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
                      aria-label={isChecked ? "?좏깮 ?댁젣" : "?좏깮"}
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
                    aria-label={mail.isStarred ? "蹂꾪몴 ?댁젣" : "蹂꾪몴 異붽?"}
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

- [x] **Step 5: ??낆껜??+ 鍮뚮뱶**

Run (frontend ?붾젆?곕━?먯꽌): `npx tsc -b && npm run build`
Expected: ?먮윭 ?놁쓬 (???쒖젏?먯꽑 `groupThreads`瑜??꾩쭅 ?꾨Т??`false`濡??섍린吏 ?딆쑝誘濡???긽 洹몃９??耳쒖쭊 梨꾨줈 ?숈옉 ??App.tsx ?곌껐? Task 7?먯꽌)

- [x] **Step 6: 而ㅻ컠**

```bash
git add frontend/src/components/mail/mail-list.tsx
git commit -m "feat: group thread replies into a single row in MailList"
```

---

## Task 5: MessageCard 異붿텧 (?숈옉 蹂???녿뒗 由ы뙥??

**Files:**
- Create: `frontend/src/components/mail/message-card.tsx`
- Modify: `frontend/src/components/mail/mail-detail.tsx`

**Interfaces:**
- Produces: `export interface MessageCardProps`, `export function MessageCard(props: MessageCardProps)`

???쒖뒪?щ뒗 **?숈옉???섎굹??諛붽씀吏 ?딅뒗??* ??`mail-detail.tsx`???ㅻ뜑/?대컮/泥⑤?/蹂몃Ц ?뚮뜑留곸쓣 洹몃?濡?`message-card.tsx`濡???린怨? `MailDetail`? 洹?而댄룷?뚰듃瑜?洹몃?濡??몄텧留??섎룄濡?留뚮뱺?? ?ㅼ쓬 ?쒖뒪??6)?먯꽌 ??移대뱶瑜??ㅻ젅???꾩퐫?붿뼵???대떎.

- [x] **Step 1: `message-card.tsx` ?앹꽦 ??湲곗〈 ?ㅻ뜑+蹂몃Ц JSX瑜?洹몃?濡???릿??*

`frontend/src/components/mail/mail-detail.tsx`?먯꽌 ?ㅼ쓬??洹몃?濡?媛?몄삩??
- 理쒖긽??import 以???移대뱶媛 ?ㅼ젣濡??곕뒗 寃껊뱾: `Archive, Check, Clock, Download, Eye, Folder, FolderInput, Forward, Inbox, MailOpen, Paperclip, Reply, ReplyAll, Star, Trash2, VolumeX` (lucide-react), `Badge`, `Button`, `ProviderIcon`, `SenderIcon`, `AttachmentPreview, isPreviewableAttachment`, `attachmentDownloadUrl, inlineAttachmentUrl`, `cn`, `ARCHIVE_FOLDER_ID`, `Account, Mail, MailAttachment, MailFolder`
- ?ы띁 ?⑥닔: `formatFullDate`, `formatFileSize`, `buildIframeDoc`, `LinkifiedText` (?먮옒 `mail-detail.tsx:69-127`)
- `getSnoozeOptions` (?먮옒 `mail-detail.tsx:36-67`)
- `mail-detail.tsx:214-478`??return 釉붾줉 ?꾩껜(鍮꾩뼱?덉? ?딆쓣 ?뚯쓽 JSX ???ㅻ뜑 ?대컮 + 泥⑤? + Separator + 蹂몃Ц)?, 洹?釉붾줉???곕뒗 state(`moveOpen`, `moveRef`, `snoozeOpen`, `snoozeRef`, `previewAttachment`)? ??媛쒖쓽 click-outside `useEffect`(?먮옒 155-171)

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
    opts.push({ label: "?ㅻ뒛 ?ㅽ썑 5??, subtitle: "?ㅻ뒛 ??곸뿉 ?ㅼ떆", until: today5pm.getTime() })
  }

  const tomorrow9am = new Date(today.getTime() + 25 * 3600_000)
  tomorrow9am.setHours(9, 0, 0, 0)
  tomorrow9am.setDate(today.getDate() + 1)
  opts.push({ label: "?댁씪 ?ㅼ쟾 9??, subtitle: "?댁씪 ?꾩묠???ㅼ떆", until: tomorrow9am.getTime() })

  const dow = now.getDay()
  const daysToSat = ((6 - dow) + 7) % 7 || 7
  const sat = new Date(today.getTime())
  sat.setDate(today.getDate() + daysToSat)
  sat.setHours(9, 0, 0, 0)
  if (sat.getTime() > tomorrow9am.getTime()) {
    opts.push({ label: "?대쾲 二??좎슂??, subtitle: "二쇰쭚???ㅼ떆", until: sat.getTime() })
  }

  const daysToMon = ((8 - dow) % 7) || 7
  const mon = new Date(today.getTime())
  mon.setDate(today.getDate() + daysToMon)
  mon.setHours(9, 0, 0, 0)
  opts.push({ label: "?ㅼ쓬 二??붿슂??, subtitle: "?ㅼ쓬 二쇱뿉 ?ㅼ떆", until: mon.getTime() })

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
              <Button variant="ghost" size="icon" className="size-8" title="?듭옣" onClick={() => onReply(mail)}>
                <Reply className="size-4" />
              </Button>
            )}
            {onReplyAll && (
              <Button variant="ghost" size="icon" className="size-8" title="?꾩껜?듭옣" onClick={() => onReplyAll(mail)}>
                <ReplyAll className="size-4" />
              </Button>
            )}
            {onForward && (
              <Button variant="ghost" size="icon" className="size-8" title="?꾨떖" onClick={() => onForward(mail)}>
                <Forward className="size-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              title={mail.isRead ? "?쎌? ?딆쓬?쇰줈 ?쒖떆" : "?대? ?쎌? ?딆? 硫붿씪"}
              onClick={() => onMarkAsUnread?.(mail.id, mail.accountId)}
              disabled={!mail.isRead}
            >
              <MailOpen className="size-4" />
            </Button>
            <button
              type="button"
              onClick={() => onToggleStar?.(mail.id, mail.accountId, !mail.isStarred)}
              className="hover:bg-accent flex size-8 items-center justify-center rounded-md transition-colors"
              aria-label={mail.isStarred ? "蹂꾪몴 ?댁젣" : "蹂꾪몴 異붽?"}
              title={mail.isStarred ? "蹂꾪몴 ?댁젣" : "蹂꾪몴 異붽?"}
            >
              <Star className={mail.isStarred ? "size-4 fill-amber-400 text-amber-400" : "size-4 text-muted-foreground"} />
            </button>
            {onArchive && (
              <Button variant="ghost" size="icon" className="size-8" title="蹂닿?" onClick={() => onArchive(mail.id, mail.accountId)}>
                <Archive className="size-4" />
              </Button>
            )}
            {(onMove || onToggleFolder) && (
              <div ref={moveRef} className="relative">
                <Button variant="ghost" size="icon" className="size-8" title="遺꾨쪟 硫붿씪?⑥쑝濡??대룞" onClick={() => setMoveOpen((v) => !v)}>
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
                          蹂닿??⑥뿉??爰쇰궡湲?                        </button>
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
                      <p className="text-muted-foreground px-3 py-1.5 text-xs">遺꾨쪟 硫붿씪?⑥씠 ?놁뒿?덈떎.</p>
                    )}
                  </div>
                )}
              </div>
            )}
            {onSnooze && (
              <div ref={snoozeRef} className="relative">
                <Button variant="ghost" size="icon" className="size-8" title="?ㅻ늻利? onClick={() => setSnoozeOpen((v) => !v)}>
                  <Clock className="size-4" />
                </Button>
                {snoozeOpen && (
                  <div className="bg-background absolute top-full right-0 z-20 mt-1 min-w-[160px] rounded-md border shadow-md">
                    <p className="text-muted-foreground px-3 pt-2 pb-1 text-xs">?섏쨷???ㅼ떆 蹂닿린</p>
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
                title={isMuted ? "裕ㅽ듃 ?댁젣" : "??諛쒖떊??裕ㅽ듃"}
                onClick={() => onMute(mail.fromEmail)}
              >
                <VolumeX className="size-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="hover:text-destructive size-8" title="??젣" onClick={() => onDelete?.(mail.id, mail.accountId)}>
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

(?먮옒 ?덈뜕 `Separator` import/?ъ슜怨?濡쒕뵫 ?ㅼ펷?덊넠? ??린吏 ?딆븯????`Separator`???ㅻ뜑? 蹂몃Ц ?ъ씠 援щ텇?좎씠??移대뱶 ?대??먮룄 ?ъ쟾???꾩슂?섎?濡? ???ㅻ뜑 `<div>`??`border-b` ?대옒?ㅺ? 洹???븷????좏븳?? 濡쒕뵫 ?ㅼ펷?덊넠? `MailDetail`???ㅻ젅???꾩껜 ?⑥쐞濡?怨꾩냽 媛뽯뒗????Step 2?먯꽌 泥섎━.)

- [x] **Step 2: `mail-detail.tsx`瑜?`MessageCard`瑜?媛먯떥???뉗? ?섑띁濡?異뺤냼**

`frontend/src/components/mail/mail-detail.tsx` ?꾩껜瑜??꾨옒濡?援먯껜 (湲곗〈 `MailDetailProps`??`mail: Mail | null`? 洹몃?濡??먭퀬, ?대쾲 ?ㅽ뀦?먯꽌???꾩쭅 ?ㅻ젅?쒓? ?꾨땲???⑥씪 硫붿씪??諛곗뿴 ?섎굹吏쒕━濡쒕쭔 媛먯떬????吏꾩쭨 ?ㅼ쨷 硫붿떆吏 ?꾩퐫?붿뼵? Task 6):

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
      紐⑸줉?쇰줈
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
              alt="?덈뱾??硫붿씪???섎Ⅴ???덉쭛"
              className="h-auto w-[min(25rem,78vw)] select-none"
              draggable={false}
            />
            <div className="-mt-3 flex flex-col items-center">
              <h2 className="text-foreground text-xl font-bold tracking-tight sm:text-2xl">
                硫붿씪???좏깮???댁슜???뺤씤?섏꽭??              </h2>
              <p className="text-muted-foreground mt-2 text-sm sm:text-base">
                ?щ윭 怨꾩젙??硫붿씪????怨녹뿉??愿由ы븷 ???덉뼱??
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
                <span className="text-sm font-medium sm:text-base">?쇱そ?먯꽌 硫붿씪???좏깮?대낫?몄슂!</span>
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

二쇱쓽: `rest`??`accounts`媛 ?ы븿?섎룄濡? 援ъ“遺꾪빐?먯꽌 `accounts`瑜?紐낆떆?곸쑝濡?爰쇰궡吏 留먭퀬 `...rest`濡??섏뼱媛寃??붾떎 (`MessageCardProps`媛 `accounts`瑜??붽뎄?섎?濡?.

- [x] **Step 3: import ?뺤씤**

`mail-detail.tsx`???댁젣 ??而댄룷?뚰듃 ?덉뿉??React ?낆쓣 吏곸젒 ?곗? ?딆쑝誘濡?`"react"`?먯꽌 ?꾨Т寃껊룄 import?섏? ?딅뒗??(??援먯껜蹂몄씠 ?대? 洹몃젃寃??섏뼱 ?덉쓬 ??Task 6?먯꽌 `useState`媛 ?ㅼ떆 ?꾩슂?댁쭊??.

- [x] **Step 4: ??낆껜??+ 鍮뚮뱶**

Run (frontend ?붾젆?곕━?먯꽌): `npx tsc -b && npm run build`
Expected: ?먮윭 ?놁쓬 (App.tsx???꾩쭅 ?먮?吏 ?딆븯?쇰?濡?湲곗〈 `mail={selectedMail}` prop 洹몃?濡?而댄뙆?쇰릺?댁빞 ??

- [x] **Step 5: 濡쒖뺄?먯꽌 ?숈옉 蹂???녿뒗吏 ?섎룞 ?뺤씤**

Run: `npx vite --port 5183` (frontend ?붾젆?곕━) + ?대? 濡쒓렇?몃맂 釉뚮씪?곗? ?몄뀡?먯꽌 硫붿씪 ?섎굹 ?댁뼱 ?ㅻ뜑/蹂몃Ц/泥⑤?/?듭옣쨌蹂닿?쨌?대룞쨌?ㅻ늻利댟룸???踰꾪듉??由ы뙥???꾧낵 ?숈씪?섍쾶 蹂댁씠怨??숈옉?섎뒗吏 ?뺤씤.

- [x] **Step 6: 而ㅻ컠**

```bash
git add frontend/src/components/mail/message-card.tsx frontend/src/components/mail/mail-detail.tsx
git commit -m "refactor: extract MessageCard out of MailDetail (no behavior change)"
```

---

## Task 6: MailDetail ???ㅻ젅???꾩퐫?붿뼵

**Files:**
- Modify: `frontend/src/components/mail/mail-detail.tsx`

**Interfaces:**
- Consumes: `MessageCard`, `MessageCardProps` (Task 5)
- Produces: `MailDetailProps.thread: Mail[] | null` (湲곗〈 `mail: Mail | null` ?泥?, `MailDetailProps.mutedSet: Set<string>` (湲곗〈 `isMuted: boolean` ?泥?

- [x] **Step 1: props瑜?`mail` ??`thread`, `isMuted` ??`mutedSet`?쇰줈 援먯껜**

`frontend/src/components/mail/mail-detail.tsx`??`MailDetailProps`?먯꽌:

```ts
  mail: Mail | null
```

```ts
  thread: Mail[] | null
```

濡? 洹몃━怨?

```ts
  isMuted?: boolean
```

```ts
  mutedSet?: Set<string>
```

濡?諛붽씔??

- [x] **Step 2: 而댄룷?뚰듃 蹂몃Ц???ㅻ젅???꾩퐫?붿뼵?쇰줈 援먯껜**

`export function MailDetail({ mail, isLoadingBody, onBack, ...rest }: MailDetailProps) {` ?댄븯 ?⑥닔 ?꾩껜瑜??꾨옒濡?援먯껜:

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
  // thread媛 諛붾??뚮쭏???ㅻⅨ ??붾? ???뚮쭏?? ??而댄룷?뚰듃媛 ??key濡??ㅼ떆 留덉슫?몃릺誘濡?
  // expandedIds????긽 "?덈줈 ???ㅻ젅?쒕뒗 理쒖떊 硫붿씪留??쇱묠"?쇰줈 珥덇린?붾맂??
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
              alt="?덈뱾??硫붿씪???섎Ⅴ???덉쭛"
              className="h-auto w-[min(25rem,78vw)] select-none"
              draggable={false}
            />
            <div className="-mt-3 flex flex-col items-center">
              <h2 className="text-foreground text-xl font-bold tracking-tight sm:text-2xl">
                硫붿씪???좏깮???댁슜???뺤씤?섏꽭??              </h2>
              <p className="text-muted-foreground mt-2 text-sm sm:text-base">
                ?щ윭 怨꾩젙??硫붿씪????怨녹뿉??愿由ы븷 ???덉뼱??
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
                <span className="text-sm font-medium sm:text-base">?쇱そ?먯꽌 硫붿씪???좏깮?대낫?몄슂!</span>
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

`useState`瑜??댁젣 ?ㅼ떆 ?곕?濡??뚯씪 留???泥?import 以?????異붽??쒕떎:

```ts
import { useState } from "react"
```

- [x] **Step 3: ??낆껜??*

Run: `npx tsc -b`
Expected: `App.tsx`?먯꽌 ?먮윭 諛쒖깮 ??`mail`/`isMuted` prop???꾩쭅 ?섍린怨??덉쓬 (Task 7?먯꽌 怨좎묠). ???쒖뒪?ъ뿉?쒕뒗 `mail-detail.tsx` ?먯껜?먮뒗 ????먮윭媛 ?녿뒗吏留??뺤씤?쒕떎: `npx tsc -b 2>&1 | grep mail-detail.tsx` ??異쒕젰 ?놁쓬?댁뼱????

- [x] **Step 4: 而ㅻ컠**

```bash
git add frontend/src/components/mail/mail-detail.tsx
git commit -m "feat: render MailDetail as a thread accordion of MessageCards"
```

(App.tsx媛 ?꾩쭅 ??prop???섍린怨??덉뼱 ???쒖젏??`main`? 鍮뚮뱶媛 源⑥쭊 ?곹깭 ??Task 7?먯꽌 諛붾줈 ?댁뼱??怨좎튇?? ??怨꾪쉷??subagent-driven?쇰줈 ?ㅽ뻾?쒕떎硫?Task 6/7????由щ럭 ?ъ씠?대줈 臾띕뒗 嫄?沅뚯옣.)

---

## Task 7: App.tsx ???ㅻ젅??怨꾩궛/?꾨━?섏튂 ?곌껐

**Files:**
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `groupIntoThreads` (Task 3), `MailList`??`groupThreads?: boolean` (Task 4), `MailDetail`??`thread`/`mutedSet` props (Task 6)

- [x] **Step 1: import 異붽?**

`frontend/src/App.tsx`??import 釉붾줉??異붽?:

```ts
import { groupIntoThreads } from "@/lib/threading"
```

- [x] **Step 2: `selectedThread` 怨꾩궛 異붽?**

`const selectedMailStub = ...` 釉붾줉(湲곗〈) 諛붾줈 ?ㅼ쓬??異붽?:

```ts
  // ?곸꽭 ?⑤꼸???섍만 ?ㅻ젅????visibleMails(諛쏆??몄???以묒슂硫붿씪) ?곗꽑, ?놁쑝硫?folderMails(遺꾨쪟??
  // 蹂닿????댁??? ?쒖쑝濡?李얜뒗?? selectedMailStub怨??숈씪???곗꽑?쒖쐞瑜?洹몃?濡??곕Ⅸ??
  const selectedThread = useMemo(() => {
    if (!selectedMailStub) return null
    const fromVisible = groupIntoThreads(visibleMails).find((t) => t.some((m) => m.id === selectedMailStub.id))
    if (fromVisible) return fromVisible
    const fromFolder = groupIntoThreads(workspace.folderMails).find((t) => t.some((m) => m.id === selectedMailStub.id))
    if (fromFolder) return fromFolder
    return [selectedMailStub]
  }, [visibleMails, workspace.folderMails, selectedMailStub])
```

- [x] **Step 3: ?곸꽭 fetch ?댄럺?몃? ?ㅻ젅???꾩껜濡??뺤옣**

湲곗〈:

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

瑜??꾨옒濡?援먯껜 (?ㅻ젅?쒕? ?대㈃ ?ㅻ젅???덉쓽 紐⑤뱺 硫붿씪 蹂몃Ц???쒓볼踰덉뿉 誘몃━ 遺덈윭?⑤떎 ???섏쨷??媛쒕퀎 硫붿떆吏瑜??쇱튌 ??異붽?濡?fetch???꾩슂媛 ?놁뼱吏꾨떎):

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

- [x] **Step 4: `isLoadingDetail`???ㅻ젅???꾩껜 湲곗??쇰줈 ?쇰컲??*

湲곗〈:

```ts
  const isLoadingDetail =
    selectedMailStub !== null &&
    isRealAccountId(selectedMailStub.accountId) &&
    !workspace.mailDetails[selectedMailStub.id]
```

瑜?

```ts
  const isLoadingDetail =
    selectedThread !== null &&
    selectedThread.some((m) => isRealAccountId(m.accountId) && !workspace.mailDetails[m.id])
```

濡?援먯껜. `selectedMail`(?⑥씪 硫붿씪, ?ㅻ낫???⑥텞?ㅼ슜) 怨꾩궛遺??**洹몃?濡??붾떎** ??`mail-list.tsx`??J/K/Backspace/R/S/U ?⑥텞?ㅺ? ?ъ쟾??"?꾩옱 ?좏깮??硫붿씪 ??????湲곗??쇰줈 ?숈옉?댁빞 ?섎?濡??닿굔 嫄대뱶由ъ? ?딅뒗??

- [x] **Step 5: ?ㅻ젅???곸꽭 ?곗씠??merge) 怨꾩궛 異붽?**

`isLoadingDetail` ?좎뼵 諛붾줈 ?ㅼ쓬??異붽?:

```ts
  // ?대? ?곸꽭媛 濡쒕뱶??硫붿씪? workspace.mailDetails濡???뼱?⑥꽌(bodyHtml/attachments ?ы븿)
  // MailDetail???섍릿?? ?꾩쭅 ??遺덈윭?吏?硫붿씪? 由ъ뒪?몄뿉?????ㅽ뀅 洹몃?濡??섏뼱媛꾨떎 ??  // isLoadingDetail??true???숈븞? MailDetail???ㅼ펷?덊넠??蹂댁뿬二쇰?濡??붾㈃????蹂댁씤??
  const threadWithDetails = selectedThread?.map((m) => workspace.mailDetails[m.id] ?? m) ?? null
```

- [x] **Step 6: `MailDetail` ???몄텧遺 援먯껜**

`mailDetailPane`怨?`folderDetailPane` ?? 媛곴컖??`<MailDetail ... />` ?몄텧?먯꽌:

```tsx
      mail={selectedMail}
```

瑜?

```tsx
      thread={threadWithDetails}
```

濡?援먯껜. 洹몃━怨?`mailDetailPane`??`<MailDetail>`?먮쭔 ?덈뒗:

```tsx
      isMuted={!!selectedMailStub && mailOrg.mutedSet.has(selectedMailStub.fromEmail)}
```

以꾩쓣 ??젣?섍퀬, ?????`<MailDetail>` ?몄텧遺 紐⑤몢???ㅼ쓬 以꾩쓣 異붽?:

```tsx
      mutedSet={mailOrg.mutedSet}
```

- [x] **Step 7: 寃??以묒뿏 洹몃９???꾧린**

`mailListPane`(`const mailListPane = (...)`) ?덉쓽 `<MailList ... />` ?몄텧??prop 異붽?:

```tsx
      groupThreads={!workspace.searchQuery}
```

(`folderListPane`? 寃??媛쒕뀗???놁쑝誘濡??먮?吏 ?딅뒗????`groupThreads` 湲곕낯媛?`true`媛 洹몃?濡??곸슜?쒕떎.)

- [x] **Step 8: J/K ?ㅻ낫???먯깋??洹몃９ ??쒕쭔 媛由ы궎?꾨줉 ?섏젙**

`MailList`???댁젣 洹몃９?????理쒖떊) 硫붿씪 id濡쒕쭔 DOM ??`id="mail-row-<id>"`)???뚮뜑留곹븳??(Task 4). 洹몃윴??J/K ?ㅻ낫???먯깋??`activeList`??吏湲?`visibleMails`/`workspace.folderMails`瑜?洹몃?濡?媛쒕퀎 硫붿씪 ?⑥쐞濡? ?곌퀬 ?덉뼱?? ?ㅻ젅?쒖뿉 臾띠뿬 ?묓엺 硫붿씪濡??ъ빱?ㅺ? ?대룞?섎㈃ ?대떦 `mail-row-<id>` DOM??議댁옱?섏? ?딆븘 `scrollIntoView`媛 議곗슜???ㅽ뙣?쒕떎.

`App.tsx`???⑥텞??`useEffect` ?? ?ㅼ쓬 以꾩쓣:

```ts
    const activeList = view === "folder" || view === "archive" ? workspace.folderMails : view === "inbox" || view === "starred" ? visibleMails : []
```

?꾨옒濡?援먯껜:

```ts
    const activeList = (
      view === "folder" || view === "archive"
        ? groupIntoThreads(workspace.folderMails)
        : view === "inbox" || view === "starred"
          ? groupIntoThreads(visibleMails)
          : []
    ).map((group) => group[group.length - 1])
```

`activeList`????낆? ?ъ쟾??`Mail[]`?대씪(洹몃９ ??쒕뱾??諛곗뿴) ???꾨옒?먯꽌 `activeList`瑜??곕뒗 `moveFocus`/Enter/Backspace/R/S/U ?몃뱾??肄붾뱶???꾪? ??諛붽퓭???쒕떎.

- [x] **Step 9: ??낆껜??+ 鍮뚮뱶**

Run (frontend ?붾젆?곕━?먯꽌): `npx tsc -b && npm run build`
Expected: ?먮윭 ?놁쓬

- [x] **Step 10: ?꾩껜 ?꾨윴???뚯뒪??+ 諛깆뿏???뚯뒪??*

Run: `npx vitest run` (frontend), `cd ../backend && npx vitest run`
Expected: ?꾨? PASS

- [x] **Step 11: 濡쒖뺄 ?섎룞 ?뺤씤**

Run: `npx wrangler dev`(backend) + `npx vite --port 5183`(frontend), ?ㅼ젣 濡쒓렇??怨꾩젙?쇰줈:
1. ?듭옣??二쇨퀬諛쏆? ???덈뒗 硫붿씪??由ъ뒪?몄뿉????以꾨줈 臾띠뿬 媛쒖닔 諛곗?媛 蹂댁씠?붿?
2. ?대┃?섎㈃ 理쒖떊 硫붿씪???쇱퀜吏?梨??섎㉧吏???묓엺 ?ㅻ뜑濡?蹂댁씠?붿?, ?묓엺 ?ㅻ뜑 ?대┃ ???쇱퀜吏?붿?
3. 寃?됱갹??萸붽? ?낅젰?섎㈃ 洹?寃곌낵??洹몃９???놁씠 媛쒕퀎 硫붿씪濡??섏삤?붿?
4. ?ㅻ젅???됱쓣 泥댄겕?댁꽌 ?쇨큵??젣/蹂닿?/?대룞 ???ㅻ젅???덉쓽 硫붿씪???꾨? ??곸씠 ?섎뒗吏
5. 由ъ뒪?몄뿉??J/K濡?硫붿씪 ?ъ씠瑜??대룞?????ㅻ젅?쒕줈 臾띠씤 ?됱뿉?쒕룄 ?ъ빱???쒖떆? ?ㅽ겕濡ㅼ씠 ?뺤긽 ?숈옉?섎뒗吏

- [x] **Step 12: 而ㅻ컠**

```bash
git add frontend/src/App.tsx
git commit -m "feat: wire thread grouping and prefetch into App.tsx"
```

