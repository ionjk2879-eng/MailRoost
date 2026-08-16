import { Check, Folder, GripVertical, Loader2, MoreVertical, Pencil, Plus, Trash2, X } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ARCHIVE_FOLDER_ID } from "@/types/mail"
import type { AutoClassifyRule, MailCategory, MailFolder } from "@/types/mail"
import { cn } from "@/lib/utils"

const CATEGORY_LABELS: Record<MailCategory, string> = {
  primary: "기본", social: "소셜", promotions: "프로모션", updates: "업데이트", forums: "포럼",
}

type RulePatch = Partial<Pick<AutoClassifyRule, "name" | "field" | "keyword" | "targetFolderId" | "category" | "enabled">>

interface AutoRulesViewProps {
  folders: MailFolder[]
  rules: AutoClassifyRule[]
  onCreateRule: (field: "from" | "subject", keyword: string, targetFolderId: string | null, category: MailCategory | null, applyToExisting?: boolean, name?: string) => Promise<{ ok: boolean; error?: string; count?: number }>
  onUpdateRule: (ruleId: string, patch: RulePatch) => Promise<{ ok: boolean; error?: string }>
  onToggleRule: (ruleId: string, enabled: boolean) => void
  onDeleteRule: (ruleId: string) => void
  onApplyRuleToExisting: (ruleId: string) => Promise<{ ok: boolean; error?: string; count?: number; alreadyClassified?: number }>
}

export function AutoRulesView({ folders, rules, onCreateRule, onUpdateRule, onToggleRule, onDeleteRule, onApplyRuleToExisting }: AutoRulesViewProps) {
  const destinations = [{ id: ARCHIVE_FOLDER_ID, name: "보관함" }, ...folders]
  const [panelOpen, setPanelOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [field, setField] = useState<"from" | "subject">("from")
  const [keyword, setKeyword] = useState("")
  const [destination, setDestination] = useState(`folder:${ARCHIVE_FOLDER_ID}`)
  const [applyExisting, setApplyExisting] = useState(true)
  const [enabled, setEnabled] = useState(true)
  const [saving, setSaving] = useState(false)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)

  const folderName = (id: string) => destinations.find((folder) => folder.id === id)?.name ?? "삭제된 폴더"
  const openCreate = () => {
    setEditingId(null); setName(""); setField("from"); setKeyword(""); setDestination(`folder:${ARCHIVE_FOLDER_ID}`)
    setApplyExisting(true); setEnabled(true); setMessage(null); setPanelOpen(true)
  }
  const openEdit = (rule: AutoClassifyRule) => {
    setEditingId(rule.id); setName(rule.name || `${rule.field === "from" ? "발신자" : "제목"} · ${rule.keyword}`)
    setField(rule.field); setKeyword(rule.keyword)
    setDestination(rule.targetFolderId ? `folder:${rule.targetFolderId}` : `category:${rule.category ?? "primary"}`)
    setApplyExisting(false); setEnabled(rule.enabled); setMessage(null); setMenuId(null); setPanelOpen(true)
  }

  const save = async () => {
    if (!name.trim() || !keyword.trim()) return
    const [kind, value] = destination.split(":") as ["folder" | "category", string]
    const patch: RulePatch = {
      name: name.trim(), field, keyword: keyword.trim(), enabled,
      targetFolderId: kind === "folder" ? value : null,
      category: kind === "category" ? value as MailCategory : null,
    }
    setSaving(true); setMessage(null)
    const result = editingId
      ? await onUpdateRule(editingId, patch)
      : await onCreateRule(field, keyword.trim(), patch.targetFolderId ?? null, patch.category ?? null, applyExisting, name.trim())
    setSaving(false)
    if (!result.ok) { setMessage(result.error ?? "규칙을 저장하지 못했습니다."); return }
    setPanelOpen(false)
  }

  const apply = async (ruleId: string) => {
    setApplyingId(ruleId); setMessage(null)
    const result = await onApplyRuleToExisting(ruleId)
    setApplyingId(null)
    setMessage(result.ok ? `기존 메일 ${result.count ?? 0}개에 규칙을 적용했습니다.` : result.error ?? "적용하지 못했습니다.")
  }

  return (
    <div className="relative min-h-full">
      <div className={cn("transition-[padding]", panelOpen && "xl:pr-[390px]")}>
        <div className="mb-10 flex items-start justify-between gap-4">
          <div><h2 className="text-2xl font-bold tracking-tight">자동분류 규칙</h2><p className="mt-3 text-sm text-muted-foreground">설정한 조건에 따라 메일을 자동으로 분류하고 지정한 폴더로 이동합니다.</p></div>
          <Button className="h-11 gap-2 px-5" onClick={openCreate}><Plus className="size-4" />새 규칙</Button>
        </div>

        <div className="overflow-visible">
          <div className="hidden grid-cols-[1.1fr_1.35fr_1fr_.75fr_.7fr] gap-4 px-5 pb-3 text-xs font-medium text-muted-foreground md:grid">
            <span>규칙 이름</span><span>조건</span><span>이동할 폴더</span><span>기존 메일에도 적용</span><span>활성</span>
          </div>
          <div className="space-y-3">
            {rules.map((rule) => (
              <div key={rule.id} className={cn("relative grid items-start gap-4 rounded-xl border bg-background px-4 py-5 shadow-sm md:grid-cols-[1.1fr_1.35fr_1fr_.75fr_.7fr]", !rule.enabled && "opacity-55")}>
                <div className="flex min-w-0 items-center gap-2"><GripVertical className="size-4 shrink-0 text-muted-foreground" /><strong className="truncate">{rule.name || `${rule.field === "from" ? "발신자" : "제목"} · ${rule.keyword}`}</strong></div>
                <div><span className="inline-flex rounded-md bg-muted px-3 py-2 text-sm">{rule.field === "from" ? "발신자" : "제목"}에 {rule.keyword} 포함</span></div>
                <div>{rule.targetFolderId ? <span className="inline-flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700"><Folder className="size-4" />{folderName(rule.targetFolderId)}</span> : <span className="text-sm">{rule.category ? CATEGORY_LABELS[rule.category] : "-"}</span>}</div>
                <div className="flex items-center gap-2">
                  {rule.targetFolderId ? <button type="button" title="기존 메일에도 적용" disabled={applyingId === rule.id} onClick={() => apply(rule.id)} className="flex size-7 items-center justify-center rounded-full border border-green-600 text-green-600 hover:bg-green-50">{applyingId === rule.id ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-4" />}</button> : <span className="text-muted-foreground">-</span>}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <button type="button" role="switch" aria-checked={rule.enabled} onClick={() => onToggleRule(rule.id, !rule.enabled)} className={cn("h-6 w-11 rounded-full p-0.5 transition-colors", rule.enabled ? "bg-green-600" : "bg-muted-foreground/30")}><span className={cn("block size-5 rounded-full bg-white shadow transition-transform", rule.enabled && "translate-x-5")} /></button>
                  <button type="button" onClick={() => setMenuId(menuId === rule.id ? null : rule.id)} className="rounded-md p-1.5 hover:bg-muted"><MoreVertical className="size-4" /></button>
                  {menuId === rule.id && <div className="absolute right-3 top-14 z-20 w-32 rounded-lg border bg-background p-1 shadow-lg"><button type="button" onClick={() => openEdit(rule)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"><Pencil className="size-3.5" />수정</button><button type="button" onClick={() => { onDeleteRule(rule.id); setMenuId(null) }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-muted"><Trash2 className="size-3.5" />삭제</button></div>}
                </div>
              </div>
            ))}
            {rules.length === 0 && <div className="rounded-xl border border-dashed py-20 text-center text-sm text-muted-foreground">아직 자동분류 규칙이 없습니다.<br />새 규칙을 만들어 반복적인 메일 정리를 자동화해 보세요.</div>}
          </div>
        </div>
        {message && <p className="mt-4 text-sm text-muted-foreground">{message}</p>}
      </div>

      {panelOpen && <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[400px] flex-col border-l bg-background shadow-2xl">
        <div className="flex h-16 items-center justify-between border-b px-6"><h3 className="text-lg font-semibold">{editingId ? "규칙 수정" : "새 규칙"}</h3><button type="button" onClick={() => setPanelOpen(false)} className="rounded-md p-2 hover:bg-muted"><X className="size-5" /></button></div>
        <div className="flex-1 space-y-7 overflow-y-auto p-6">
          <label className="block space-y-2"><span className="text-sm font-medium">규칙 이름</span><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 프로모션 메일" /></label>
          <div className="space-y-3"><p className="text-sm font-medium">조건</p><p className="text-sm text-muted-foreground">다음 조건을 모두 만족할 때</p><div className="grid grid-cols-2 gap-2"><select value={field} onChange={(event) => setField(event.target.value as "from" | "subject")} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="from">발신자</option><option value="subject">제목</option></select><select className="h-10 rounded-md border bg-background px-3 text-sm"><option>포함</option></select></div><Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={field === "from" ? "예: pay" : "예: 이벤트"} /></div>
          <label className="block space-y-2"><span className="text-sm font-medium">이동할 폴더</span><select value={destination} onChange={(event) => setDestination(event.target.value)} className="h-11 w-full rounded-md border bg-background px-3 text-sm"><optgroup label="폴더">{destinations.map((folder) => <option key={folder.id} value={`folder:${folder.id}`}>{folder.name}</option>)}</optgroup><optgroup label="카테고리">{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={`category:${value}`}>{label}</option>)}</optgroup></select></label>
          {destination.startsWith("folder:") && !editingId && <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={applyExisting} onChange={(event) => setApplyExisting(event.target.checked)} className="size-4 accent-primary" />기존 메일에도 적용</label>}
          <div className="flex items-center justify-between"><span className="text-sm font-medium">활성</span><button type="button" role="switch" aria-checked={enabled} onClick={() => setEnabled(!enabled)} className={cn("h-6 w-11 rounded-full p-0.5", enabled ? "bg-green-600" : "bg-muted-foreground/30")}><span className={cn("block size-5 rounded-full bg-white shadow transition-transform", enabled && "translate-x-5")} /></button></div>
          {message && <p className="text-sm text-destructive">{message}</p>}
        </div>
        <div className="grid grid-cols-[96px_1fr] gap-3 border-t p-6"><Button variant="outline" className="h-11" onClick={() => setPanelOpen(false)}>취소</Button><Button className="h-11" disabled={saving || !name.trim() || !keyword.trim()} onClick={save}>{saving ? <Loader2 className="size-4 animate-spin" /> : "규칙 저장"}</Button></div>
      </aside>}
    </div>
  )
}
