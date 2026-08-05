import type { MailCategory } from "@/types/mail"
import { cn } from "@/lib/utils"

const CATEGORIES: { id: MailCategory; label: string }[] = [
  { id: "primary", label: "기본" },
  { id: "social", label: "소셜" },
  { id: "promotions", label: "프로모션" },
  { id: "updates", label: "업데이트" },
  { id: "forums", label: "포럼" },
]

interface CategoryTabsProps {
  counts: Record<MailCategory, number>
  selected: MailCategory | null
  onSelect: (category: MailCategory | null) => void
}

export function CategoryTabs({ counts, selected, onSelect }: CategoryTabsProps) {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0)

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b px-2">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          "shrink-0 border-b-2 px-3 py-2 text-sm transition-colors",
          selected === null
            ? "border-primary text-foreground font-medium"
            : "text-muted-foreground border-transparent hover:text-foreground",
        )}
      >
        전체 {total > 0 && <span className="text-xs">({total})</span>}
      </button>
      {CATEGORIES.filter((c) => counts[c.id] > 0).map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c.id)}
          className={cn(
            "shrink-0 border-b-2 px-3 py-2 text-sm transition-colors",
            selected === c.id
              ? "border-primary text-foreground font-medium"
              : "text-muted-foreground border-transparent hover:text-foreground",
          )}
        >
          {c.label} <span className="text-xs">({counts[c.id]})</span>
        </button>
      ))}
    </div>
  )
}
