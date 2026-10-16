# ?듯빀 泥⑤???Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Gmail/?ㅼ씠踰??ㅼ쓬/踰붿슜 IMAP ??怨꾩젙?먯꽌 泥⑤??뚯씪???덈뒗 硫붿씪??紐⑥븘, 怨꾩젙/硫붿씪??援щ텇 ?놁씠 ?뚯씪紐낆쑝濡?寃?됀룸떎?대줈?쒗븷 ???덈뒗 "泥⑤??? ?붾㈃??留뚮뱺??

**Architecture:** ?됱씤????ν븯吏 ?딄퀬, ?붾㈃?????뚮쭏??怨꾩젙蹂꾨줈 理쒓렐 100?듭쓣 ?묒뼱 泥⑤??뚯씪留?異붾┛?? Gmail? `has:attachment` ?쒕쾭 寃??+ 諛곗튂 議고쉶(`format=full`)濡? IMAP(?ㅼ씠踰??ㅼ쓬/踰붿슜)? 理쒓렐 踰붿쐞???먮낯 ?꾩껜瑜????곌껐濡?媛?몄? ?대? ?덈뒗 MIME ?뚯꽌濡?異붿텧?쒕떎 ????寃쎈줈 紐⑤몢 湲곗〈 肄붾뱶瑜?理쒕????ъ궗?⑺븯怨????뚯떛 濡쒖쭅? 留뚮뱾吏 ?딅뒗?? ?꾨윴?몃뒗 ?ъ씠?쒕컮?????붾㈃ ?섎굹瑜?異붽??섍퀬, 洹??붾㈃??留덉슫?몃맆 ???ㅼ뒪濡??곗씠?곕? 媛?몄삩??App.tsx??以묒븰 `workspace`/`mailOrg` ?낆뿉 ?곹깭瑜??뱀? ?딅뒗?????먯＜ ???댁뼱蹂대뒗 ?낅┰???붾㈃?대씪 ?낆쓣 ?ㅼ슦??寃껊낫??而댄룷?뚰듃 濡쒖뺄 ?곹깭媛 ???⑥닚?섎떎).

**Tech Stack:** Cloudflare Workers + Hono (backend), React 19 + Vite (frontend), Vitest

**Spec:** `docs/superpowers/specs/2026-08-29-attachment-library-design.md`

## Global Constraints

- 怨꾩젙 ?좏삎(Gmail/IMAP)???ъ슜?먭? 吏곸젒 怨좊Ⅴ寃??섏? ?딅뒗????諛깆뿏?쒓? 怨꾩젙留덈떎 ?뚯븘??泥섎━, ?꾨윴?몃뒗 ?⑹퀜吏?紐⑸줉 ?섎굹留?蹂댁뿬以??
- 怨꾩젙??理쒓렐 100?듭쑝濡??ㅼ틪 踰붿쐞瑜??쒗븳?쒕떎 (臾댁젣???ㅼ틪 湲덉?)
- 泥⑤??뚯씪 ?ш린???뺥솗??媛믪쓣 ?대떎 (洹쇱궗移?濡쒖쭅??蹂꾨룄濡?留뚮뱾吏 ?딅뒗?????ㅽ럺 臾몄꽌??"?ㅺ퀎 以??ш??? 李멸퀬)
- ?몃씪???대?吏? ?ㅼ꺼遺?뚯씪??援щ텇?섏? ?딅뒗??(message-card.tsx??湲곗〈 ?숈옉怨??숈씪?섍쾶)
- 怨꾩젙 ?섎굹媛 ?ㅽ뙣?대룄 ?섎㉧吏 怨꾩젙 寃곌낵???뺤긽 諛섑솚?쒕떎 (議곗슜???ㅽ궢 + 肄섏넄 濡쒓렇)
- 湲곗〈 泥⑤??뚯씪 ?ㅼ슫濡쒕뱶 ?붾뱶?ъ씤??`/mail/:id/attachment/:attachmentId`)??蹂寃쏀븯吏 ?딅뒗??

---

## Task 1: 怨듭슜 ???`AttachmentListItem`

**Files:**
- Modify: `backend/src/types.ts`
- Modify: `frontend/src/types/mail.ts`

**Interfaces:**
- Produces: `AttachmentListItem` (?묒そ???숈씪???꾨뱶濡??뺤쓽)

- [x] **Step 1: 諛깆뿏?????異붽?**

`backend/src/types.ts`?먯꽌 `MailAttachment` ?명꽣?섏씠??諛붾줈 ?ㅼ쓬 以꾩뿉 異붽?:

```ts
// 泥⑤????붾㈃????怨꾩젙 ?꾩껜瑜??묒뼱???섏삩 "硫붿씪 ?섎굹 + 泥⑤??뚯씪 ?섎굹" ?됲깂?붾맂 ??ぉ.
export interface AttachmentListItem {
  accountId: string
  mailId: string
  attachmentId: string
  filename: string
  mimeType: string
  size: number
  fromName: string
  fromEmail: string
  subject: string
  receivedAt: string
}
```

- [x] **Step 2: ?꾨윴?????誘몃윭留?*

`frontend/src/types/mail.ts`?먯꽌 `MailAttachment` ?명꽣?섏씠??諛붾줈 ?ㅼ쓬 以꾩뿉 ?숈씪???댁슜 異붽?:

```ts
export interface AttachmentListItem {
  accountId: string
  mailId: string
  attachmentId: string
  filename: string
  mimeType: string
  size: number
  fromName: string
  fromEmail: string
  subject: string
  receivedAt: string
}
```

- [x] **Step 3: ??낆껜??*

Run: `cd backend && npx tsc --noEmit` / `cd frontend && npx tsc -b`
Expected: ?????먮윭 ?놁쓬 (?꾩쭅 ?꾨Т??????낆쓣 ???곕?濡?異붽?留뚯쑝濡쒕뒗 ?먮윭媛 ?????녿떎)

- [x] **Step 4: 而ㅻ컠**

```bash
git add backend/src/types.ts frontend/src/types/mail.ts
git commit -m "feat: add AttachmentListItem type for the attachment library"
```

---

## Task 2: Gmail ??怨꾩젙 ?섎굹??泥⑤??뚯씪 紐⑸줉 議고쉶

**Files:**
- Modify: `backend/src/lib/gmail.ts`
- Create: `backend/src/lib/gmail.test.ts` ?뺤옣 (湲곗〈 ?뚯씪???뚯뒪??異붽?)

**Interfaces:**
- Consumes: `AttachmentListItem` (Task 1)
- Produces: `export async function listAttachmentsForAccount(accessToken: string, accountId: string, maxResults?: number): Promise<AttachmentListItem[]>`

- [x] **Step 1: ?ㅽ뙣?섎뒗 ?뚯뒪???묒꽦**

`backend/src/lib/gmail.test.ts` 理쒖긽?⑥쓽:

```ts
import { describe, expect, it } from "vitest"
```

瑜?(???뚯뒪?멸? `afterEach`濡?`globalThis.fetch`瑜?蹂듭썝?섎?濡?:

```ts
import { afterEach, describe, expect, it } from "vitest"
```

濡?諛붽씔?? 洹몃━怨?湲곗〈 `import { mapMessageToMail, type GmailMessage } from "./gmail"` ?놁뿉 異붽?:

```ts
import { listAttachmentsForAccount } from "./gmail"

describe("listAttachmentsForAccount", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("searches has:attachment, batch-fetches format=full, and flattens attachments across messages", async () => {
    const calls: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString()
      calls.push(url)

      if (url.includes("/messages?")) {
        expect(url).toContain("q=has%3Aattachment")
        return new Response(JSON.stringify({ messages: [{ id: "m1" }, { id: "m2" }] }), { status: 200 })
      }

      // batch endpoint
      const body = await (init?.body as string)
      expect(body).toContain("format=full")
      const boundary = "batch_test"
      const partFor = (msg: {
        id: string
        threadId: string
        snippet: string
        internalDate: string
        labelIds: string[]
        payload: unknown
      }) =>
        `--${boundary}\r\nContent-Type: application/http\r\n\r\nHTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(msg)}\r\n\r\n`

      const msg1 = {
        id: "m1",
        threadId: "t1",
        snippet: "",
        internalDate: "1700000000000",
        labelIds: ["INBOX"],
        payload: {
          headers: [{ name: "From", value: "Alice <alice@example.com>" }, { name: "Subject", value: "Hi" }],
          parts: [
            { filename: "invoice.pdf", mimeType: "application/pdf", body: { attachmentId: "a1", size: 12345 } },
          ],
        },
      }
      const msg2 = {
        id: "m2",
        threadId: "t2",
        snippet: "",
        internalDate: "1700000001000",
        labelIds: ["INBOX"],
        payload: {
          headers: [{ name: "From", value: "Bob <bob@example.com>" }, { name: "Subject", value: "No attachment here" }],
          parts: [],
        },
      }
      const raw = partFor(msg1) + partFor(msg2) + `--${boundary}--`
      return new Response(raw, { status: 200, headers: { "Content-Type": `multipart/mixed; boundary=${boundary}` } })
    }) as typeof fetch

    const result = await listAttachmentsForAccount("token", "gmail:me@example.com")

    expect(calls[0]).toContain("q=has%3Aattachment")
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      accountId: "gmail:me@example.com",
      mailId: "m1",
      attachmentId: "a1",
      filename: "invoice.pdf",
      mimeType: "application/pdf",
      size: 12345,
      fromEmail: "alice@example.com",
      subject: "Hi",
    })
  })

  it("returns an empty array when the search finds no messages", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({}), { status: 200 })) as typeof fetch
    const result = await listAttachmentsForAccount("token", "gmail:me@example.com")
    expect(result).toEqual([])
  })
})
```

- [x] **Step 2: ?뚯뒪???ㅽ뙣 ?뺤씤**

Run (backend ?붾젆?곕━?먯꽌): `npx vitest run src/lib/gmail.test.ts`
Expected: FAIL ??`listAttachmentsForAccount`媛 export?섏? ?딆쓬

- [x] **Step 3: `batchGetMessages`??`format` 留ㅺ컻蹂??異붽?**

`backend/src/lib/gmail.ts:218` (`async function batchGetMessages(accessToken: string, ids: string[]): Promise<GmailMessage[]> {`)遺???쒖옉?섎뒗 ?⑥닔瑜??꾨옒濡?援먯껜:

```ts
async function batchGetMessages(accessToken: string, ids: string[], format: "metadata" | "full" = "metadata"): Promise<GmailMessage[]> {
  if (ids.length === 0) return []
  if (ids.length > GMAIL_BATCH_CHUNK_SIZE) {
    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += GMAIL_BATCH_CHUNK_SIZE) chunks.push(ids.slice(i, i + GMAIL_BATCH_CHUNK_SIZE))
    const results = await Promise.all(chunks.map((chunk) => batchGetMessages(accessToken, chunk, format)))
    return results.flat()
  }

  const boundary = `batch_${crypto.randomUUID()}`
  const body =
    ids
      .map((id, i) => {
        const path =
          format === "full"
            ? `/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`
            : `/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`
        return `--${boundary}\r\nContent-Type: application/http\r\nContent-ID: <item${i}>\r\n\r\nGET ${path}\r\n\r\n`
      })
      .join("") + `--${boundary}--`

  const res = await fetchWithRetry("https://gmail.googleapis.com/batch/gmail/v1", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/mixed; boundary=${boundary}`,
    },
    body,
  })
  if (!res.ok) throw new Error(`Gmail batch fetch failed: ${res.status}`)
  const text = await res.text()

  const responseBoundaryMatch = (res.headers.get("Content-Type") ?? "").match(/boundary=(?:"([^"]+)"|([^;]+))/)
  const responseBoundary = responseBoundaryMatch ? (responseBoundaryMatch[1] ?? responseBoundaryMatch[2]) : boundary

  const messages: GmailMessage[] = []
  for (const section of text.split(`--${responseBoundary}`)) {
    const jsonStart = section.indexOf("{")
    const jsonEnd = section.lastIndexOf("}")
    if (jsonStart === -1 || jsonEnd === -1) continue
    try {
      const parsed = JSON.parse(section.slice(jsonStart, jsonEnd + 1)) as GmailMessage
      if (parsed.id) messages.push(parsed)
    } catch {
      // ?뚯떛 ?ㅽ뙣???뚰듃??嫄대꼫?대떎 (??硫붿떆吏媛 媛쒕퀎?곸쑝濡?404 ?깆쓣 諛섑솚??寃쎌슦 ??
    }
  }
  return messages
}
```

(諛붾?遺遺? ?쒓렇?덉쿂??`format` 留ㅺ컻蹂??異붽?, ?ш? ?몄텧??`format` ?꾨떖, `path` 怨꾩궛??`format`???곕씪 遺꾧린. ?섎㉧吏???꾨? ?숈씪.)

- [x] **Step 4: `listAttachmentsForAccount` 援ы쁽**

`backend/src/types.ts`?먯꽌 `AttachmentListItem`??媛?몄삤?꾨줉 `backend/src/lib/gmail.ts:1`??import瑜?

```ts
import type { AttachmentListItem, Env, GmailAccountRecord, Mail, MailAttachment, MailCategory } from "../types"
```

濡?諛붽씀怨? `getAttachment` ?⑥닔(??554踰덉㎏ 以? `export async function getAttachment(`) 諛붾줈 ?욎뿉 異붽?:

```ts
// 泥⑤????붾㈃????has:attachment 寃?됱쑝濡??꾨낫瑜??쒕쾭?먯꽌 誘몃━ 醫곹엺 ?? format=full濡?諛곗튂 議고쉶?댁꽌
// 泥⑤??뚯씪 硫뷀??곗씠???뚯씪紐??ш린/???瑜?戮묐뒗?? Gmail? format=full?먯꽌??泥⑤??뚯씪???ㅼ젣
// 諛붿씠?몃뒗 ??二쇨퀬 size/filename/mimeType/attachmentId留?二쇰?濡?異붽? ?붿퐫?⑹씠 ?꾩슂 ?녿떎.
export async function listAttachmentsForAccount(accessToken: string, accountId: string, maxResults = 100): Promise<AttachmentListItem[]> {
  const params = new URLSearchParams({ maxResults: String(maxResults), q: "has:attachment" })
  const listRes = await fetchWithRetry(`${GMAIL_API_BASE}/messages?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!listRes.ok) throw new Error(`Gmail 泥⑤??뚯씪 寃???ㅽ뙣: ${listRes.status}`)
  const listJson = (await listRes.json()) as { messages?: { id: string }[] }
  const ids = listJson.messages?.map((m) => m.id) ?? []
  if (ids.length === 0) return []

  const messages = await batchGetMessages(accessToken, ids, "full")

  const results: AttachmentListItem[] = []
  for (const msg of messages) {
    const attachments: MailAttachment[] = []
    collectAttachments(msg.payload, attachments)
    if (attachments.length === 0) continue
    const mail = mapMessageToMail(msg, accountId)
    for (const att of attachments) {
      results.push({
        accountId,
        mailId: msg.id,
        attachmentId: att.id,
        filename: att.filename,
        mimeType: att.mimeType,
        size: att.size,
        fromName: mail.fromName,
        fromEmail: mail.fromEmail,
        subject: mail.subject,
        receivedAt: mail.receivedAt,
      })
    }
  }
  return results
}
```

`collectAttachments`? `mapMessageToMail`? ?대? 媛숈? ?뚯씪???덉쑝誘濡?媛곴컖 ??362踰덉㎏, 192踰덉㎏ 以? ?덈줈 import???꾩슂 ?녿떎.

- [x] **Step 5: ?뚯뒪???듦낵 ?뺤씤**

Run: `npx vitest run src/lib/gmail.test.ts`
Expected: PASS (湲곗〈 2媛?+ ?덈줈 異붽???2媛? 珥?4媛?

- [x] **Step 6: ?꾩껜 諛깆뿏???뚯뒪??+ ??낆껜??*

Run: `npx vitest run && npx tsc --noEmit`
Expected: ?꾨? PASS, ????먮윭 ?놁쓬

- [x] **Step 7: 而ㅻ컠**

```bash
git add backend/src/lib/gmail.ts backend/src/lib/gmail.test.ts
git commit -m "feat: add Gmail attachment-library listing (has:attachment search + batch full fetch)"
```

---

## Task 3: IMAP ??怨꾩젙 ?섎굹??泥⑤??뚯씪 紐⑸줉 議고쉶

**Files:**
- Modify: `backend/src/lib/imap.ts`
- Create: `backend/src/lib/imap-parse.test.ts` ?뺤옣 遺덊븘??(?꾨옒 李멸퀬) ?????`backend/src/lib/imap.ts`???덈줈 異붽??섎뒗 ?⑥닔??`cloudflare:sockets`???섏〈?섎?濡?吏곸젒 ?좊떅?뚯뒪?명븷 ???녿떎 (Task 2?먯꽌 ??臾몄젣瑜?諛쒓껄?섍퀬 `imap-parse.ts`濡??쒖닔 ?뚯떛 濡쒖쭅??戮묒븘???꾨?媛 ?덉쓬 ???대쾲?????⑥닔 ?먯껜媛 ?뚯폆 ?곌껐???꾩닔??戮묒븘???쒖닔 濡쒖쭅???녿떎). ?섎룞 ?뺤씤?쇰줈 ?泥댄븳??(Step 6 李멸퀬).

**Interfaces:**
- Consumes: `AttachmentListItem` (Task 1), `parseFetchLine`/`parseInternalDate` (`imap-parse.ts`, ?대? import?섏뼱 ?덉쓬), `listMimeAttachments`/`parseHeaderBlock`/`parseFromHeader`/`decodeRfc2047` (`mime.ts`, ?대? import?섏뼱 ?덉쓬)
- Produces: `export async function imapListAttachments(config: ImapConfig, accountId: string, maxResults?: number): Promise<AttachmentListItem[]>`, `export async function naverListAttachments(email: string, appPassword: string, accountId: string, maxResults?: number): Promise<AttachmentListItem[]>`, `export async function daumListAttachments(email: string, password: string, accountId: string, maxResults?: number): Promise<AttachmentListItem[]>`

- [x] **Step 1: `Mail`怨??섎???`AttachmentListItem` import**

`backend/src/lib/imap.ts:2`??

```ts
import type { Mail } from "../types"
```

瑜?

```ts
import type { AttachmentListItem, Mail } from "../types"
```

濡?諛붽씔??

- [x] **Step 2: `imapListAttachments` 援ы쁽**

`backend/src/lib/imap.ts`??`imapGetMailDetail` ?⑥닔(?꾩옱 ??544踰덉㎏ 以? `export async function imapGetMailDetail(config: ImapConfig, accountId: string, uid: string): Promise<Mail> {`) 諛붾줈 ?욎뿉 異붽?:

```ts
// 泥⑤????붾㈃????"泥⑤??뚯씪 ?덉쓬" 寃?됱씠 ?쒖? IMAP???놁쑝誘濡? 理쒓렐 硫붿씪 踰붿쐞???먮낯 ?꾩껜瑜?
// ??踰덉쓽 ?곌껐濡?媛?몄삩 ???대? ?덈뒗 listMimeAttachments濡?泥⑤??뚯씪??異붿텧?쒕떎. ???⑥닔媛 ?뺥솗??
// ?ш린源뚯? 怨꾩궛?댁＜誘濡?蹂꾨룄 洹쇱궗移?濡쒖쭅???꾩슂 ?녿떎.
export async function imapListAttachments(config: ImapConfig, accountId: string, maxResults = 100): Promise<AttachmentListItem[]> {
  return withImap(config, async (client) => {
    const selectResult = await client.command("SELECT INBOX")
    if (!selectResult.ok) return []

    let exists = 0
    for (const line of selectResult.lines) {
      const match = line.match(/^\*\s+(\d+)\s+EXISTS/i)
      if (match) exists = Number(match[1])
    }
    if (exists === 0) return []
    const start = Math.max(1, exists - maxResults + 1)

    const fetchResult = await client.command(`FETCH ${start}:${exists} (UID INTERNALDATE BODY.PEEK[])`)
    if (!fetchResult.ok) return []

    const results: AttachmentListItem[] = []
    for (const line of fetchResult.lines) {
      if (!/^\*\s+\d+\s+FETCH/i.test(line)) continue
      const parsed = parseFetchLine(line)
      if (!parsed || parsed.uid === undefined || !parsed.literalText) continue

      const attachments = listMimeAttachments(parsed.literalText)
      if (attachments.length === 0) continue

      const idx = parsed.literalText.search(/\n\n/)
      const headerBlock = idx === -1 ? parsed.literalText : parsed.literalText.slice(0, idx)
      const headers = parseHeaderBlock(headerBlock)
      const { name: fromName, email: fromEmail } = parseFromHeader(headers["from"] ?? "")
      const subject = decodeRfc2047(headers["subject"] ?? "") || "(?쒕ぉ ?놁쓬)"
      const receivedAt = parseInternalDate(parsed.internalDate)

      for (const att of attachments) {
        results.push({
          accountId,
          mailId: String(parsed.uid),
          attachmentId: att.id,
          filename: att.filename,
          mimeType: att.mimeType,
          size: att.size,
          fromName,
          fromEmail,
          subject,
          receivedAt,
        })
      }
    }
    return results
  })
}
```

- [x] **Step 3: ?ㅼ씠踰??ㅼ쓬 ?뉗? ?섑띁 異붽?**

`naverGetMailDetail` ?⑥닔(?꾩옱 ??698踰덉㎏ 以? 諛붾줈 ?ㅼ쓬??異붽?:

```ts
export async function naverListAttachments(email: string, appPassword: string, accountId: string, maxResults = 100): Promise<AttachmentListItem[]> {
  return imapListAttachments(naverConfig(email, appPassword), accountId, maxResults)
}
```

`daumGetMailDetail` ?⑥닔(?꾩옱 ??805踰덉㎏ 以? 諛붾줈 ?ㅼ쓬??異붽?:

```ts
export async function daumListAttachments(email: string, password: string, accountId: string, maxResults = 100): Promise<AttachmentListItem[]> {
  return imapListAttachments(daumConfig(email, password), accountId, maxResults)
}
```

(?뺥솗???쎌엯 ?꾩튂???⑥닔 ?대쫫?쇰줈 李얠쓣 寃????????⑥닔??Task 2 ???욎꽑 ?묒뾽?쇰줈 以?踰덊샇媛 ?쎄컙 諛?몄쓣 ???덈떎.)

- [x] **Step 4: ??낆껜??*

Run (backend ?붾젆?곕━?먯꽌): `npx tsc --noEmit`
Expected: ?먮윭 ?놁쓬

- [x] **Step 5: ?꾩껜 諛깆뿏???뚯뒪??*

Run: `npx vitest run`
Expected: 湲곗〈 ?뚯뒪???꾨? PASS (???쒖뒪?щ뒗 ???뚯뒪?몃? 異붽??섏? ?딅뒗????Step 0 ?ㅻ챸 李멸퀬)

- [x] **Step 6: ?섎룞 ?뺤씤 怨꾪쉷 湲곕줉**

???⑥닔???ㅼ젣 IMAP ?쒕쾭 ?곌껐???꾩슂???좊떅?뚯뒪?멸? 遺덇??ν븯?? 蹂닿퀬?쒖뿉 "?ㅼ씠踰??ㅼ쓬 ?ㅼ젣 怨꾩젙?쇰줈 泥⑤????붾㈃???댁뼱 ?뺤씤 ?꾩슂 (Task 6 ?꾨즺 ??媛??"?쇨퀬 紐낆떆?곸쑝濡??④릿??

- [x] **Step 7: 而ㅻ컠**

```bash
git add backend/src/lib/imap.ts
git commit -m "feat: add IMAP attachment-library listing (bounded raw-body scan)"
```

---

## Task 4: 諛깆뿏???쇱슦??`GET /api/attachments`

**Files:**
- Create: `backend/src/routes/attachments.ts`
- Modify: `backend/src/routes/api.ts`

**Interfaces:**
- Consumes: `listAttachmentsForAccount` (Task 2), `naverListAttachments`/`daumListAttachments`/`imapListAttachments` (Task 3), `resolveAccounts`/`ensureFreshToken`/`gmailTokenPatchOf`/`persistAccountTokenRefresh` (`../lib/auth`, `../lib/gmail` ??湲곗〈 ?⑥닔, `routes/rules.ts`媛 ?대? 媛숈? 議고빀???곌퀬 ?덉쓬), `readRawCookie`/`SESSION_COOKIE`/`readSession` (湲곗〈)
- Produces: `GET /api/attachments` ??`{ attachments: AttachmentListItem[] }`

- [x] **Step 1: ?쇱슦???뚯씪 ?묒꽦**

`backend/src/routes/attachments.ts` ?좎꽕 ??`backend/src/routes/rules.ts`??`/rules/:id/apply` ?쇱슦??怨꾩젙蹂?`Promise.all` + try/catch + ?좏겙 媛깆떊 ?⑦꽩)瑜?洹몃?濡?蹂몃쑍??

```ts
import { Hono } from "hono"
import type { AttachmentListItem, Env } from "../types"
import { ensureFreshToken, listAttachmentsForAccount } from "../lib/gmail"
import { daumListAttachments, imapListAttachments, naverListAttachments } from "../lib/imap"
import { type GmailTokenPatch, gmailTokenPatchOf, persistAccountTokenRefresh, resolveAccounts } from "../lib/auth"
import { readRawCookie } from "../lib/cookies"
import { readSession, SESSION_COOKIE } from "../lib/session"

const attachments = new Hono<{ Bindings: Env }>()

attachments.get("/attachments", async (c) => {
  const sessionId = readRawCookie(c.req.header("Cookie"), SESSION_COOKIE)
  if (!sessionId) return c.json({ attachments: [] })

  const session = await readSession(c.env, sessionId)
  const accountMap = await resolveAccounts(c.env, session)
  const accountIds = Object.keys(accountMap)
  const accountPatch: Record<string, GmailTokenPatch> = {}

  const perAccountResults = await Promise.all(
    accountIds.map(async (accountId): Promise<AttachmentListItem[]> => {
      const record = accountMap[accountId]
      if (!record) return []
      try {
        if (record.provider === "naver") {
          return await naverListAttachments(record.email, record.appPassword, accountId)
        }
        if (record.provider === "daum") {
          return await daumListAttachments(record.email, record.password, accountId)
        }
        if (record.provider === "imap") {
          return await imapListAttachments({ host: record.host, port: record.port, email: record.email, password: record.password }, accountId)
        }
        const fresh = await ensureFreshToken(c.env, record)
        if (fresh.accessToken !== record.accessToken) {
          accountPatch[accountId] = gmailTokenPatchOf(fresh)
        }
        return await listAttachmentsForAccount(fresh.accessToken, accountId)
      } catch (err) {
        console.error(`[attachments] account ${accountId} failed, skipping:`, err)
        return []
      }
    }),
  )

  if (Object.keys(accountPatch).length > 0) await persistAccountTokenRefresh(c.env, sessionId, session, accountMap, accountPatch)

  return c.json({ attachments: perAccountResults.flat() })
})

export default attachments
```

- [x] **Step 2: `routes/api.ts`??留덉슫??*

`backend/src/routes/api.ts:1-17`??

```ts
import { Hono } from "hono"
import type { Env } from "../types"
import accounts from "./accounts"
import attachments from "./attachments"
import backup from "./backup"
import folders from "./folders"
```

濡?諛붽씀怨?(湲곗〈 `import accounts from "./accounts"` ?ㅼ쓬 以꾩뿉 `attachments` import ??以꾨쭔 異붽?), ?꾨옒履??쇱슦???깅줉遺:

```ts
api.route("/", accounts)
api.route("/", attachments)
api.route("/", backup)
api.route("/", folders)
```

(湲곗〈 `api.route("/", accounts)` ?ㅼ쓬 以꾩뿉 `api.route("/", attachments)` ??以꾨쭔 異붽?.)

- [x] **Step 3: ??낆껜??+ ?꾩껜 ?뚯뒪??*

Run (backend ?붾젆?곕━?먯꽌): `npx tsc --noEmit && npx vitest run`
Expected: ????먮윭 ?놁쓬, 紐⑤뱺 ?뚯뒪??PASS

- [x] **Step 4: 而ㅻ컠**

```bash
git add backend/src/routes/attachments.ts backend/src/routes/api.ts
git commit -m "feat: add GET /api/attachments route"
```

---

## Task 5: ?꾨윴????`AttachmentsView` ?붾㈃

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Create: `frontend/src/components/attachments/attachments-view.tsx`

**Interfaces:**
- Consumes: `AttachmentListItem` (Task 1), `attachmentDownloadUrl` (?대? `frontend/src/lib/api.ts`???덉쓬)
- Produces: `export async function fetchAttachments(): Promise<AttachmentListItem[]>`, `export function AttachmentsView(props: { accounts: Account[] })`

- [x] **Step 1: `fetchAttachments` 異붽?**

`frontend/src/lib/api.ts`?먯꽌 `export function attachmentDownloadUrl(...)` ?⑥닔 諛붾줈 ?욎뿉 異붽?:

```ts
export async function fetchAttachments(): Promise<AttachmentListItem[]> {
  const res = await fetch("/api/attachments")
  if (!res.ok) return []
  const data = (await res.json()) as { attachments: AttachmentListItem[] }
  return data.attachments
}

```

?뚯씪 理쒖긽??import 以?`import type { Account, AppNotification, AutoClassifyRule, Contact, Draft, ForwardedAttachmentRef, Mail, MailAttachment, MailCategory, MailFolder, MemoItem, QuickReply, SavedFilter } from "@/types/mail"`)??`AttachmentListItem`???뚰뙆踰??쒖꽌濡?異붽?:

```ts
import type { Account, AppNotification, AttachmentListItem, AutoClassifyRule, Contact, Draft, ForwardedAttachmentRef, Mail, MailAttachment, MailCategory, MailFolder, MemoItem, QuickReply, SavedFilter } from "@/types/mail"
```

- [x] **Step 2: `AttachmentsView` 而댄룷?뚰듃 ?묒꽦**

`frontend/src/components/attachments/attachments-view.tsx` ?좎꽕:

```tsx
import { File, FileArchive, FileSpreadsheet, FileText, Image as ImageIcon, Loader2, Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { attachmentDownloadUrl, fetchAttachments } from "@/lib/api"
import type { Account, AttachmentListItem } from "@/types/mail"

interface AttachmentsViewProps {
  accounts: Account[]
}

function accountLabel(account: Account): string {
  return account.provider === "gmail" || account.provider === "naver" || account.provider === "daum"
    ? account.email
    : account.label
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "numeric", day: "numeric" })
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) return <ImageIcon className="size-4" />
  if (mimeType === "application/pdf") return <FileText className="size-4" />
  if (mimeType.includes("sheet") || mimeType.includes("excel") || mimeType === "text/csv") return <FileSpreadsheet className="size-4" />
  if (mimeType.includes("zip") || mimeType.includes("compressed")) return <FileArchive className="size-4" />
  return <File className="size-4" />
}

export function AttachmentsView({ accounts }: AttachmentsViewProps) {
  const [items, setItems] = useState<AttachmentListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [accountFilter, setAccountFilter] = useState<string>("all")

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    fetchAttachments().then((result) => {
      if (!cancelled) setItems(result)
    }).finally(() => {
      if (!cancelled) setIsLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items
      .filter((item) => accountFilter === "all" || item.accountId === accountFilter)
      .filter((item) => !q || item.filename.toLowerCase().includes(q))
      .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
  }, [items, query, accountFilter])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b bg-background px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold">泥⑤???/h2>
          <p className="text-muted-foreground text-xs">紐⑤뱺 怨꾩젙?먯꽌 諛쏆? 泥⑤??뚯씪??理쒓렐 ?쒖쑝濡?紐⑥븘 蹂댁뿬以띾땲??(怨꾩젙??理쒓렐 100??踰붿쐞).</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="?뚯씪紐?寃??
              className="bg-muted/50 focus:bg-background focus:ring-ring/40 h-10 w-full rounded-lg border border-transparent py-2 pr-3 pl-9 text-sm outline-none transition-all focus:border-border focus:ring-2"
            />
          </div>
          <select
            value={accountFilter}
            onChange={(event) => setAccountFilter(event.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">?꾩껜 怨꾩젙</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{accountLabel(account)}</option>
            ))}
          </select>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex w-full min-w-0 flex-col">
          {isLoading && (
            <div className="flex items-center justify-center p-10">
              <Loader2 className="text-muted-foreground size-6 animate-spin" />
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <p className="text-muted-foreground p-6 text-sm">
              {items.length === 0 ? "泥⑤??뚯씪???덈뒗 硫붿씪???놁뒿?덈떎." : "寃??寃곌낵媛 ?놁뒿?덈떎."}
            </p>
          )}
          {!isLoading && filtered.map((item) => {
            const account = accounts.find((a) => a.id === item.accountId)
            return (
              <a
                key={`${item.accountId}:${item.mailId}:${item.attachmentId}`}
                href={attachmentDownloadUrl(item.mailId, item.accountId, {
                  id: item.attachmentId,
                  filename: item.filename,
                  mimeType: item.mimeType,
                  size: item.size,
                })}
                download={item.filename}
                className="flex w-full min-w-0 items-center gap-3 border-b px-5 py-3 text-sm transition-colors hover:bg-accent/50"
              >
                <span className="text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <FileIcon mimeType={item.mimeType} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.filename}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {item.fromName} 쨌 {account ? accountLabel(account) : item.fromEmail} 쨌 {formatDate(item.receivedAt)}
                  </p>
                </div>
                <span className="text-muted-foreground shrink-0 text-xs">{formatFileSize(item.size)}</span>
              </a>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
```

- [x] **Step 3: ??낆껜??+ 鍮뚮뱶**

Run (frontend ?붾젆?곕━?먯꽌): `npx tsc -b && npm run build`
Expected: ?먮윭 ?놁쓬 (???쒖젏?먯꽌???꾩쭅 ?꾨Т??`AttachmentsView`/`fetchAttachments`瑜??몄텧?섏? ?딆쑝誘濡? "?ъ슜 ???? 寃쎄퀬媛 ?섎㈃ ???섍퀬 ??????export?섏뼱 ?덉쑝??鍮뚮뱶 ?먯껜???듦낵?댁빞 ?쒕떎)

- [x] **Step 4: 而ㅻ컠**

```bash
git add frontend/src/lib/api.ts frontend/src/components/attachments/attachments-view.tsx
git commit -m "feat: add AttachmentsView component"
```

---

## Task 6: ?ъ씠?쒕컮/?ㅻ퉬寃뚯씠???곌껐

**Files:**
- Modify: `frontend/src/hooks/use-mail-workspace.ts`
- Modify: `frontend/src/components/mail/account-sidebar.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `AttachmentsView` (Task 5)

- [x] **Step 1: `AppView`??`"attachments"` 異붽?**

`frontend/src/hooks/use-mail-workspace.ts:32`??

```ts
export type AppView = "home" | "inbox" | "starred" | "cleanup" | "trash" | "folder" | "archive" | "memo" | "drafts" | "snoozed" | "muted"
```

瑜?

```ts
export type AppView = "home" | "inbox" | "starred" | "cleanup" | "trash" | "folder" | "archive" | "memo" | "drafts" | "snoozed" | "muted" | "attachments"
```

濡?諛붽씔??

- [x] **Step 2: ?ъ씠?쒕컮??"泥⑤??? 硫붾돱 ??ぉ 異붽?**

`frontend/src/components/mail/account-sidebar.tsx:1`??lucide-react import??`Paperclip` 異붽?:

```ts
import { AlarmClock, Archive, ChevronDown, FileEdit, Folder, FolderPlus, Inbox, LogOut, Paperclip, Pencil, Plus, Settings, Sparkles, Star, StickyNote, Trash2, VolumeX } from "lucide-react"
```

`AccountSidebarProps` ?명꽣?섏씠?ㅼ뿉??`isArchiveView: boolean` ?ㅼ쓬 以꾩뿉 異붽?:

```ts
  isAttachmentsView: boolean
```

媛숈? ?명꽣?섏씠?ㅼ뿉??`onGoArchive: () => void` ?ㅼ쓬 以꾩뿉 異붽?:

```ts
  onGoAttachments: () => void
```

而댄룷?뚰듃 ?⑥닔??援ъ“遺꾪빐 留ㅺ컻蹂?섏뿉??`isArchiveView,` ?ㅼ쓬 以꾩뿉 異붽?:

```ts
  isAttachmentsView,
```

洹몃━怨?`onGoArchive,` ?ㅼ쓬 以꾩뿉 異붽?:

```ts
  onGoAttachments,
```

"蹂닿??? `SidebarMenuItem` 釉붾줉(?꾨옒 JSX, `<Archive />` ?ㅼ쓬??`<span>蹂닿???/span>`???덈뒗 遺遺? 諛붾줈 ?ㅼ쓬??????ぉ 異붽?:

```tsx
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isAttachmentsView}
                  onClick={() => {
                    onGoAttachments()
                    closeOnMobile()
                  }}
                >
                  <Paperclip />
                  <span>泥⑤???/span>
                </SidebarMenuButton>
              </SidebarMenuItem>
```

- [x] **Step 3: App.tsx ??`goToAttachments` ?몃뱾??+ ?뚮뜑留?遺꾧린**

`frontend/src/App.tsx`?먯꽌 `goToDrafts` ?⑥닔(??401踰덉㎏ 以? 諛붾줈 ?ㅼ쓬??異붽? (?곗씠???꾨━濡쒕뱶媛 ?녿뒗 `goToDrafts`/`goToSnooze`/`goToMuted`? 媛숈? ?뺥깭 ??`AttachmentsView`媛 ?ㅼ뒪濡??곗씠?곕? 媛?몄삤誘濡??ш린??濡쒕뱶 ?몄텧???꾩슂 ?녿떎):

```ts
  const goToAttachments = () => {
    setView("attachments")
    workspace.setSelectedMailId(null)
    workspace.setFocusedMailId(null)
    workspace.setCheckedMailIds(new Set())
    setComposeState(null)
  }
```

`<AccountSidebar>` JSX ?몄텧遺(??969踰덉㎏ 以꾨????먯꽌 `isArchiveView={view === "archive"}` ?ㅼ쓬 以꾩뿉 異붽?:

```tsx
        isAttachmentsView={view === "attachments"}
```

媛숈? JSX?먯꽌 `onGoArchive={goToArchive}` ?ㅼ쓬 以꾩뿉 異붽?:

```tsx
        onGoAttachments={goToAttachments}
```

?ㅻ뜑 ??댄? ?쇳빆?곗궛??泥댁씤(??1018踰덉㎏ 以?`: view === "archive" ? "蹂닿???` ?ㅼ쓬)??異붽?:

```tsx
                    : view === "attachments"
                      ? "泥⑤???
```

?뚮뜑留?遺꾧린(??1139踰덉㎏ 以?`) : view === "memo" ? (` 諛붾줈 ?? 利?`TrashView`瑜??뚮뜑留곹븯??`) : view === "trash" ? (` 釉붾줉???앸굹??吏?? 諛붾줈 ?ㅼ쓬????遺꾧린 異붽? ??`MemoView` 遺꾧린 ?욎뿉 ?쇱썙?ｋ뒗??

```tsx
        ) : view === "attachments" ? (
          <AttachmentsView accounts={accounts} />
        ) : view === "memo" ? (
```

(湲곗〈 `) : view === "memo" ? (` 以꾩쓣 ??3以꾨줈 援먯껜?섎뒗 寃껉낵 ?숈씪 ????遺꾧린瑜?異붽??섍퀬 洹몃떎?뚯뿉 ?먮옒 ?덈뜕 `view === "memo"` 遺꾧린媛 ?댁뼱吏寃?)

`App.tsx` 理쒖긽??import 紐⑸줉??`AttachmentsView` 異붽? ??`import { CleanupView, SHORTCUTS } from "@/components/cleanup/cleanup-view"` ?ㅼ쓬 以꾩뿉:

```ts
import { AttachmentsView } from "@/components/attachments/attachments-view"
```

- [x] **Step 4: ??낆껜??+ 鍮뚮뱶**

Run (frontend ?붾젆?곕━?먯꽌): `npx tsc -b && npm run build`
Expected: ?먮윭 ?놁쓬

- [x] **Step 5: ?꾩껜 ?뚯뒪??*

Run: `npx vitest run` (frontend), `cd ../backend && npx vitest run`
Expected: ?꾨? PASS

- [x] **Step 6: 濡쒖뺄 ?섎룞 ?뺤씤**

Run: `npx wrangler dev`(backend) + `npx vite --port 5183`(frontend), ?ㅼ젣 濡쒓렇??怨꾩젙?쇰줈:
1. ?ъ씠?쒕컮??"泥⑤??? ??ぉ??蹂댁씠?붿?, ?대┃?섎㈃ ?붾㈃???대━?붿?
2. Gmail 怨꾩젙??泥⑤??뚯씪 ?덈뒗 硫붿씪???덉쑝硫?紐⑸줉???섏삤?붿?
3. ?ㅼ씠踰??ㅼ쓬 怨꾩젙???곌껐?섏뼱 ?덉쑝硫?洹몄そ 泥⑤??뚯씪??媛숈씠 ?섏삤?붿? (Task 3?먯꽌 ?좊떅?뚯뒪?몃줈
   ?뺤씤 紐???遺遺????ш린??泥섏쓬 ?ㅼ젣濡?寃利앸맖)
4. ?뚯씪紐?寃?? 怨꾩젙 ?꾪꽣媛 ?숈옉?섎뒗吏
5. ?ㅼ슫濡쒕뱶 踰꾪듉???뚮윭 ?ㅼ젣濡??뚯씪??諛쏆븘吏?붿? (湲곗〈 `/mail/:id/attachment/:attachmentId`
   ?쇱슦?몃? 洹몃?濡??곕?濡??뺤긽 ?숈옉?댁빞 ??
6. 怨꾩젙 以??섎굹媛 濡쒓렇??留뚮즺 ?깆쑝濡??ㅽ뙣?대룄 ?섎㉧吏 怨꾩젙 寃곌낵???섏삤?붿? (?섎굹留??쇰????딆뼱蹂닿릿
   ?대젮?곕?濡? 理쒖냼??諛깆뿏??濡쒓렇??`[attachments] account X failed, skipping` ?뺥깭濡쒕쭔 ?④퀬
   500 ?먮윭濡??꾩껜媛 二쎌? ?딅뒗吏 肄붾뱶 由щ럭濡??뺤씤)

- [x] **Step 7: 而ㅻ컠**

```bash
git add frontend/src/hooks/use-mail-workspace.ts frontend/src/components/mail/account-sidebar.tsx frontend/src/App.tsx
git commit -m "feat: wire the attachment library into the sidebar and navigation"
```

