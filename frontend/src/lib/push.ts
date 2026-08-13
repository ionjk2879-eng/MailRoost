// Web Push 구독 관리 + Web Audio API 기반 알림 소리 합성

export type NotificationSound = "none" | "bird" | "bell"

const DEVICE_ID_KEY = "mailroost_device_id"
const SOUND_PREF_KEY = "mailroost_notification_sound"
const PUSH_ENABLED_KEY = "mailroost_push_enabled"

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

export function getSoundPreference(): NotificationSound {
  return (localStorage.getItem(SOUND_PREF_KEY) as NotificationSound) ?? "bird"
}

export function setSoundPreference(sound: NotificationSound): void {
  localStorage.setItem(SOUND_PREF_KEY, sound)
}

export function getPushEnabled(): boolean {
  return localStorage.getItem(PUSH_ENABLED_KEY) === "true"
}

export function setPushEnabled(v: boolean): void {
  localStorage.setItem(PUSH_ENABLED_KEY, v ? "true" : "false")
}

// ── 알림 소리 합성 (Web Audio API) ──────────────────────────────────────────

export function playNotificationSound(sound: NotificationSound): void {
  if (sound === "none") return
  try {
    const ctx = new AudioContext()
    if (sound === "bird") playBirdChirp(ctx)
    else if (sound === "bell") playSoftBell(ctx)
    setTimeout(() => ctx.close(), 3000)
  } catch {
    // 자동 재생 정책 등으로 실패해도 무시
  }
}

function playBirdChirp(ctx: AudioContext): void {
  // 새 지저귐: 3개의 짧은 상승-하강 주파수 스윕
  const chirp = (startTime: number, f1: number, f2: number, duration: number) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(f1, startTime)
    osc.frequency.exponentialRampToValueAtTime(f2, startTime + duration * 0.6)
    osc.frequency.exponentialRampToValueAtTime(f1 * 0.85, startTime + duration)
    gain.gain.setValueAtTime(0, startTime)
    gain.gain.linearRampToValueAtTime(0.18, startTime + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
    osc.start(startTime)
    osc.stop(startTime + duration + 0.05)
  }
  const t = ctx.currentTime
  chirp(t, 780, 1250, 0.13)
  chirp(t + 0.17, 900, 1480, 0.11)
  chirp(t + 0.31, 720, 1100, 0.15)
}

function playSoftBell(ctx: AudioContext): void {
  // 부드러운 벨: 기본음 + 고음 오버톤의 감쇠 사인파 (종소리)
  const partial = (freq: number, gain: number, decay: number) => {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = "sine"
    osc.frequency.value = freq
    osc.connect(g)
    g.connect(ctx.destination)
    g.gain.setValueAtTime(gain, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + decay)
    osc.start()
    osc.stop(ctx.currentTime + decay + 0.05)
  }
  partial(880, 0.28, 1.8)
  partial(2200, 0.09, 1.0)
  partial(4000, 0.04, 0.6)
}

// ── 구독 / 구독 해제 ─────────────────────────────────────────────────────────

async function getVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch("/api/push/vapid-public-key")
    if (!res.ok) return null
    const data = (await res.json()) as { publicKey?: string }
    return data.publicKey || null
  } catch {
    return null
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export async function subscribeToPush(): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false

    const permission = await Notification.requestPermission()
    if (permission !== "granted") return false

    const vapidKey = await getVapidPublicKey()
    if (!vapidKey) return false

    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    const sub = existing ?? (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
    }))

    const subJson = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: subJson, deviceId: getDeviceId() }),
    })

    if (res.ok) {
      setPushEnabled(true)
      return true
    }
    return false
  } catch {
    return false
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) await sub.unsubscribe()

    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: getDeviceId() }),
    })
    setPushEnabled(false)
  } catch {
    // 구독 해제 실패 시에도 로컬 상태만 정리
    setPushEnabled(false)
  }
}

// 새 메일 감지 시 다른 기기에 푸시 전송 요청
export async function notifyNewMail(): Promise<void> {
  try {
    await fetch("/api/push/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: getDeviceId() }),
    })
  } catch {
    // 실패 시 무시 (알림은 부가 기능)
  }
}
