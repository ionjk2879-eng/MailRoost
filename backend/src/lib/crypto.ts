// 계정 자격증명(비밀번호/토큰)을 KV에 저장하기 전 암호화하기 위한 헬퍼.
// AES-GCM, 키는 ACCOUNT_ENCRYPTION_KEY 시크릿(32바이트, base64)에서 가져온다.

import type { ConnectedAccountRecord, Env } from "../types"

const IV_LENGTH = 12
const ENC_PREFIX = "enc:"

let cachedKey: CryptoKey | null = null
let cachedKeyMaterial: string | null = null

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function getAesKey(env: Env): Promise<CryptoKey> {
  if (cachedKey && cachedKeyMaterial === env.ACCOUNT_ENCRYPTION_KEY) return cachedKey
  if (!env.ACCOUNT_ENCRYPTION_KEY) throw new Error("no-key")
  const raw = base64ToBytes(env.ACCOUNT_ENCRYPTION_KEY)
  cachedKey = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
  cachedKeyMaterial = env.ACCOUNT_ENCRYPTION_KEY
  return cachedKey
}

async function encryptSecret(env: Env, plaintext: string): Promise<string> {
  const key = await getAesKey(env)
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext))
  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), iv.length)
  return ENC_PREFIX + bytesToBase64(combined)
}

async function decryptSecret(env: Env, encoded: string): Promise<string> {
  const key = await getAesKey(env)
  const combined = base64ToBytes(encoded.slice(ENC_PREFIX.length))
  const iv = combined.slice(0, IV_LENGTH)
  const ciphertext = combined.slice(IV_LENGTH)
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext)
  return new TextDecoder().decode(plaintext)
}

// 이미 저장돼 있던 평문 값과 섞여도 안전하게 처리한다: enc: 접두어가 있으면 복호화하고,
// 없으면(과거에 평문으로 저장된 값) 그대로 돌려준다. 다음에 그 레코드가 다시 저장될 때
// encryptField가 다시 호출되면서 자연스럽게 암호화된 형태로 바뀐다(별도 마이그레이션 불필요).
export async function decryptField(env: Env, value: string): Promise<string> {
  if (!value.startsWith(ENC_PREFIX)) return value
  if (!env.ACCOUNT_ENCRYPTION_KEY) return value  // 암호화된 값인데 키가 없으면 그대로 반환 (계정 접근 불가 상태)
  return decryptSecret(env, value)
}

export async function encryptField(env: Env, value: string): Promise<string> {
  if (!env.ACCOUNT_ENCRYPTION_KEY) return value
  return encryptSecret(env, value)
}

// provider별로 실제 비밀(비밀번호/토큰)에 해당하는 필드만 암호화/복호화한다.
// email/label/host처럼 민감하지 않은 필드는 그대로 둔다.
export async function encryptAccountRecord(env: Env, record: ConnectedAccountRecord): Promise<ConnectedAccountRecord> {
  switch (record.provider) {
    case "gmail":
      return {
        ...record,
        accessToken: await encryptField(env, record.accessToken),
        refreshToken: await encryptField(env, record.refreshToken),
      }
    case "naver":
      return { ...record, appPassword: await encryptField(env, record.appPassword) }
    case "daum":
      return { ...record, password: await encryptField(env, record.password) }
    case "imap":
      return { ...record, password: await encryptField(env, record.password) }
  }
}

export async function decryptAccountRecord(env: Env, record: ConnectedAccountRecord): Promise<ConnectedAccountRecord> {
  switch (record.provider) {
    case "gmail":
      return {
        ...record,
        accessToken: await decryptField(env, record.accessToken),
        refreshToken: await decryptField(env, record.refreshToken),
      }
    case "naver":
      return { ...record, appPassword: await decryptField(env, record.appPassword) }
    case "daum":
      return { ...record, password: await decryptField(env, record.password) }
    case "imap":
      return { ...record, password: await decryptField(env, record.password) }
  }
}

export async function encryptAccountsMap(
  env: Env,
  accounts: Record<string, ConnectedAccountRecord>,
): Promise<Record<string, ConnectedAccountRecord>> {
  const entries = await Promise.all(
    Object.entries(accounts).map(async ([id, record]) => [id, await encryptAccountRecord(env, record)] as const),
  )
  return Object.fromEntries(entries)
}

export async function decryptAccountsMap(
  env: Env,
  accounts: Record<string, ConnectedAccountRecord>,
): Promise<Record<string, ConnectedAccountRecord>> {
  const entries = await Promise.all(
    Object.entries(accounts).map(async ([id, record]) => [id, await decryptAccountRecord(env, record)] as const),
  )
  return Object.fromEntries(entries)
}
