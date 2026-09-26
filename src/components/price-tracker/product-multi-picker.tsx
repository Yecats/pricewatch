'use client'

import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { Input } from '@/components/ui/input'

export interface ProductMultiPickerItem {
  id: string
  name: string
  brand?: string | null
  category?: string | null
  barcode?: string | null
  /** Optional hint text shown after brand/category (e.g. "in 3 other groups") */
  hint?: string
}

interface Props {
  items: ProductMultiPickerItem[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
  searchable?: boolean
  emptyMessage?: string
  searchPlaceholder?: string
  /** Tailwind max-height class, e.g. 'max-h-40' or 'max-h-72' */
  maxHeight?: string
}

/**
 * Shared multi-select product picker with built-in search.
 * Used by GroupFormDialog (inline in form) and GroupDetailDialog (in Add Product modal).
 */
export function ProductMultiPicker({
  items,
  selectedIds,
  onToggle,
  searchable = true,
  emptyMessage = 'No products available.',
  searchPlaceholder = 'Search products...',
  maxHeight = 'max-h-40',
}: Props) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return items
    const q = query.trim().toLowerCase()
    return items.filter(item =>
      [item.name, item.brand, item.category, item.barcode]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [items, query, searchable])

  return (
    <div>
      {searchable && items.length > 0 && (
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          className="mb-2"
        />
      )}
      <div className={`${maxHeight} overflow-y-auto scrollbar-thin rounded-lg border divide-y`}>
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            {items.length === 0
              ? emptyMessage
              : `No matches for "${query}".`}
          </div>
        ) : (
          filtered.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(item.id)}
              className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                selectedIds.has(item.id) ? 'bg-primary/5' : 'hover:bg-accent'
              }`}
            >
              <div
                className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                  selectedIds.has(item.id) ? 'bg-primary border-primary' : 'border-input'
                }`}
              >
                {selectedIds.has(item.id) && <Check className="h-3 w-3 text-primary-foreground" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{item.name}</div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {item.brand ? `${item.brand} · ` : ''}
                  {item.category ?? 'No category'}
                  {item.hint ? ` · ${item.hint}` : ''}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
