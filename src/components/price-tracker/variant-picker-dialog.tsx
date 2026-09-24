'use client'

import { Package, Plus, ArrowRight, Globe } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { BarcodeLookupResult } from '@/lib/barcode'

interface ExistingProduct {
  id: string
  name: string
  brand?: string | null
  category?: string | null
  priceCount: number
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** The barcode lookup result that was scanned */
  lookup: BarcodeLookupResult | null
  /** Similar existing products found by name */
  matches: ExistingProduct[]
  /** Called when the user picks an existing product to add a variant to */
  onPickExisting: (productId: string) => void
  /** Called when the user chooses to create a new product */
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Is this a new product?
          </DialogTitle>
          <DialogDescription>
            We found {matches.length} product{matches.length === 1 ? '' : 's'} with a similar name.
            Is this barcode a variant of one of these, or a brand new product?
          </DialogDescription>
        </DialogHeader>

        {/* Scanned product info */}
        {lookup && (
          <div className="rounded-lg border bg-muted/40 p-3 flex gap-3">
            {lookup.imageUrl && (
              <div className="h-14 w-14 shrink-0 rounded-md overflow-hidden border bg-muted">
                {/* Using a plain <img> because the URL comes from a third-party API */}
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
                Scanned barcode
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

        {/* Existing product matches */}
        <div className="space-y-1.5 max-h-52 overflow-y-auto scrollbar-thin">
          {matches.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPickExisting(p.id)}
              className="w-full text-left rounded-lg border p-2.5 hover:bg-accent hover:border-primary/40 transition-colors flex items-center gap-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm truncate">{p.name}</div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  {p.brand && <span>{p.brand}</span>}
                  {p.brand && p.category && <span>·</span>}
                  {p.category && <span>{p.category}</span>}
                  <span>·</span>
                  <span>
                    {p.priceCount} price{p.priceCount === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>

        {/* Create new product button */}
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={onCreateNew}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          No, this is a new product
        </Button>
      </DialogContent>
    </Dialog>
  )
}
