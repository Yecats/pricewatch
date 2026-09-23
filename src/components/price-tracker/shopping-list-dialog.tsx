'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ShoppingCart,
  Loader2,
  Trash2,
  Plus,
  Minus,
  Check,
  RotateCcw,
  Store as StoreIcon,
  Tag,
  Clock,
  Flame,
  Package,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import {
  formatCurrency,
  formatNumber,
  formatPricePerUnitSmart,
  formatSaleCountdown,
  saleCountdownSeverity,
  formatSize,
} from '@/lib/units'
import {
  groupShoppingListByBestStore,
  type ShoppingListItemInput,
} from '@/lib/shopping-list'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCountChange: (count: number) => void
}

const SEVERITY_ICON: Record<string, typeof Flame> = {
  urgent: Flame,
  warning: Clock,
  normal: Clock,
  expired: Clock,
}

const SEVERITY_TEXT_CLASS: Record<string, string> = {
  urgent: 'text-red-600 dark:text-red-400',
  warning: 'text-amber-600 dark:text-amber-400',
  normal: 'text-muted-foreground',
  expired: 'text-muted-foreground line-through',
}

export function ShoppingListDialog({ open, onOpenChange, onCountChange }: Props) {
  const { toast } = useToast()
  const [items, setItems] = useState<ShoppingListItemInput[]>([])
  // `loading` is ONLY true during the initial fetch (when we have no items yet
  // to show). Subsequent refreshes after mutations update `items` silently
  // without flipping this flag, which prevents the "list disappears for a
  // split second" flicker.
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false
      if (!silent) setLoading(true)
      try {
        const res = await fetch('/api/shopping-list')
        if (!res.ok) throw new Error('Failed to load shopping list')
        const data: ShoppingListItemInput[] = await res.json()
        setItems(data)
        // Pass the count up to the parent (header badge).
        try {
          onCountChange(data.filter((i) => !i.purchased).length)
        } catch {
          // ignore
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Something went wrong'
        toast({ variant: 'destructive', title: 'Load failed', description: msg })
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [onCountChange, toast]
  )

  // Silent refresh — used after mutations to sync with the server without
  // showing the loading spinner.
  const refresh = useCallback(async () => {
    await load({ silent: true })
  }, [load])

  useEffect(() => {
    if (open) {
      void load()
    }
  }, [open, load])

  const computed = useMemo(() => groupShoppingListByBestStore(items), [items])

  async function updateQuantity(item: ShoppingListItemInput, delta: number) {
    const newQty = Math.max(1, item.quantity + delta)
    // Optimistic update — flip the quantity locally immediately so the UI
    // feels instant. The server response will confirm (or revert) on the
    // next silent refresh.
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, quantity: newQty } : i))
    )
    setUpdatingId(item.id)
    try {
      const res = await fetch(`/api/shopping-list/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: newQty }),
      })
      if (!res.ok) throw new Error('Failed to update quantity')
      await refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong'
      toast({ variant: 'destructive', title: 'Error', description: msg })
      // Revert by silent-refreshing from the server
      await refresh()
    } finally {
      setUpdatingId(null)
    }
  }

  async function togglePurchased(item: ShoppingListItemInput) {
    const newPurchased = !item.purchased
    // Optimistic update — flip the purchased flag locally immediately.
    // The item will visually disappear from the list (since we filter
    // purchased items out in the grouping) without any flicker.
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id ? { ...i, purchased: newPurchased } : i
      )
    )
    // Also update the parent's count badge optimistically.
    // newPurchased=true → one fewer unpurchased item; newPurchased=false → one more.
    try {
      onCountChange(
        items.filter((i) =>
          i.id === item.id ? !newPurchased : !i.purchased
        ).length
      )
    } catch {
      // ignore
    }
    setUpdatingId(item.id)
    try {
      const res = await fetch(`/api/shopping-list/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchased: newPurchased }),
      })
      if (!res.ok) throw new Error('Failed to update item')
      await refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong'
      toast({ variant: 'destructive', title: 'Error', description: msg })
      // Revert
      await refresh()
    } finally {
      setUpdatingId(null)
    }
  }

  async function removeItem(item: ShoppingListItemInput) {
    // Optimistic update — remove the item from local state immediately
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    try {
      onCountChange(
        items.filter((i) => !i.purchased && i.id !== item.id).length
      )
    } catch {
      // ignore
    }
    setUpdatingId(item.id)
    try {
      const res = await fetch(`/api/shopping-list/${item.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to remove item')
      toast({ title: 'Removed from list', description: item.product.name })
      await refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong'
      toast({ variant: 'destructive', title: 'Error', description: msg })
      // Revert
      await refresh()
    } finally {
      setUpdatingId(null)
    }
  }

  async function clearPurchased() {
    // Optimistic — remove all purchased items from local state immediately
    setItems((prev) => prev.filter((i) => !i.purchased))
    try {
      const res = await fetch('/api/shopping-list/clear?mode=purchased', {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to clear purchased items')
      toast({ title: 'Purchased items cleared' })
      await refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong'
      toast({ variant: 'destructive', title: 'Error', description: msg })
      await refresh()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            Shopping list
          </DialogTitle>
          <DialogDescription>
            Grouped by the best store to buy each item at. When a sale expires, items
            automatically fall through to the next-best store.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="text-center py-10">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-10">
            <Package className="mx-auto mb-2 h-10 w-10 text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground">Your shopping list is empty.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Click the cart icon on any product card to add it.
            </p>
          </div>
        ) : (
          <>
            {/* Summary bar */}
            <div className="grid grid-cols-3 gap-2 mb-2">
              <div className="rounded-lg border bg-muted/30 p-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Items
                </div>
                <div className="text-base font-bold">{computed.totalItems}</div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Total cost
                </div>
                <div className="text-base font-bold">
                  {formatCurrency(computed.totalCost)}
                </div>
              </div>
              <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/30 border-amber-300/60 dark:border-amber-700/50 p-2">
                <div className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-300 font-semibold flex items-center gap-1">
                  <Tag className="h-2.5 w-2.5" />
                  You save
                </div>
                <div className="text-base font-bold text-amber-700 dark:text-amber-300">
                  {formatCurrency(computed.totalSavings)}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin -mx-1 px-1 space-y-4">
              <AnimatePresence initial={false}>
              {computed.groups.map((group) => (
                <motion.div
                  key={group.store.id}
                  layout
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="rounded-xl border overflow-hidden"
                >
                  {/* Store header */}
                  <div
                    className="flex items-center gap-2 px-3 py-2 border-b"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${group.store.color} 12%, transparent)`,
                    }}
                  >
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: group.store.color }}
                    />
                    <StoreIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-semibold text-sm">{group.store.name}</span>
                    <Badge variant="secondary" className="text-[10px] h-4.5">
                      {group.items.length} item{group.items.length === 1 ? '' : 's'}
                    </Badge>
                    {group.saleItemCount > 0 && (
                      <Badge
                        variant="outline"
                        className="text-[10px] h-4.5 border-amber-400/60 text-amber-700 dark:text-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/30 ml-auto"
                      >
                        <Flame className="h-2.5 w-2.5 mr-0.5" />
                        {group.saleItemCount} sale
                      </Badge>
                    )}
                    <span className="text-xs font-semibold ml-auto">
                      {formatCurrency(group.subtotal)}
                    </span>
                  </div>

                  {/* Items */}
                  <ul className="divide-y">
                    <AnimatePresence initial={false}>
                    {group.items.map(({ item, best }) => {
                      const isSale = best.price.isSale
                      const countdown = isSale
                        ? formatSaleCountdown(best.price.saleExpiresAt)
                        : null
                      const severity = isSale
                        ? saleCountdownSeverity(best.price.saleExpiresAt)
                        : 'normal'
                      const SeverityIcon = SEVERITY_ICON[severity] ?? Clock
                      return (
                        <motion.li
                          key={item.id}
                          layout
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2, ease: 'easeOut' }}
                          className={`flex items-start gap-2 p-2.5 overflow-hidden ${
                            isSale ? 'bg-amber-50/40 dark:bg-amber-950/15' : ''
                          }`}
                        >
                          {/* Checkbox */}
                          <button
                            type="button"
                            onClick={() => togglePurchased(item)}
                            disabled={updatingId === item.id}
                            className="mt-0.5 shrink-0"
                            aria-label={
                              item.purchased ? 'Mark as not purchased' : 'Mark as purchased'
                            }
                          >
                            <div
                              className={`h-5 w-5 rounded-full border-2 grid place-items-center transition-colors ${
                                item.purchased
                                  ? 'bg-primary border-primary text-primary-foreground'
                                  : 'border-muted-foreground/40 hover:border-primary'
                              }`}
                            >
                              {item.purchased && <Check className="h-3 w-3" />}
                            </div>
                          </button>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`font-medium text-sm ${
                                  item.purchased ? 'line-through text-muted-foreground' : ''
                                }`}
                              >
                                {item.product.name}
                              </span>
                              {item.product.brand && (
                                <span className="text-[10px] text-muted-foreground">
                                  · {item.product.brand}
                                </span>
                              )}
                              {isSale && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] h-4 px-1 py-0 border-amber-500/60 text-amber-700 dark:text-amber-300 dark:border-amber-700/60 bg-amber-100 dark:bg-amber-900/40"
                                >
                                  <Tag className="h-2 w-2 mr-0.5" />
                                  Sale
                                </Badge>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                              <span>
                                {formatNumber(best.price.quantity)} ×{' '}
                                {formatSize(best.price.sizeValue, best.price.sizeUnit)} pack
                              </span>
                              <span className="text-muted-foreground/60">·</span>
                              <span>
                                {formatPricePerUnitSmart(
                                  best.pricePerBaseUnit,
                                  best.price.category
                                ).text}
                              </span>
                              {isSale && countdown && (
                                <span
                                  className={`inline-flex items-center gap-0.5 ${SEVERITY_TEXT_CLASS[severity]}`}
                                >
                                  <SeverityIcon className="h-2.5 w-2.5" />
                                  {countdown}
                                </span>
                              )}
                            </div>
                            {/* Savings callout */}
                            {best.savings && (
                              <div className="mt-1 text-[11px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                                <Tag className="h-2.5 w-2.5" />
                                Save {formatCurrency(best.savings.total)} ({best.savings.percent.toFixed(0)}%) vs{' '}
                                {best.savings.vsStoreName}
                              </div>
                            )}
                            {/* Quantity selector */}
                            <div className="mt-1.5 flex items-center gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => updateQuantity(item, -1)}
                                disabled={updatingId === item.id || item.quantity <= 1}
                                aria-label="Decrease quantity"
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="text-xs font-mono w-6 text-center">
                                {item.quantity}
                              </span>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => updateQuantity(item, 1)}
                                disabled={updatingId === item.id}
                                aria-label="Increase quantity"
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 ml-1 text-destructive hover:text-destructive"
                                onClick={() => removeItem(item)}
                                disabled={updatingId === item.id}
                                aria-label="Remove from list"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="font-semibold text-sm">
                              {formatCurrency(best.totalPrice)}
                            </div>
                            {item.quantity > 1 && (
                              <div className="text-[10px] text-muted-foreground">
                                {formatCurrency(best.price.price)} each
                              </div>
                            )}
                          </div>
                        </motion.li>
                      )
                    })}
                    </AnimatePresence>
                  </ul>
                </motion.div>
              ))}
              </AnimatePresence>

              {/* Items with no prices */}
              {computed.ungroupedItems.length > 0 && (
                <div className="rounded-xl border border-dashed p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                    No prices tracked
                  </div>
                  <ul className="space-y-1">
                    {computed.ungroupedItems.map(({ item }) => (
                      <li
                        key={item.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span className="text-muted-foreground">{item.product.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 ml-auto text-destructive hover:text-destructive"
                          onClick={() => removeItem(item)}
                          aria-label="Remove from list"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <Separator />
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearPurchased}
                disabled={loading}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Clear purchased
              </Button>
              <div className="text-xs text-muted-foreground">
                Total: <span className="font-bold text-foreground">{formatCurrency(computed.totalCost)}</span>
                {computed.totalSavings > 0 && (
                  <>
                    {' '}·{' '}
                    <span className="text-amber-700 dark:text-amber-300 font-medium">
                      Save {formatCurrency(computed.totalSavings)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
