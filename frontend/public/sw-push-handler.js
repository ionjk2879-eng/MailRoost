// Service Worker 푸시 알림 핸들러 — Workbox generateSW에서 importScripts로 주입됨

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      try {
        // 앱이 열려있고 화면에 보이면 알림 생략 (인앱 알림이 처리)
        const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
        const isVisible = allClients.some((c) => c.visibilityState === "visible")
        if (isVisible) return

        await self.registration.showNotification("새 메일이 있습니다", {
          body: "MailRoost에 새 메일이 도착했습니다",
          icon: "/pwa-192x192.png",
          badge: "/pwa-64x64.png",
          tag: "new-mail",
          renotify: true,
          requireInteraction: false,
        })
      } catch (err) {
        console.error("[sw-push] error:", err)
      }
    })(),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      // 이미 열려있는 창 있으면 포커스
      const existing = allClients.find((c) => new URL(c.url).pathname !== "/auth/gmail/callback")
      if (existing) {
        await existing.focus()
        return
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow("/")
      }
    })(),
  )
})
