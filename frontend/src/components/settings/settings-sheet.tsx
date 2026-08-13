import { Bell, BellOff, Moon, Sun, SunMoon, Volume2, VolumeX } from "lucide-react"
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
import { type Theme, getStoredTheme, setTheme } from "@/lib/theme"

interface SettingsSheetProps {
  open: boolean
  onClose: () => void
}

const SOUND_OPTIONS: { value: NotificationSound; label: string; description: string }[] = [
  { value: "none", label: "없음", description: "소리 없음" },
  { value: "bird", label: "새 지저귐", description: "보금자리 알림음" },
  { value: "bell", label: "부드러운 벨", description: "잔잔한 종소리" },
]

const THEME_OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "라이트", icon: <Sun className="size-3.5" /> },
  { value: "dark", label: "다크", icon: <Moon className="size-3.5" /> },
  { value: "system", label: "시스템", icon: <SunMoon className="size-3.5" /> },
]

export function SettingsSheet({ open, onClose }: SettingsSheetProps) {
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)
  const [pushError, setPushError] = useState<string | null>(null)
  const [sound, setSound] = useState<NotificationSound>("bird")
  const [pushSupported, setPushSupported] = useState(true)
  const [theme, setThemeState] = useState<Theme>("system")

  useEffect(() => {
    if (!open) return
    setPushEnabled(getPushEnabled())
    setSound(getSoundPreference())
    setPushSupported("serviceWorker" in navigator && "PushManager" in window)
    setThemeState(getStoredTheme())
    setPushError(null)
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
          setPushError(null)
          await notifyNewMail()
        } else {
          setPushError("알림 권한이 거부되었거나 지원되지 않는 브라우저입니다.")
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

  const handleThemeChange = (value: Theme) => {
    setThemeState(value)
    setTheme(value)
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent side="right" className="w-96">
        <SheetHeader className="border-b pb-4">
          <SheetTitle>설정</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-7 overflow-y-auto px-4 pb-6">
          {/* 테마 */}
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">테마</h3>
            <div className="flex gap-2">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleThemeChange(opt.value)}
                  className={`flex flex-1 flex-col items-center gap-1.5 rounded-md border py-3 text-xs transition-colors ${
                    theme === opt.value
                      ? "border-primary bg-primary/5 text-primary font-medium"
                      : "hover:bg-muted/50 text-muted-foreground"
                  }`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>
          </section>

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
            {pushError && (
              <p className="text-destructive text-xs">{pushError}</p>
            )}
          </section>

          {/* 알림 소리 */}
          <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium">알림 소리</h3>
              <p className="text-muted-foreground text-xs">앱이 열려있을 때 새 메일 도착 시 재생됩니다</p>
            </div>
            <div className="flex flex-col gap-2">
              {SOUND_OPTIONS.map((opt) => (
                <div
                  key={opt.value}
                  className={`flex cursor-pointer items-center justify-between rounded-md border px-3.5 py-2.5 transition-colors ${
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
                          playNotificationSound(opt.value)
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
