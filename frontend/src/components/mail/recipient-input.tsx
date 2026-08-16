import { Pencil, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

export interface RecipientOption {
  email: string
  name?: string
  source?: "contact" | "recent"
}

interface RecipientInputProps {
  id?: string
  value: string
  onChange: (value: string) => void
  options: RecipientOption[]
  placeholder?: string
  required?: boolean
}

function parseValue(value: string): { recipients: string[]; draft: string } {
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean)
  if (!parts.length) return { recipients: [], draft: "" }
  const trailingSeparator = /,\s*$/.test(value)
  if (trailingSeparator) return { recipients: parts, draft: "" }
  const last = parts.at(-1) ?? ""
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(last)
    ? { recipients: parts, draft: "" }
    : { recipients: parts.slice(0, -1), draft: last }
}

function labelFor(email: string, options: RecipientOption[]): string {
  return options.find((option) => option.email.toLowerCase() === email.toLowerCase())?.name || email
}

export function RecipientInput({ id, value, onChange, options, placeholder, required }: RecipientInputProps) {
  const initial = parseValue(value)
  const [recipients, setRecipients] = useState(initial.recipients)
  const [draft, setDraft] = useState(initial.draft)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastEmittedRef = useRef(value)

  const emit = (nextRecipients: string[], nextDraft: string) => {
    const serialized = [...nextRecipients, nextDraft.trim()].filter(Boolean).join(", ")
    lastEmittedRef.current = serialized
    onChange(serialized)
  }

  useEffect(() => {
    if (value === lastEmittedRef.current) return
    const parsed = parseValue(value)
    setRecipients(parsed.recipients)
    setDraft(parsed.draft)
    lastEmittedRef.current = value
  }, [value])

  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const filtered = useMemo(() => {
    const query = draft.trim().toLowerCase()
    const selected = new Set(recipients.map((email) => email.toLowerCase()))
    return options
      .filter((option) => !selected.has(option.email.toLowerCase()) && (!query || option.email.toLowerCase().includes(query) || option.name?.toLowerCase().includes(query)))
      .slice(0, 12)
  }, [draft, options, recipients])

  const addRecipient = (email: string) => {
    const normalized = email.trim().replace(/^<|>$/g, "")
    if (!normalized || recipients.some((item) => item.toLowerCase() === normalized.toLowerCase())) {
      setDraft("")
      emit(recipients, "")
      return
    }
    const next = [...recipients, normalized]
    setRecipients(next)
    setDraft("")
    emit(next, "")
    setOpen(false)
    inputRef.current?.focus()
  }

  const removeRecipient = (index: number) => {
    const next = recipients.filter((_, itemIndex) => itemIndex !== index)
    setRecipients(next)
    emit(next, draft)
  }

  const editRecipient = (index: number) => {
    const email = recipients[index]
    const next = recipients.filter((_, itemIndex) => itemIndex !== index)
    setRecipients(next)
    setDraft(email)
    emit(next, email)
    window.setTimeout(() => inputRef.current?.focus())
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="border-input bg-background focus-within:border-orange-300 focus-within:ring-orange-100 flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5 text-sm transition focus-within:ring-2">
        {recipients.map((email, index) => (
          <span key={`${email}-${index}`} className="flex max-w-full items-center gap-1 rounded-full bg-blue-50 py-1 pr-1 pl-2.5 text-xs text-blue-900 dark:bg-blue-500/15 dark:text-blue-200">
            <span className="max-w-56 truncate">{labelFor(email, options)}{labelFor(email, options) !== email && ` <${email}>`}</span>
            <button type="button" onClick={() => editRecipient(index)} className="flex size-5 items-center justify-center rounded-full text-blue-500 hover:bg-blue-100" aria-label={`${email} 수정`}><Pencil className="size-3" /></button>
            <button type="button" onClick={() => removeRecipient(index)} className="flex size-5 items-center justify-center rounded-full text-blue-400 hover:bg-blue-100 hover:text-blue-700" aria-label={`${email} 삭제`}><X className="size-3" /></button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={draft}
          placeholder={recipients.length ? "주소 추가" : placeholder}
          required={required && recipients.length === 0}
          autoComplete="off"
          className="placeholder:text-muted-foreground min-w-36 flex-1 bg-transparent py-0.5 outline-none"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            const nextDraft = event.target.value
            if (nextDraft.includes(",")) addRecipient(nextDraft.split(",")[0])
            else { setDraft(nextDraft); emit(recipients, nextDraft); setOpen(true) }
          }}
          onKeyDown={(event) => {
            if ((event.key === "Enter" || event.key === "Tab") && draft.trim()) {
              event.preventDefault()
              addRecipient(draft)
            } else if (event.key === "Backspace" && !draft && recipients.length) {
              editRecipient(recipients.length - 1)
            }
          }}
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="bg-background absolute top-full left-0 z-30 mt-1 max-h-64 w-full min-w-[260px] overflow-y-auto rounded-xl border p-1 shadow-xl">
          {filtered.map((option, index) => (
            <div key={option.email}>
              {(index === 0 || filtered[index - 1]?.source !== option.source) && <p className="bg-muted/50 rounded-md px-3 py-1.5 text-[10px] font-semibold text-muted-foreground">{option.source === "contact" ? "주소록" : "최근 받은 주소"}</p>}
              <button type="button" onClick={() => addRecipient(option.email)} className="hover:bg-accent flex w-full flex-col items-start rounded-lg px-3 py-2 text-left">
                <span className="w-full truncate text-sm">{option.name || option.email}</span>
                {option.name && option.name !== option.email && <span className="text-muted-foreground w-full truncate text-xs">{option.email}</span>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
