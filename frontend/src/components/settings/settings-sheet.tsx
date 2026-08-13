import { Bell, BellOff, Volume2, VolumeX } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  type NotificationSound,
  getPushEnabled,
  getSoundPreference,
  notifyNewMail,
  playNotificationSound,
  setSoundPreference,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push"

interface SettingsSheetProps {
  open: boolean
  onClose: () => void
}

const SOUND_OPTIONS: { value: NotificationSound; label: string; description: string }[] = [
  { value: "none", label: "없음", description: "소리 없음" },
  { value: "bird", label: "새 지저귐", description: "보금자리 알림음" },
  { value: "bell", label: "부드러운 벨", description: "잔잔한 종소리" },
]

export function SettingsSheet({ open, onClose }: SettingsSheetProps) {
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)
  const [sound, setSound] = useState<NotificationSound>("bird")
  const [pushSupported, setPushSupported] = useState(true)

  useEffect(() => {
    if (!open) return
    setPushEnabled(getPushEnabled())
    setSound(getSoundPreference())
    setPushSupported("serviceWorker" in navigator && "PushManager" in window)
  }, [open])

  const handleTogglePush = useCallback(async () => {
    setPushLoading(true)
    try {
      if (pushEnabled) {
        await unsubscribeFromPush()
        setPushEnabled(false)
      } else {
        const ok = await subscribeToPush()
        if (ok) {
          setPushEnabled(true)
          // 구독 성공 테스트
          await notifyNewMail()
        } else {
          alert("알림 권한이 거부되었거나 지원되지 않는 브라우저입니다.")
        }
      }
    } finally {
      setPushLoading(false)
    }
  }, [pushEnabled])

  const handleSoundChange = (value: NotificationSound) => {
    setSound(value)
    setSoundPreference(value)
  }

  const handlePreview = (value: NotificationSound) => {
    playNotificationSound(value)
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle>설정</SheetTitle>
        </SheetHeader>

        <div className="mt-6 flex flex-col gap-6">
          {/* 푸시 알림 */}
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">푸시 알림</h3>
            {!pushSupported ? (
              <p className="text-muted-foreground text-xs">이 브라우저는 푸시 알림을 지원하지 않습니다.</p>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm">{pushEnabled ? "알림 켜짐" : "알림 꺼짐"}</span>
                  <span className="text-muted-foreground text-xs">
                    {pushEnabled ? "앱이 닫혀있어도 새 메일 알림을 받습니다" : "새 메일이 와도 알림을 보내지 않습니다"}
                  </span>
                </div>
                <Button
                  variant={pushEnabled ? "default" : "outline"}
                  size="sm"
                  className="gap-1.5"
                  onClick={handleTogglePush}
                  disabled={pushLoading}
                >
                  {pushEnabled ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />}
                  {pushEnabled ? "켜짐" : "켜기"}
                </Button>
              </div>
            )}
          </section>

          {/* 알림 소리 */}
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">알림 소리</h3>
            <p className="text-muted-foreground text-xs -mt-1">앱이 열려있을 때 새 메일 도착 시 재생됩니다</p>
            <div className="flex flex-col gap-1.5">
              {SOUND_OPTIONS.map((opt) => (
                <div
                  key={opt.value}
                  className={`flex cursor-pointer items-center justify-between rounded-md border px-3 py-2 transition-colors ${
                    sound === opt.value
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => handleSoundChange(opt.value)}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm">{opt.label}</span>
                    <span className="text-muted-foreground text-xs">{opt.description}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {opt.value !== "none" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handlePreview(opt.value)
                        }}
                        className="text-muted-foreground hover:text-foreground flex size-6 items-center justify-center rounded"
                        title="미리 듣기"
                      >
                        <Volume2 className="size-3.5" />
                      </button>
                    )}
                    {opt.value === "none" && <VolumeX className="text-muted-foreground size-3.5" />}
                    <div
                      className={`size-4 rounded-full border-2 ${
                        sound === opt.value ? "border-primary bg-primary" : "border-muted-foreground/40"
                      }`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}
