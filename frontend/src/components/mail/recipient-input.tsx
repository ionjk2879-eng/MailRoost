import { useEffect, useMemo, useRef, useState } from "react"
import { Input } from "@/components/ui/input"

export interface RecipientOption {
  email: string
  name?: string
}

interface RecipientInputProps {
  id?: string
  value: string
  onChange: (value: string) => void
  options: RecipientOption[]
  placeholder?: string
  required?: boolean
}

// 콤마로 구분된 여러 수신자 중 지금 커서가 있는(마지막) 토큰만 자동완성 대상으로 삼는다.
function currentToken(value: string): string {
  const idx = value.lastIndexOf(",")
  return (idx === -1 ? value : value.slice(idx + 1)).trim()
}

function replaceLastToken(value: string, email: string): string {
  const idx = value.lastIndexOf(",")
  const prefix = idx === -1 ? "" : `${value.slice(0, idx + 1)} `
  return `${prefix}${email}, `
}

export function RecipientInput({ id, value, onChange, options, placeholder, required }: RecipientInputProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const token = currentToken(value)
  const filtered = useMemo(() => {
    if (!token) return []
    const q = token.toLowerCase()
    const already = new Set(value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))
    return options
      .filter(
        (o) =>
          !already.has(o.email.toLowerCase()) &&
          (o.email.toLowerCase().includes(q) || (o.name && o.name.toLowerCase().includes(q))),
      )
      .slice(0, 8)
  }, [options, token, value])

  return (
    <div ref={ref} className="relative">
      <Input
        id={id}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        required={required}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="bg-background absolute top-full left-0 z-20 mt-1 max-h-56 w-full min-w-[240px] overflow-y-auto rounded-md border shadow-md">
          {filtered.map((o) => (
            <button
              key={o.email}
              type="button"
              onClick={() => {
                onChange(replaceLastToken(value, o.email))
                setOpen(false)
              }}
              className="hover:bg-accent flex w-full flex-col items-start px-3 py-1.5 text-left"
            >
              <span className="truncate text-sm">{o.name || o.email}</span>
              {o.name && o.name !== o.email && (
                <span className="text-muted-foreground w-full truncate text-xs">{o.email}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
