import { AlarmClock, Loader2, MoreVertical, Pencil, Plus, Trash2, VolumeX, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { AutoSnoozeMuteAction, AutoSnoozeMuteRule, Mail } from "@/types/mail"
import type { RuleConditions } from "@/lib/api"
import { cn } from "@/lib/utils"

type RulePatch = Partial<Omit<AutoSnoozeMuteRule, "id" | "createdAt">>

interface SnoozeMuteRulesPanelProps {
  mails: Mail[]
  rules: AutoSnoozeMuteRule[]
  onCreateRule: (conditions: RuleConditions, action: AutoSnoozeMuteAction, name?: string) => Promise<{ ok: boolean; error?: string }>
  onUpdateRule: (ruleId: string, patch: RulePatch) => Promise<{ ok: boolean; error?: string }>
  onToggleRule: (ruleId: string, enabled: boolean) => void
  onDeleteRule: (ruleId: string) => void
  className?: string
}

// 조건 중 비어있지 않은 것들만 사람이 읽을 수 있는 문구로 이어붙인다.
function ruleConditionParts(conditions: RuleConditions): string[] {
  const parts: string[] = []
  if (conditions.from) parts.push(`발신자에 ${conditions.from} 포함`)
  if (conditions.subject) parts.push(`제목에 ${conditions.subject} 포함`)
  if (conditions.excludeFrom) parts.push(`발신자에 ${conditions.excludeFrom} 제외`)
  if (conditions.excludeSubject) parts.push(`제목에 ${conditions.excludeSubject} 제외`)
  return parts
}

export function SnoozeMuteRulesPanel({ mails, rules, onCreateRule, onUpdateRule, onToggleRule, onDeleteRule, className }: SnoozeMuteRulesPanelProps) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [from, setFrom] = useState("")
  const [subject, setSubject] = useState("")
  const [excludeFrom, setExcludeFrom] = useState("")
  const [excludeSubject, setExcludeSubject] = useState("")
  const [actionType, setActionType] = useState<"snooze" | "mute">("snooze")
  const [days, setDays] = useState(3)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)

  // 현재 로드된 메일에서 발신자 후보를 뽑아 "발신자 포함" 입력 시 선택할 수 있게 한다 — 직접 입력도 그대로 가능하다.
  const [suggestOpen, setSuggestOpen] = useState(false)
  const suggestRef = useRef<HTMLDivElement>(null)
  const senderOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const m of mails) {
      if (!m.fromEmail || seen.has(m.fromEmail)) continue
      seen.set(m.fromEmail, m.fromName && m.fromName !== m.fromEmail ? `${m.fromName} <${m.fromEmail}>` : m.fromEmail)
    }
    return [...seen.entries()].map(([value, label]) => ({ value, label }))
  }, [mails])
  const filteredSenderOptions = useMemo(() => {
    const q = from.trim().toLowerCase()
    const matches = q ? senderOptions.filter((o) => o.label.toLowerCase().includes(q)) : senderOptions
    return matches.slice(0, 20)
  }, [senderOptions, from])

  useEffect(() => {
    if (!suggestOpen) return
    const handler = (e: MouseEvent) => {
      if (suggestRef.current && !suggestRef.current.contains(e.target as Node)) setSuggestOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [suggestOpen])

  const ruleDisplayName = (rule: AutoSnoozeMuteRule) => rule.name || ruleConditionParts(rule).join(", ") || "새 규칙"
  const actionLabel = (action: AutoSnoozeMuteAction) => (action.type === "snooze" ? `${action.days}일 뒤 다시 알림` : "뮤트")

  const resetConditions = () => { setFrom(""); setSubject(""); setExcludeFrom(""); setExcludeSubject("") }
  const openCreate = () => {
    setEditingId(null); setName(""); resetConditions(); setActionType("snooze"); setDays(3)
    setMessage(null); setSuggestOpen(false); setPanelOpen(true)
  }
  const openEdit = (rule: AutoSnoozeMuteRule) => {
    setEditingId(rule.id); setName(rule.name || ruleConditionParts(rule).join(", "))
    setFrom(rule.from); setSubject(rule.subject); setExcludeFrom(rule.excludeFrom); setExcludeSubject(rule.excludeSubject)
    setActionType(rule.action.type); setDays(rule.action.type === "snooze" ? rule.action.days : 3)
    setMessage(null); setMenuId(null); setSuggestOpen(false); setPanelOpen(true)
  }

  const hasCondition = from.trim() !== "" || subject.trim() !== ""
  const actionValid = actionType === "mute" || days >= 1

  const save = async () => {
    if (!hasCondition || !actionValid) return
    const conditions: RuleConditions = { from: from.trim(), subject: subject.trim(), excludeFrom: excludeFrom.trim(), excludeSubject: excludeSubject.trim() }
    const action: AutoSnoozeMuteAction = actionType === "snooze" ? { type: "snooze", days } : { type: "mute" }
    setSaving(true); setMessage(null)
    const result = editingId
      ? await onUpdateRule(editingId, { name: name.trim() || undefined, ...conditions, action })
      : await onCreateRule(conditions, action, name.trim() || undefined)
    setSaving(false)
    if (!result.ok) { setMessage(result.error ?? "규칙을 저장하지 못했습니다."); return }
    setPanelOpen(false)
  }

  return (
    <section className={cn("relative min-h-0 overflow-hidden rounded-xl border bg-background", className)}>
      <div className="flex h-[78px] items-center justify-between border-b px-5">
        <div>
          <h2 className="text-lg font-semibold">자동 규칙</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{rules.length}개의 규칙</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={openCreate}><Plus className="size-4" />새 규칙</Button>
      </div>
      <div className="h-[calc(100%-78px)] overflow-y-auto">
        <div>
          {rules.map((rule) => {
            const conditionText = ruleConditionParts(rule).join(", ") || "-"
            return (
              <div key={rule.id} className={cn("relative flex items-start gap-3 border-b px-5 py-4", !rule.enabled && "opacity-55")}>
                <span className={cn(
                  "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                  rule.action.type === "snooze" ? "bg-orange-50 text-orange-600" : "bg-muted text-muted-foreground",
                )}>
                  {rule.action.type === "snooze" ? <AlarmClock className="size-4" /> : <VolumeX className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{ruleDisplayName(rule)}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{conditionText}</p>
                  <p className="mt-1 text-xs font-medium text-primary">{actionLabel(rule.action)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" role="switch" aria-checked={rule.enabled} onClick={() => onToggleRule(rule.id, !rule.enabled)} className={cn("h-5 w-9 rounded-full p-0.5 transition-colors", rule.enabled ? "bg-green-600" : "bg-muted-foreground/30")}>
                    <span className={cn("block size-4 rounded-full bg-white shadow transition-transform", rule.enabled && "translate-x-4")} />
                  </button>
                  <button type="button" onClick={() => setMenuId(menuId === rule.id ? null : rule.id)} className="rounded-md p-1.5 hover:bg-muted"><MoreVertical className="size-4" /></button>
                  {menuId === rule.id && (
                    <div className="absolute right-3 top-14 z-20 w-32 rounded-lg border bg-background p-1 shadow-lg">
                      <button type="button" onClick={() => openEdit(rule)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"><Pencil className="size-3.5" />수정</button>
                      <button type="button" onClick={() => { onDeleteRule(rule.id); setMenuId(null) }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-muted"><Trash2 className="size-3.5" />삭제</button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          {rules.length === 0 && (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
              <AlarmClock className="size-11 opacity-35" />
              <p>아직 자동 규칙이 없습니다.<br />조건에 맞는 새 메일이 오면 자동으로 스누즈하거나 뮤트해보세요.</p>
            </div>
          )}
        </div>
      </div>

      {panelOpen && (
        <>
          <div className="fixed inset-0 z-30 bg-black/20" onClick={() => setPanelOpen(false)} />
          <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[380px] flex-col border-l bg-background shadow-2xl">
            <div className="flex h-16 items-center justify-between border-b px-6">
              <h3 className="text-lg font-semibold">{editingId ? "규칙 수정" : "새 자동 규칙"}</h3>
              <button type="button" onClick={() => setPanelOpen(false)} className="rounded-md p-2 hover:bg-muted"><X className="size-5" /></button>
            </div>
            <div className="flex-1 space-y-7 overflow-y-auto p-6">
              <label className="block space-y-2"><span className="text-sm font-medium">규칙 이름</span><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 뉴스레터 자동 스누즈" /></label>

              <div className="space-y-3">
                <p className="text-sm font-medium">조건</p>
                <p className="text-sm text-muted-foreground">다음 조건을 모두 만족하는 새 메일이 도착하면 (발신자·제목 포함 조건 중 하나는 입력)</p>

                <label className="block space-y-1.5">
                  <span className="text-xs text-muted-foreground">발신자 포함</span>
                  <div className="relative" ref={suggestRef}>
                    <Input
                      value={from}
                      onChange={(event) => { setFrom(event.target.value); setSuggestOpen(true) }}
                      onFocus={() => setSuggestOpen(true)}
                      placeholder="예: newsletter (아래 목록에서 선택도 가능)"
                    />
                    {suggestOpen && filteredSenderOptions.length > 0 && (
                      <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-background py-1 shadow-lg">
                        {filteredSenderOptions.map((option) => (
                          <button key={option.value} type="button" onClick={() => { setFrom(option.value); setSuggestOpen(false) }} className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-muted">
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </label>

                <label className="block space-y-1.5"><span className="text-xs text-muted-foreground">발신자 제외</span><Input value={excludeFrom} onChange={(event) => setExcludeFrom(event.target.value)} placeholder="예: 중요고객" /></label>
                <label className="block space-y-1.5"><span className="text-xs text-muted-foreground">제목 포함</span><Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="예: 소식" /></label>
                <label className="block space-y-1.5"><span className="text-xs text-muted-foreground">제목 제외</span><Input value={excludeSubject} onChange={(event) => setExcludeSubject(event.target.value)} placeholder="예: 긴급" /></label>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium">이 메일을 받으면</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setActionType("snooze")}
                    className={cn("flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium", actionType === "snooze" ? "border-primary bg-primary/5 text-primary" : "text-muted-foreground")}
                  >
                    <AlarmClock className="size-4" />스누즈
                  </button>
                  <button
                    type="button"
                    onClick={() => setActionType("mute")}
                    className={cn("flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium", actionType === "mute" ? "border-primary bg-primary/5 text-primary" : "text-muted-foreground")}
                  >
                    <VolumeX className="size-4" />뮤트
                  </button>
                </div>
                {actionType === "snooze" && (
                  <label className="flex items-center gap-2 text-sm">
                    <Input type="number" min={1} value={days} onChange={(event) => setDays(Math.max(1, Number(event.target.value) || 1))} className="w-20" />
                    일 뒤 다시 받은편지함에 표시
                  </label>
                )}
                {actionType === "mute" && <p className="text-sm text-muted-foreground">이 발신자를 뮤트 목록에 추가해 새 메일 알림에서 제외합니다.</p>}
              </div>

              {message && <p className="text-sm text-destructive">{message}</p>}
            </div>
            <div className="grid grid-cols-[96px_1fr] gap-3 border-t p-6">
              <Button variant="outline" className="h-11" onClick={() => setPanelOpen(false)}>취소</Button>
              <Button className="h-11" disabled={saving || !hasCondition || !actionValid} onClick={save}>{saving ? <Loader2 className="size-4 animate-spin" /> : "규칙 저장"}</Button>
            </div>
          </aside>
        </>
      )}
    </section>
  )
}
