'use client'

import { Package, Plus, ArrowRight, Check, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { BarcodeLookupResult } from '@/lib/barcode'

interface ExistingGroup {
  id: string
  name: string
  category?: string | null
  priceCount: number
  score: number
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** The barcode lookup result that was scanned */
  lookup: BarcodeLookupResult | null
  /** Similar existing groups found by name, sorted by score (best first) */
  matches: ExistingGroup[]
  /** Called when the user picks an existing group to add a variant to */
  onPickExisting: (groupId: string) => void
  /** Called when the user chooses to create a new group */
  onCreateNew: () => void
}

export function VariantPickerDialog({
  open,
  onOpenChange,
  lookup,
  matches,
  onPickExisting,
  onCreateNew,
}: Props) {
  // The best match (highest score) is the "recommended" group
  const recommended = matches.length > 0 ? matches[0] : null
  // All other matches (lower score)
  const others = matches.length > 1 ? matches.slice(1) : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Add to a group
          </DialogTitle>
          <DialogDescription>
            Pick which group this product belongs to, or create a new one.
          </DialogDescription>
        </DialogHeader>

        {/* Scanned product info */}
        {lookup && (
          <div className="rounded-lg border bg-muted/40 p-3 flex gap-3">
            {lookup.imageUrl && (
              <div className="h-14 w-14 shrink-0 rounded-md overflow-hidden border bg-muted">
                {/* Using a plain img because URL comes from a third-party API */}
                <img
                  src={lookup.imageUrl}
                  alt={lookup.name}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Scanned product
              </div>
              <div className="font-medium text-sm truncate">{lookup.name}</div>
              {lookup.brand && (
                <div className="text-xs text-muted-foreground truncate">{lookup.brand}</div>
              )}
              <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                {lookup.barcode}
              </div>
            </div>
          </div>
        )}

        {/* Recommended group (best match) */}
        {recommended && (
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-primary font-semibold flex items-center gap-1">
              <Check className="h-3 w-3" />
              Recommended group
            </div>
            <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-2.5">
              <div className="flex items-center gap-2.5">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{recommended.name}</div>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    {recommended.category && <span>{recommended.category}</span>}
                    {recommended.category && <span>·</span>}
                    <span>{recommended.priceCount} price{recommended.priceCount === 1 ? '' : 's'}</span>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onPickExisting(recommended.id)}
                >
                  Add to this group
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Other existing groups */}
        {others.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Or pick a different group
            </div>
            <div className="rounded-lg border divide-y">
              {others.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => onPickExisting(g.id)}
                  className="w-full text-left px-3 py-2 hover:bg-accent transition-colors flex items-center gap-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{g.name}</div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      {g.category && <span>{g.category}</span>}
                      {g.category && <span>·</span>}
                      <span>{g.priceCount} price{g.priceCount === 1 ? '' : 's'}</span>
                    </div>
                  </div>
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Create new group */}
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={onCreateNew}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Create a new group
        </Button>
      </DialogContent>
    </Dialog>
  )
}
