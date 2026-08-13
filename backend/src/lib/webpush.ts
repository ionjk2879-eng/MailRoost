// Cloudflare Workers Web Crypto API로 VAPID 서명 + 페이로드 없는 푸시 전송
// importScripts 방식을 쓰므로 AES-GCM 암호화(페이로드)는 불필요 — 빈 푸시로 SW에서 직접 API 조회

export interface PushSubscriptionData {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

interface VapidConfig {
  publicKey: string   // base64url 비압축 EC 공개키 (65바이트)
  privateJwk: string  // JSON: {kty, crv, d, x, y}
  subject: string     // mailto: 또는 https:
}

function toBase64url(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

function bytesToBase64url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

async function createVapidJWT(endpoint: string, cfg: VapidConfig): Promise<string> {
  const audience = new URL(endpoint).origin
  const now = Math.floor(Date.now() / 1000)

  const headerB64 = toBase64url(JSON.stringify({ alg: "ES256", typ: "JWT" }))
  const payloadB64 = toBase64url(JSON.stringify({ aud: audience, exp: now + 43200, sub: cfg.subject }))
  const signingInput = `${headerB64}.${payloadB64}`

  const jwk = JSON.parse(cfg.privateJwk) as { kty: string; crv: string; d: string; x: string; y: string }
  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, crv: jwk.crv, d: jwk.d, x: jwk.x, y: jwk.y },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  )

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    cryptoKey,
    new TextEncoder().encode(signingInput),
  )

  return `${signingInput}.${bytesToBase64url(new Uint8Array(signature))}`
}

// 빈 페이로드 푸시 (암호화 불필요). SW가 받아서 /api/mail 조회 후 알림 표시
export async function sendEmptyPush(subscription: PushSubscriptionData, cfg: VapidConfig): Promise<"ok" | "gone" | "error"> {
  try {
    const jwt = await createVapidJWT(subscription.endpoint, cfg)
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${jwt},k=${cfg.publicKey}`,
        TTL: "86400",
        "Content-Length": "0",
      },
    })
    if (response.status === 410 || response.status === 404) return "gone"
    if (response.ok || response.status === 201) return "ok"
    return "error"
  } catch {
    return "error"
  }
}
