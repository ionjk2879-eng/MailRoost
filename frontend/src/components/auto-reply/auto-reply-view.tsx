import { Bot, ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createAutoReplyRule, deleteAutoReplyRule, fetchAutoReplyRules, updateAutoReplyRule } from "@/lib/api"
import type { AutoReplyRule } from "@/types/mail"

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"]

const EMPTY_FORM: Omit<AutoReplyRule, "id" | "createdAt"> = {
  name: "",
  enabled: true,
  fromFilter: "",
  rangeType: "date",
  startDate: "",
  endDate: "",
  daysOfWeek: [],
  startTime: "",
  endTime: "",
  replySubject: "자리 비움 안내",
  replyBody: "안녕하세요, 현재 자리를 비워 메일을 확인하기 어렵습니다. 빠른 시일 내에 답장 드리겠습니다.",
}

function RuleForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: typeof EMPTY_FORM
  onSave: (data: typeof EMPTY_FORM) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const toggleDay = (day: number) =>
    setForm((prev) => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek?.includes(day)
        ? prev.daysOfWeek.filter((d) => d !== day)
        : [...(prev.daysOfWeek ?? []), day],
    }))

  const handleSave = async () => {
    if (!form.replySubject.trim() || !form.replyBody.trim()) {
      setError("자동 응답 제목과 내용을 입력해주세요.")
      return
    }
    setSaving(true)
    setError(null)
    try { await onSave(form) } catch { setError("저장에 실패했습니다.") } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4 rounded-xl border bg-background p-5 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">규칙 이름</Label>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="휴가 자동 응답" className="mt-1.5 h-9" />
        </div>
        <div>
          <Label className="text-xs">발신자 필터</Label>
          <Input value={form.fromFilter} onChange={(e) => set("fromFilter", e.target.value)} placeholder="비워두면 모든 발신자 (이메일 부분 일치)" className="mt-1.5 h-9" />
        </div>
      </div>

      <div>
        <Label className="text-xs">기간 유형</Label>
        <div className="mt-1.5 flex gap-2">
          {(["date", "recurring", "both"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => set("rangeType", t)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${form.rangeType === t ? "border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300" : "hover:bg-muted"}`}
            >
              {t === "date" ? "날짜 범위" : t === "recurring" ? "반복 요일/시간" : "날짜 + 반복"}
            </button>
          ))}
        </div>
      </div>

      {(form.rangeType === "date" || form.rangeType === "both") && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">시작일</Label>
            <Input type="date" value={form.startDate ?? ""} onChange={(e) => set("startDate", e.target.value)} className="mt-1.5 h-9" />
          </div>
          <div>
            <Label className="text-xs">종료일</Label>
            <Input type="date" value={form.endDate ?? ""} onChange={(e) => set("endDate", e.target.value)} className="mt-1.5 h-9" />
          </div>
        </div>
      )}

      {(form.rangeType === "recurring" || form.rangeType === "both") && (
        <div className="space-y-3">
          <div>
            <Label className="text-xs">반복 요일 (비워두면 매일)</Label>
            <div className="mt-1.5 flex gap-1.5">
              {DAY_LABELS.map((label, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`size-9 rounded-lg border text-xs font-semibold transition ${form.daysOfWeek?.includes(i) ? "border-orange-500 bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300" : "hover:bg-muted"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">시작 시간</Label>
              <Input type="time" value={form.startTime ?? ""} onChange={(e) => set("startTime", e.target.value)} className="mt-1.5 h-9" />
            </div>
            <div>
              <Label className="text-xs">종료 시간</Label>
              <Input type="time" value={form.endTime ?? ""} onChange={(e) => set("endTime", e.target.value)} className="mt-1.5 h-9" />
            </div>
          </div>
        </div>
      )}

      <div>
        <Label className="text-xs">자동 응답 제목</Label>
        <Input value={form.replySubject} onChange={(e) => set("replySubject", e.target.value)} className="mt-1.5 h-9" required />
      </div>
      <div>
        <Label className="text-xs">자동 응답 내용</Label>
        <textarea
          value={form.replyBody}
          onChange={(e) => set("replyBody", e.target.value)}
          rows={4}
          className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-200"
          required
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>취소</Button>
        <Button type="button" size="sm" className="bg-orange-500 hover:bg-orange-600" disabled={saving} onClick={handleSave}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : "저장"}
        </Button>
      </div>
    </div>
  )
}

export function AutoReplyView() {
  const [rules, setRules] = useState<AutoReplyRule[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    fetchAutoReplyRules().then((data) => { setRules(data); setLoading(false) })
  }, [])

  const handleCreate = async (form: Omit<AutoReplyRule, "id" | "createdAt">) => {
    const result = await createAutoReplyRule(form)
    if (!result.ok) throw new Error(result.error)
    setRules((prev) => [...prev, result.rule])
    setShowForm(false)
  }

  const handleUpdate = async (id: string, form: Omit<AutoReplyRule, "id" | "createdAt">) => {
    const result = await updateAutoReplyRule(id, form)
    if (!result.ok) throw new Error(result.error)
    setRules((prev) => prev.map((r) => (r.id === id ? result.rule : r)))
    setEditingId(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("자동 응답 규칙을 삭제하시겠습니까?")) return
    const ok = await deleteAutoReplyRule(id)
    if (ok) setRules((prev) => prev.filter((r) => r.id !== id))
  }

  const handleToggle = async (rule: AutoReplyRule) => {
    const result = await updateAutoReplyRule(rule.id, { enabled: !rule.enabled })
    if (result.ok) setRules((prev) => prev.map((r) => (r.id === rule.id ? result.rule : r)))
  }

  const rangeLabel = (rule: AutoReplyRule) => {
    if (rule.rangeType === "date") return `${rule.startDate ?? "?"} ~ ${rule.endDate ?? "?"}`
    if (rule.rangeType === "recurring") {
      const days = rule.daysOfWeek?.length ? rule.daysOfWeek.map((d) => DAY_LABELS[d]).join("·") : "매일"
      const time = rule.startTime || rule.endTime ? ` ${rule.startTime ?? "00:00"}~${rule.endTime ?? "23:59"}` : ""
      return `${days}${time}`
    }
    return "날짜+반복"
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b bg-gradient-to-r from-orange-50/80 via-background to-background px-6 py-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-500">Auto Reply</p>
        <h2 className="mt-0.5 text-xl font-bold tracking-tight">자동 응답</h2>
        <p className="mt-1 text-xs text-muted-foreground">메일이 도착하면 자동으로 답장을 보냅니다. 동일 발신자에게는 24시간에 한 번만 발송됩니다.</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> 불러오는 중...</div>
        ) : (
          <div className="space-y-4">
            {rules.map((rule) => (
              <div key={rule.id} className={`rounded-xl border bg-background shadow-sm transition ${!rule.enabled ? "opacity-50" : ""}`}>
                <div className="flex items-center gap-3 p-4">
                  <Bot className="size-5 shrink-0 text-orange-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-sm">{rule.name || "자동 응답"}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{rangeLabel(rule)}</p>
                    {rule.fromFilter && <p className="mt-0.5 text-xs text-muted-foreground">발신자: {rule.fromFilter}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleToggle(rule)}
                      className={`relative h-5 w-9 rounded-full transition ${rule.enabled ? "bg-orange-500" : "bg-muted"}`}
                      aria-label={rule.enabled ? "비활성화" : "활성화"}
                    >
                      <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform ${rule.enabled ? "translate-x-4" : "translate-x-0.5"}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(editingId === rule.id ? null : rule.id)}
                      className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                      aria-label="편집"
                    >
                      {editingId === rule.id ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(rule.id)}
                      className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="삭제"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
                {editingId === rule.id && (
                  <div className="border-t px-4 pb-4 pt-3">
                    <RuleForm
                      initial={{ name: rule.name, enabled: rule.enabled, fromFilter: rule.fromFilter, rangeType: rule.rangeType, startDate: rule.startDate, endDate: rule.endDate, daysOfWeek: rule.daysOfWeek, startTime: rule.startTime, endTime: rule.endTime, replySubject: rule.replySubject, replyBody: rule.replyBody }}
                      onSave={(form) => handleUpdate(rule.id, form)}
                      onCancel={() => setEditingId(null)}
                    />
                  </div>
                )}
              </div>
            ))}

            {showForm ? (
              <RuleForm
                initial={EMPTY_FORM}
                onSave={handleCreate}
                onCancel={() => setShowForm(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-4 text-sm text-muted-foreground transition hover:border-orange-300 hover:bg-orange-50/50 hover:text-orange-600"
              >
                <Plus className="size-4" />
                새 자동 응답 규칙 추가
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
