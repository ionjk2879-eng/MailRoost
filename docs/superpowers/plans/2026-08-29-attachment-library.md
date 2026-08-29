# 통합 첨부함 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gmail/네이버/다음/범용 IMAP 전 계정에서 첨부파일이 있는 메일을 모아, 계정/메일함 구분 없이 파일명으로 검색·다운로드할 수 있는 "첨부함" 화면을 만든다.

**Architecture:** 색인을 저장하지 않고, 화면을 열 때마다 계정별로 최근 100통을 훑어 첨부파일만 추린다. Gmail은 `has:attachment` 서버 검색 + 배치 조회(`format=full`)로, IMAP(네이버/다음/범용)은 최근 범위의 원본 전체를 한 연결로 가져와 이미 있는 MIME 파서로 추출한다 — 두 경로 모두 기존 코드를 최대한 재사용하고 새 파싱 로직은 만들지 않는다. 프런트는 사이드바에 새 화면 하나를 추가하고, 그 화면이 마운트될 때 스스로 데이터를 가져온다(App.tsx의 중앙 `workspace`/`mailOrg` 훅에 상태를 얹지 않는다 — 자주 안 열어보는 독립된 화면이라 훅을 키우는 것보다 컴포넌트 로컬 상태가 더 단순하다).

**Tech Stack:** Cloudflare Workers + Hono (backend), React 19 + Vite (frontend), Vitest

**Spec:** `docs/superpowers/specs/2026-08-29-attachment-library-design.md`

## Global Constraints

- 계정 유형(Gmail/IMAP)을 사용자가 직접 고르게 하지 않는다 — 백엔드가 계정마다 알아서 처리, 프런트는 합쳐진 목록 하나만 보여준다
- 계정당 최근 100통으로 스캔 범위를 제한한다 (무제한 스캔 금지)
- 첨부파일 크기는 정확한 값을 쓴다 (근사치 로직을 별도로 만들지 않는다 — 스펙 문서의 "설계 중 재검토" 참고)
- 인라인 이미지와 실첨부파일을 구분하지 않는다 (message-card.tsx의 기존 동작과 동일하게)
- 계정 하나가 실패해도 나머지 계정 결과는 정상 반환한다 (조용히 스킵 + 콘솔 로그)
- 기존 첨부파일 다운로드 엔드포인트(`/mail/:id/attachment/:attachmentId`)는 변경하지 않는다

---

## Task 1: 공용 타입 `AttachmentListItem`

**Files:**
- Modify: `backend/src/types.ts`
- Modify: `frontend/src/types/mail.ts`

**Interfaces:**
- Produces: `AttachmentListItem` (양쪽에 동일한 필드로 정의)

- [ ] **Step 1: 백엔드 타입 추가**

`backend/src/types.ts`에서 `MailAttachment` 인터페이스 바로 다음 줄에 추가:

```ts
// 첨부함 화면용 — 계정 전체를 훑어서 나온 "메일 하나 + 첨부파일 하나" 평탄화된 항목.
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

- [ ] **Step 2: 프런트 타입 미러링**

`frontend/src/types/mail.ts`에서 `MailAttachment` 인터페이스 바로 다음 줄에 동일한 내용 추가:

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

- [ ] **Step 3: 타입체크**

Run: `cd backend && npx tsc --noEmit` / `cd frontend && npx tsc -b`
Expected: 둘 다 에러 없음 (아직 아무도 이 타입을 안 쓰므로 추가만으로는 에러가 날 수 없다)

- [ ] **Step 4: 커밋**

```bash
git add backend/src/types.ts frontend/src/types/mail.ts
git commit -m "feat: add AttachmentListItem type for the attachment library"
```

---

## Task 2: Gmail — 계정 하나의 첨부파일 목록 조회

**Files:**
- Modify: `backend/src/lib/gmail.ts`
- Create: `backend/src/lib/gmail.test.ts` 확장 (기존 파일에 테스트 추가)

**Interfaces:**
- Consumes: `AttachmentListItem` (Task 1)
- Produces: `export async function listAttachmentsForAccount(accessToken: string, accountId: string, maxResults?: number): Promise<AttachmentListItem[]>`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/lib/gmail.test.ts` 최상단의:

```ts
import { describe, expect, it } from "vitest"
```

를 (새 테스트가 `afterEach`로 `globalThis.fetch`를 복원하므로):

```ts
import { afterEach, describe, expect, it } from "vitest"
```

로 바꾼다. 그리고 기존 `import { mapMessageToMail, type GmailMessage } from "./gmail"` 옆에 추가:

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

- [ ] **Step 2: 테스트 실패 확인**

Run (backend 디렉터리에서): `npx vitest run src/lib/gmail.test.ts`
Expected: FAIL — `listAttachmentsForAccount`가 export되지 않음

- [ ] **Step 3: `batchGetMessages`에 `format` 매개변수 추가**

`backend/src/lib/gmail.ts:218` (`async function batchGetMessages(accessToken: string, ids: string[]): Promise<GmailMessage[]> {`)부터 시작하는 함수를 아래로 교체:

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
      // 파싱 실패한 파트는 건너뛴다 (한 메시지가 개별적으로 404 등을 반환한 경우 등)
    }
  }
  return messages
}
```

(바뀐 부분: 시그니처에 `format` 매개변수 추가, 재귀 호출에 `format` 전달, `path` 계산을 `format`에 따라 분기. 나머지는 전부 동일.)

- [ ] **Step 4: `listAttachmentsForAccount` 구현**

`backend/src/types.ts`에서 `AttachmentListItem`을 가져오도록 `backend/src/lib/gmail.ts:1`의 import를:

```ts
import type { AttachmentListItem, Env, GmailAccountRecord, Mail, MailAttachment, MailCategory } from "../types"
```

로 바꾸고, `getAttachment` 함수(약 554번째 줄, `export async function getAttachment(`) 바로 앞에 추가:

```ts
// 첨부함 화면용 — has:attachment 검색으로 후보를 서버에서 미리 좁힌 뒤, format=full로 배치 조회해서
// 첨부파일 메타데이터(파일명/크기/타입)를 뽑는다. Gmail은 format=full에서도 첨부파일의 실제
// 바이트는 안 주고 size/filename/mimeType/attachmentId만 주므로 추가 디코딩이 필요 없다.
export async function listAttachmentsForAccount(accessToken: string, accountId: string, maxResults = 100): Promise<AttachmentListItem[]> {
  const params = new URLSearchParams({ maxResults: String(maxResults), q: "has:attachment" })
  const listRes = await fetchWithRetry(`${GMAIL_API_BASE}/messages?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!listRes.ok) throw new Error(`Gmail 첨부파일 검색 실패: ${listRes.status}`)
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

`collectAttachments`와 `mapMessageToMail`은 이미 같은 파일에 있으므로(각각 약 362번째, 192번째 줄) 새로 import할 필요 없다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/lib/gmail.test.ts`
Expected: PASS (기존 2개 + 새로 추가한 2개, 총 4개)

- [ ] **Step 6: 전체 백엔드 테스트 + 타입체크**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 전부 PASS, 타입 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add backend/src/lib/gmail.ts backend/src/lib/gmail.test.ts
git commit -m "feat: add Gmail attachment-library listing (has:attachment search + batch full fetch)"
```

---

## Task 3: IMAP — 계정 하나의 첨부파일 목록 조회

**Files:**
- Modify: `backend/src/lib/imap.ts`
- Create: `backend/src/lib/imap-parse.test.ts` 확장 불필요 (아래 참고) — 대신 `backend/src/lib/imap.ts`에 새로 추가하는 함수는 `cloudflare:sockets`에 의존하므로 직접 유닛테스트할 수 없다 (Task 2에서 이 문제를 발견하고 `imap-parse.ts`로 순수 파싱 로직을 뽑아낸 전례가 있음 — 이번엔 새 함수 자체가 소켓 연결이 필수라 뽑아낼 순수 로직이 없다). 수동 확인으로 대체한다 (Step 6 참고).

**Interfaces:**
- Consumes: `AttachmentListItem` (Task 1), `parseFetchLine`/`parseInternalDate` (`imap-parse.ts`, 이미 import되어 있음), `listMimeAttachments`/`parseHeaderBlock`/`parseFromHeader`/`decodeRfc2047` (`mime.ts`, 이미 import되어 있음)
- Produces: `export async function imapListAttachments(config: ImapConfig, accountId: string, maxResults?: number): Promise<AttachmentListItem[]>`, `export async function naverListAttachments(email: string, appPassword: string, accountId: string, maxResults?: number): Promise<AttachmentListItem[]>`, `export async function daumListAttachments(email: string, password: string, accountId: string, maxResults?: number): Promise<AttachmentListItem[]>`

- [ ] **Step 1: `Mail`과 나란히 `AttachmentListItem` import**

`backend/src/lib/imap.ts:2`의:

```ts
import type { Mail } from "../types"
```

를:

```ts
import type { AttachmentListItem, Mail } from "../types"
```

로 바꾼다.

- [ ] **Step 2: `imapListAttachments` 구현**

`backend/src/lib/imap.ts`의 `imapGetMailDetail` 함수(현재 약 544번째 줄, `export async function imapGetMailDetail(config: ImapConfig, accountId: string, uid: string): Promise<Mail> {`) 바로 앞에 추가:

```ts
// 첨부함 화면용 — "첨부파일 있음" 검색이 표준 IMAP에 없으므로, 최근 메일 범위의 원본 전체를
// 한 번의 연결로 가져온 뒤 이미 있는 listMimeAttachments로 첨부파일을 추출한다. 이 함수가 정확한
// 크기까지 계산해주므로 별도 근사치 로직이 필요 없다.
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
      const subject = decodeRfc2047(headers["subject"] ?? "") || "(제목 없음)"
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

- [ ] **Step 3: 네이버/다음 얇은 래퍼 추가**

`naverGetMailDetail` 함수(현재 약 698번째 줄) 바로 다음에 추가:

```ts
export async function naverListAttachments(email: string, appPassword: string, accountId: string, maxResults = 100): Promise<AttachmentListItem[]> {
  return imapListAttachments(naverConfig(email, appPassword), accountId, maxResults)
}
```

`daumGetMailDetail` 함수(현재 약 805번째 줄) 바로 다음에 추가:

```ts
export async function daumListAttachments(email: string, password: string, accountId: string, maxResults = 100): Promise<AttachmentListItem[]> {
  return imapListAttachments(daumConfig(email, password), accountId, maxResults)
}
```

(정확한 삽입 위치는 함수 이름으로 찾을 것 — 이 두 함수도 Task 2 등 앞선 작업으로 줄 번호가 약간 밀렸을 수 있다.)

- [ ] **Step 4: 타입체크**

Run (backend 디렉터리에서): `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 전체 백엔드 테스트**

Run: `npx vitest run`
Expected: 기존 테스트 전부 PASS (이 태스크는 새 테스트를 추가하지 않는다 — Step 0 설명 참고)

- [ ] **Step 6: 수동 확인 계획 기록**

이 함수는 실제 IMAP 서버 연결이 필요해 유닛테스트가 불가능하다. 보고서에 "네이버/다음 실제 계정으로 첨부함 화면을 열어 확인 필요 (Task 6 완료 후 가능)"라고 명시적으로 남긴다.

- [ ] **Step 7: 커밋**

```bash
git add backend/src/lib/imap.ts
git commit -m "feat: add IMAP attachment-library listing (bounded raw-body scan)"
```

---

## Task 4: 백엔드 라우트 `GET /api/attachments`

**Files:**
- Create: `backend/src/routes/attachments.ts`
- Modify: `backend/src/routes/api.ts`

**Interfaces:**
- Consumes: `listAttachmentsForAccount` (Task 2), `naverListAttachments`/`daumListAttachments`/`imapListAttachments` (Task 3), `resolveAccounts`/`ensureFreshToken`/`gmailTokenPatchOf`/`persistAccountTokenRefresh` (`../lib/auth`, `../lib/gmail` — 기존 함수, `routes/rules.ts`가 이미 같은 조합을 쓰고 있음), `readRawCookie`/`SESSION_COOKIE`/`readSession` (기존)
- Produces: `GET /api/attachments` → `{ attachments: AttachmentListItem[] }`

- [ ] **Step 1: 라우트 파일 작성**

`backend/src/routes/attachments.ts` 신설 — `backend/src/routes/rules.ts`의 `/rules/:id/apply` 라우트(계정별 `Promise.all` + try/catch + 토큰 갱신 패턴)를 그대로 본뜬다:

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

- [ ] **Step 2: `routes/api.ts`에 마운트**

`backend/src/routes/api.ts:1-17`을:

```ts
import { Hono } from "hono"
import type { Env } from "../types"
import accounts from "./accounts"
import attachments from "./attachments"
import backup from "./backup"
import folders from "./folders"
```

로 바꾸고 (기존 `import accounts from "./accounts"` 다음 줄에 `attachments` import 한 줄만 추가), 아래쪽 라우트 등록부:

```ts
api.route("/", accounts)
api.route("/", attachments)
api.route("/", backup)
api.route("/", folders)
```

(기존 `api.route("/", accounts)` 다음 줄에 `api.route("/", attachments)` 한 줄만 추가.)

- [ ] **Step 3: 타입체크 + 전체 테스트**

Run (backend 디렉터리에서): `npx tsc --noEmit && npx vitest run`
Expected: 타입 에러 없음, 모든 테스트 PASS

- [ ] **Step 4: 커밋**

```bash
git add backend/src/routes/attachments.ts backend/src/routes/api.ts
git commit -m "feat: add GET /api/attachments route"
```

---

## Task 5: 프런트 — `AttachmentsView` 화면

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Create: `frontend/src/components/attachments/attachments-view.tsx`

**Interfaces:**
- Consumes: `AttachmentListItem` (Task 1), `attachmentDownloadUrl` (이미 `frontend/src/lib/api.ts`에 있음)
- Produces: `export async function fetchAttachments(): Promise<AttachmentListItem[]>`, `export function AttachmentsView(props: { accounts: Account[] })`

- [ ] **Step 1: `fetchAttachments` 추가**

`frontend/src/lib/api.ts`에서 `export function attachmentDownloadUrl(...)` 함수 바로 앞에 추가:

```ts
export async function fetchAttachments(): Promise<AttachmentListItem[]> {
  const res = await fetch("/api/attachments")
  if (!res.ok) return []
  const data = (await res.json()) as { attachments: AttachmentListItem[] }
  return data.attachments
}

```

파일 최상단 import 줄(`import type { Account, AppNotification, AutoClassifyRule, Contact, Draft, ForwardedAttachmentRef, Mail, MailAttachment, MailCategory, MailFolder, MemoItem, QuickReply, SavedFilter } from "@/types/mail"`)에 `AttachmentListItem`을 알파벳 순서로 추가:

```ts
import type { Account, AppNotification, AttachmentListItem, AutoClassifyRule, Contact, Draft, ForwardedAttachmentRef, Mail, MailAttachment, MailCategory, MailFolder, MemoItem, QuickReply, SavedFilter } from "@/types/mail"
```

- [ ] **Step 2: `AttachmentsView` 컴포넌트 작성**

`frontend/src/components/attachments/attachments-view.tsx` 신설:

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
          <h2 className="text-lg font-semibold">첨부함</h2>
          <p className="text-muted-foreground text-xs">모든 계정에서 받은 첨부파일을 최근 순으로 모아 보여줍니다 (계정당 최근 100통 범위).</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="파일명 검색"
              className="bg-muted/50 focus:bg-background focus:ring-ring/40 h-10 w-full rounded-lg border border-transparent py-2 pr-3 pl-9 text-sm outline-none transition-all focus:border-border focus:ring-2"
            />
          </div>
          <select
            value={accountFilter}
            onChange={(event) => setAccountFilter(event.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">전체 계정</option>
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
              {items.length === 0 ? "첨부파일이 있는 메일이 없습니다." : "검색 결과가 없습니다."}
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
                    {item.fromName} · {account ? accountLabel(account) : item.fromEmail} · {formatDate(item.receivedAt)}
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

- [ ] **Step 3: 타입체크 + 빌드**

Run (frontend 디렉터리에서): `npx tsc -b && npm run build`
Expected: 에러 없음 (이 시점에서는 아직 아무도 `AttachmentsView`/`fetchAttachments`를 호출하지 않으므로, "사용 안 함" 경고가 나면 안 되고 — 둘 다 export되어 있으니 빌드 자체는 통과해야 한다)

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/lib/api.ts frontend/src/components/attachments/attachments-view.tsx
git commit -m "feat: add AttachmentsView component"
```

---

## Task 6: 사이드바/네비게이션 연결

**Files:**
- Modify: `frontend/src/hooks/use-mail-workspace.ts`
- Modify: `frontend/src/components/mail/account-sidebar.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `AttachmentsView` (Task 5)

- [ ] **Step 1: `AppView`에 `"attachments"` 추가**

`frontend/src/hooks/use-mail-workspace.ts:32`의:

```ts
export type AppView = "home" | "inbox" | "starred" | "cleanup" | "trash" | "folder" | "archive" | "memo" | "drafts" | "snoozed" | "muted"
```

를:

```ts
export type AppView = "home" | "inbox" | "starred" | "cleanup" | "trash" | "folder" | "archive" | "memo" | "drafts" | "snoozed" | "muted" | "attachments"
```

로 바꾼다.

- [ ] **Step 2: 사이드바에 "첨부함" 메뉴 항목 추가**

`frontend/src/components/mail/account-sidebar.tsx:1`의 lucide-react import에 `Paperclip` 추가:

```ts
import { AlarmClock, Archive, ChevronDown, FileEdit, Folder, FolderPlus, Inbox, LogOut, Paperclip, Pencil, Plus, Settings, Sparkles, Star, StickyNote, Trash2, VolumeX } from "lucide-react"
```

`AccountSidebarProps` 인터페이스에서 `isArchiveView: boolean` 다음 줄에 추가:

```ts
  isAttachmentsView: boolean
```

같은 인터페이스에서 `onGoArchive: () => void` 다음 줄에 추가:

```ts
  onGoAttachments: () => void
```

컴포넌트 함수의 구조분해 매개변수에서 `isArchiveView,` 다음 줄에 추가:

```ts
  isAttachmentsView,
```

그리고 `onGoArchive,` 다음 줄에 추가:

```ts
  onGoAttachments,
```

"보관함" `SidebarMenuItem` 블록(아래 JSX, `<Archive />` 다음에 `<span>보관함</span>`이 있는 부분) 바로 다음에 새 항목 추가:

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
                  <span>첨부함</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
```

- [ ] **Step 3: App.tsx — `goToAttachments` 핸들러 + 렌더링 분기**

`frontend/src/App.tsx`에서 `goToDrafts` 함수(약 401번째 줄) 바로 다음에 추가 (데이터 프리로드가 없는 `goToDrafts`/`goToSnooze`/`goToMuted`와 같은 형태 — `AttachmentsView`가 스스로 데이터를 가져오므로 여기서 로드 호출이 필요 없다):

```ts
  const goToAttachments = () => {
    setView("attachments")
    workspace.setSelectedMailId(null)
    workspace.setFocusedMailId(null)
    workspace.setCheckedMailIds(new Set())
    setComposeState(null)
  }
```

`<AccountSidebar>` JSX 호출부(약 969번째 줄부터)에서 `isArchiveView={view === "archive"}` 다음 줄에 추가:

```tsx
        isAttachmentsView={view === "attachments"}
```

같은 JSX에서 `onGoArchive={goToArchive}` 다음 줄에 추가:

```tsx
        onGoAttachments={goToAttachments}
```

헤더 타이틀 삼항연산자 체인(약 1018번째 줄 `: view === "archive" ? "보관함"` 다음)에 추가:

```tsx
                    : view === "attachments"
                      ? "첨부함"
```

렌더링 분기(약 1139번째 줄 `) : view === "memo" ? (` 바로 앞, 즉 `TrashView`를 렌더링하는 `) : view === "trash" ? (` 블록이 끝나는 지점) 바로 다음에 새 분기 추가 — `MemoView` 분기 앞에 끼워넣는다:

```tsx
        ) : view === "attachments" ? (
          <AttachmentsView accounts={accounts} />
        ) : view === "memo" ? (
```

(기존 `) : view === "memo" ? (` 줄을 위 3줄로 교체하는 것과 동일 — 새 분기를 추가하고 그다음에 원래 있던 `view === "memo"` 분기가 이어지게.)

`App.tsx` 최상단 import 목록에 `AttachmentsView` 추가 — `import { CleanupView, SHORTCUTS } from "@/components/cleanup/cleanup-view"` 다음 줄에:

```ts
import { AttachmentsView } from "@/components/attachments/attachments-view"
```

- [ ] **Step 4: 타입체크 + 빌드**

Run (frontend 디렉터리에서): `npx tsc -b && npm run build`
Expected: 에러 없음

- [ ] **Step 5: 전체 테스트**

Run: `npx vitest run` (frontend), `cd ../backend && npx vitest run`
Expected: 전부 PASS

- [ ] **Step 6: 로컬 수동 확인**

Run: `npx wrangler dev`(backend) + `npx vite --port 5183`(frontend), 실제 로그인 계정으로:
1. 사이드바에 "첨부함" 항목이 보이는지, 클릭하면 화면이 열리는지
2. Gmail 계정에 첨부파일 있는 메일이 있으면 목록에 나오는지
3. 네이버/다음 계정이 연결되어 있으면 그쪽 첨부파일도 같이 나오는지 (Task 3에서 유닛테스트로
   확인 못 한 부분 — 여기서 처음 실제로 검증됨)
4. 파일명 검색, 계정 필터가 동작하는지
5. 다운로드 버튼을 눌러 실제로 파일이 받아지는지 (기존 `/mail/:id/attachment/:attachmentId`
   라우트를 그대로 쓰므로 정상 동작해야 함)
6. 계정 중 하나가 로그인 만료 등으로 실패해도 나머지 계정 결과는 나오는지 (하나만 일부러 끊어보긴
   어려우므로, 최소한 백엔드 로그에 `[attachments] account X failed, skipping` 형태로만 남고
   500 에러로 전체가 죽지 않는지 코드 리뷰로 확인)

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/hooks/use-mail-workspace.ts frontend/src/components/mail/account-sidebar.tsx frontend/src/App.tsx
git commit -m "feat: wire the attachment library into the sidebar and navigation"
```
