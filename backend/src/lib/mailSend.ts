import type { ConnectedAccountRecord, Env, ForwardedAttachmentRef } from "../types"
import { ensureFreshToken, getAttachment as gmailGetAttachment, sendGmailMessage } from "./gmail"
import { daumGetAttachment, imapGetAttachment, naverGetAttachment } from "./imap"
import type { OutgoingAttachment } from "./mime"
import { daumSendMail, naverSendMail, sendSmtp } from "./smtp"

// 첨부파일 다운로드 라우트와 전달(forward) 발송 양쪽에서 쓰는 provider별 분기.
// accountMap을 직접 변형하지 않고, 토큰이 갱신됐으면 updatedRecord로 돌려줘서 호출부가 저장하게 한다.
export async function fetchAttachmentForAccount(
  env: Env,
  accountMap: Record<string, ConnectedAccountRecord>,
  accountId: string,
  mailId: string,
  attachmentId: string,
  fallback: { filename: string; mimeType: string },
): Promise<{
  result: { bytes: Uint8Array; mimeType: string; filename: string } | null
  updatedRecord?: ConnectedAccountRecord
}> {
  const record = accountMap[accountId]
  if (!record) return { result: null }

  if (record.provider === "naver") {
    return { result: await naverGetAttachment(record.email, record.appPassword, mailId, attachmentId) }
  }
  if (record.provider === "daum") {
    return { result: await daumGetAttachment(record.email, record.password, mailId, attachmentId) }
  }
  if (record.provider === "imap") {
    return {
      result: await imapGetAttachment(
        { host: record.host, port: record.port, email: record.email, password: record.password },
        mailId,
        attachmentId,
      ),
    }
  }

  const fresh = await ensureFreshToken(env, record)
  const updatedRecord = fresh.accessToken !== record.accessToken ? fresh : undefined
  const gmailResult = await gmailGetAttachment(fresh.accessToken, mailId, attachmentId)
  const result = gmailResult ? { ...gmailResult, mimeType: fallback.mimeType, filename: fallback.filename } : null
  return { result, updatedRecord }
}

// 전달(forward)로 넘어온 원본 첨부 참조들을 실제 바이트로 바꾼다. 원본이 다른 계정 것이어도
// (지금 보내는 계정과 달라도) accountMap에 이미 그 사용자의 계정이 전부 들어있으니 그대로 조회된다.
export async function resolveForwardedAttachments(
  env: Env,
  accountMap: Record<string, ConnectedAccountRecord>,
  refs: ForwardedAttachmentRef[],
): Promise<{ attachments: OutgoingAttachment[]; accountsChanged: boolean }> {
  const attachments: OutgoingAttachment[] = []
  let accountsChanged = false
  for (const ref of refs) {
    const { result, updatedRecord } = await fetchAttachmentForAccount(env, accountMap, ref.accountId, ref.mailId, ref.attachmentId, {
      filename: ref.filename,
      mimeType: ref.mimeType,
    })
    if (updatedRecord) {
      accountMap[ref.accountId] = updatedRecord
      accountsChanged = true
    }
    if (result) attachments.push({ filename: result.filename || ref.filename, mimeType: result.mimeType || ref.mimeType, bytes: result.bytes })
  }
  return { attachments, accountsChanged }
}

// 계정 provider별 발송 분기. 토큰이 갱신됐으면 updatedRecord로 돌려줘서 호출부가 저장하게 한다.
export async function sendViaRecord(
  env: Env,
  record: ConnectedAccountRecord,
  to: string,
  subject: string,
  body: string,
  cc?: string,
  bcc?: string,
  attachments?: OutgoingAttachment[],
): Promise<{ updatedRecord?: ConnectedAccountRecord }> {
  if (record.provider === "naver") {
    await naverSendMail(record.email, record.appPassword, to, subject, body, cc, bcc, attachments)
    return {}
  }
  if (record.provider === "daum") {
    await daumSendMail(record.email, record.password, to, subject, body, cc, bcc, attachments)
    return {}
  }
  if (record.provider === "imap") {
    // 예전에 연결한 계정에는 smtpHost/smtpPort가 없을 수 있어 IMAP 호스트에서 다시 추측한다.
    const smtpHost = record.smtpHost || (record.host.startsWith("imap.") ? record.host.replace(/^imap\./, "smtp.") : `smtp.${record.host}`)
    const smtpPort = record.smtpPort || 465
    await sendSmtp(smtpHost, smtpPort, record.email, record.password, to, subject, body, cc, bcc, attachments)
    return {}
  }

  const fresh = await ensureFreshToken(env, record)
  await sendGmailMessage(fresh.accessToken, record.email, to, subject, body, cc, bcc, attachments)
  return fresh.accessToken !== record.accessToken ? { updatedRecord: fresh } : {}
}
