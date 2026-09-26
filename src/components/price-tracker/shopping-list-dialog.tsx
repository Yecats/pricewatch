'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ShoppingCart, Loader2, Trash2, Plus, Minus, Check, RotateCcw,
  Store as StoreIcon, Tag, Clock, Flame, Package, X, Globe,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import {
  formatCurrency, formatNumber, formatPricePerUnitSmart, formatSaleCountdown,
  saleCountdownSeverity, formatSize, computePrice, isSaleExpired,
} from '@/lib/units'
import { localDb } from '@/lib/local-db'
import {
  localDeleteShoppingListItem, localToggleShoppingListPurchased, localUpdateShoppingListItem,
} from '@/hooks/use-local-data'

interface ShoppingListPrice {
  id: string; storeId: string; storeName: string; storeColor: string
  price: number; quantity: number; sizeValue: number; sizeUnit: string
  isSale: boolean; saleExpiresAt?: string | null; isOnline: boolean
  pricePerBaseUnit: number; category: any; totalBaseUnits: number; baseUnit: string
}

interface ShoppingListItemInput {
  id: string; groupId: string; quantity: number; notes?: string | null
  addedAt: string; purchased: boolean
  group: { id: string; name: string; category?: string | null }
  prices: ShoppingListPrice[]
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCountChange: (count: number) => void
}

const SEVERITY_ICON: Record<string, typeof Flame> = { urgent: Flame, warning: Clock, normal: Clock, expired: Clock }
const SEVERITY_CLASS: Record<string, string> = { urgent: 'text-red-600 dark:text-red-400', warning: 'text-amber-600 dark:text-amber-400', normal: 'text-muted-foreground', expired: 'text-muted-foreground line-through' }

export function ShoppingListDialog({ open, onOpenChange, onCountChange }: Props) {
  const { toast } = useToast()
  const [items, setItems] = useState<ShoppingListItemInput[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false
    if (!silent) setLoading(true)
    try {
      const [localItems, localGroups, localGroupProducts, localProducts, localPrices, localStores] = await Promise.all([
        localDb.shoppingListItems.toArray(), localDb.productGroups.toArray(),
        localDb.groupProducts.toArray(), localDb.products.toArray(),
        localDb.priceEntries.toArray(), localDb.stores.toArray(),
      ])
      const storeMap = new Map(localStores.filter(s => !s.deletedAt).map(s => [s.id, s]))
      const groupMap = new Map(localGroups.filter(g => !g.deletedAt).map(g => [g.id, g]))
      const productIdsByGroup = new Map<string, string[]>()
      for (const gp of localGroupProducts) {
        if (!productIdsByGroup.has(gp.groupId)) productIdsByGroup.set(gp.groupId, [])
        productIdsByGroup.get(gp.groupId)!.push(gp.productId)
      }

      const data: ShoppingListItemInput[] = localItems
        .filter(i => !i.deletedAt && !i.purchased)
        .map(item => {
          const group = groupMap.get(item.groupId)
          const productIds = productIdsByGroup.get(item.groupId) ?? []
          const groupPrices = localPrices
            .filter(p => productIds.includes(p.productId) && !p.deletedAt)
            .filter(p => !p.isSale || !isSaleExpired(p.saleExpiresAt))
            .map(p => {
              const store = storeMap.get(p.storeId)
              const computed = computePrice(p)
              return {
                id: p.id, storeId: p.storeId, storeName: store?.name ?? 'Unknown',
                storeColor: store?.color ?? '#888', price: p.price, quantity: p.quantity,
                sizeValue: p.sizeValue, sizeUnit: p.sizeUnit, isSale: p.isSale,
                saleExpiresAt: p.saleExpiresAt ?? null, isOnline: p.isOnline ?? false,
                pricePerBaseUnit: computed.pricePerBaseUnit, category: computed.category,
                totalBaseUnits: computed.totalBaseUnits, baseUnit: computed.baseUnit,
              }
            })
          return {
            id: item.id, groupId: item.groupId, quantity: item.quantity,
            notes: item.notes, addedAt: item.addedAt, purchased: item.purchased,
            group: { id: group?.id ?? item.groupId, name: group?.name ?? 'Unknown', category: group?.category ?? null },
            prices: groupPrices,
          }
        })
        .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())

      setItems(data)
      try { onCountChange(data.length) } catch {}
    } catch (e) {
      console.error(e)
    } finally { if (!silent) setLoading(false) }
  }, [onCountChange])

  const refresh = useCallback(async () => { await load({ silent: true }) }, [load])

  useEffect(() => { if (open) void load() }, [open, load])

  const computed = useMemo(() => {
    const groupsMap = new Map<string, { store: { id: string; name: string; color: string }; items: typeof items; subtotal: number; totalSavings: number; saleItemCount: number }>()
    const ungroupedItems: typeof items = []

    for (const item of items) {
      const visible = item.prices.sort((a, b) => a.pricePerBaseUnit - b.pricePerBaseUnit)
      const best = visible[0]
      if (!best) { ungroupedItems.push(item); continue }
      if (!groupsMap.has(best.storeId)) {
        groupsMap.set(best.storeId, { store: { id: best.storeId, name: best.storeName, color: best.storeColor }, items: [], subtotal: 0, totalSavings: 0, saleItemCount: 0 })
      }
      const g = groupsMap.get(best.storeId)!
      g.items.push(item)
      g.subtotal += best.price * Math.max(item.quantity, 1)
      if (best.isSale && visible[1]) {
        const savings = (visible[1].pricePerBaseUnit - best.pricePerBaseUnit) * best.totalBaseUnits * Math.max(item.quantity, 1)
        if (savings > 0) { g.totalSavings += savings; g.saleItemCount++ }
      }
    }

    const groups = Array.from(groupsMap.values()).sort((a, b) => b.subtotal - a.subtotal)
    for (const g of groups) g.items.sort((a, b) => {
      const ab = a.prices[0]; const bb = b.prices[0]
      if (ab?.isSale && !bb?.isSale) return -1
      if (!ab?.isSale && bb?.isSale) return 1
      return a.group.name.localeCompare(b.group.name)
    })
    const totalCost = groups.reduce((s, g) => s + g.subtotal, 0)
    const totalSavings = groups.reduce((s, g) => s + g.totalSavings, 0)
    const totalSaleItems = groups.reduce((s, g) => s + g.saleItemCount, 0)
    const totalItems = groups.reduce((s, g) => s + g.items.length, 0) + ungroupedItems.length
    return { groups, ungroupedItems, totalItems, totalCost, totalSavings, totalSaleItems }
  }, [items])

  async function updateQuantity(item: ShoppingListItemInput, delta: number) {
    const newQty = Math.max(1, item.quantity + delta)
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: newQty } : i))
    setUpdatingId(item.id)
    try { await localUpdateShoppingListItem(item.id, { quantity: newQty }); await refresh() }
    catch (e) { toast({ variant: 'destructive', title: 'Error', description: e instanceof Error ? e.message : 'Failed' }) }
    finally { setUpdatingId(null) }
  }

  async function togglePurchased(item: ShoppingListItemInput) {
    setItems(prev => prev.filter(i => i.id !== item.id))
    try { await localToggleShoppingListPurchased(item.id, true); await refresh() }
    catch (e) { toast({ variant: 'destructive', title: 'Error', description: e instanceof Error ? e.message : 'Failed' }) }
  }

  async function removeItem(item: ShoppingListItemInput) {
    setItems(prev => prev.filter(i => i.id !== item.id))
    setUpdatingId(item.id)
    try { await localDeleteShoppingListItem(item.id); toast({ title: 'Removed', description: item.group.name }); await refresh() }
    catch (e) { toast({ variant: 'destructive', title: 'Error', description: e instanceof Error ? e.message : 'Failed' }) }
    finally { setUpdatingId(null) }
  }

  async function clearPurchased() {
    setItems(prev => prev.filter(i => !i.purchased))
    const purchased = items.filter(i => i.purchased)
    await Promise.all(purchased.map(item => localDeleteShoppingListItem(item.id)))
    toast({ title: 'Purchased items cleared' }); await refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-primary" />Shopping list</DialogTitle>
          <DialogDescription>Grouped by the best store to buy each item at.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="text-center py-10"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-10"><Package className="mx-auto mb-2 h-10 w-10 text-muted-foreground opacity-40" /><p className="text-sm text-muted-foreground">Your shopping list is empty.</p></div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <div className="rounded-lg border bg-muted/30 p-2"><div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Items</div><div className="text-base font-bold">{computed.totalItems}</div></div>
              <div className="rounded-lg border bg-muted/30 p-2"><div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total cost</div><div className="text-base font-bold">{formatCurrency(computed.totalCost)}</div></div>
              <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/30 border-amber-300/60 dark:border-amber-700/50 p-2"><div className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-300 font-semibold flex items-center gap-1"><Tag className="h-2.5 w-2.5" />You save</div><div className="text-base font-bold text-amber-700 dark:text-amber-300">{formatCurrency(computed.totalSavings)}</div></div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin -mx-1 px-1 space-y-4">
              <AnimatePresence initial={false}>
                {computed.groups.map(group => (
                  <motion.div key={group.store.id} layout initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.2 }} className="rounded-xl border overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ backgroundColor: `color-mix(in srgb, ${group.store.color} 12%, transparent)` }}>
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: group.store.color }} />
                      <StoreIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-semibold text-sm">{group.store.name}</span>
                      <Badge variant="secondary" className="text-[10px] h-4.5">{group.items.length} item{group.items.length === 1 ? '' : 's'}</Badge>
                      {group.saleItemCount > 0 && <Badge variant="outline" className="text-[10px] h-4.5 border-amber-400/60 text-amber-700 dark:text-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/30 ml-auto"><Flame className="h-2.5 w-2.5 mr-0.5" />{group.saleItemCount} sale</Badge>}
                      <span className="text-xs font-semibold ml-auto">{formatCurrency(group.subtotal)}</span>
                    </div>
                    <ul className="divide-y">
                      <AnimatePresence initial={false}>
                        {group.items.map(item => {
                          const best = item.prices[0]
                          const isSale = best?.isSale
                          const countdown = isSale ? formatSaleCountdown(best.saleExpiresAt) : null
                          const sev = isSale ? saleCountdownSeverity(best.saleExpiresAt) : 'normal'
                          const SevIcon = SEVERITY_ICON[sev] ?? Clock
                          return (
                            <motion.li key={item.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className={`flex items-start gap-2 p-2.5 overflow-hidden ${isSale ? 'bg-amber-50/40 dark:bg-amber-950/15' : ''}`}>
                              <button type="button" onClick={() => togglePurchased(item)} disabled={updatingId === item.id} className="mt-0.5 shrink-0">
                                <div className="h-5 w-5 rounded-full border-2 grid place-items-center transition-colors border-muted-foreground/40 hover:border-primary" />
                              </button>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-medium text-sm">{item.group.name}</span>
                                  {isSale && <Badge variant="outline" className="text-[9px] h-4 px-1 py-0 border-amber-500/60 text-amber-700 dark:text-amber-300 dark:border-amber-700/60 bg-amber-100 dark:bg-amber-900/40"><Tag className="h-2 w-2 mr-0.5" />Sale</Badge>}
                                  {best?.isOnline && <Badge variant="outline" className="text-[9px] h-4 px-1 py-0 border-sky-500/60 text-sky-700 dark:text-sky-300 dark:border-sky-700/60 bg-sky-100 dark:bg-sky-900/40"><Globe className="h-2 w-2 mr-0.5" />Online</Badge>}
                                </div>
                                <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                                  <span>{formatNumber(best.quantity)} × {formatSize(best.sizeValue, best.sizeUnit)}</span>
                                  <span className="text-muted-foreground/60">·</span>
                                  <span>{formatPricePerUnitSmart(best.pricePerBaseUnit, best.category).text}</span>
                                  {countdown && <span className={`inline-flex items-center gap-0.5 ${SEVERITY_CLASS[sev]}`}><SevIcon className="h-2.5 w-2.5" />{countdown}</span>}
                                </div>
                                <div className="mt-1.5 flex items-center gap-1">
                                  <Button type="button" variant="outline" size="icon" className="h-5 w-5" onClick={() => updateQuantity(item, -1)} disabled={updatingId === item.id || item.quantity <= 1}><Minus className="h-3 w-3" /></Button>
                                  <span className="text-xs font-mono w-6 text-center">{item.quantity}</span>
                                  <Button type="button" variant="outline" size="icon" className="h-5 w-5" onClick={() => updateQuantity(item, 1)} disabled={updatingId === item.id}><Plus className="h-3 w-3" /></Button>
                                  <Button type="button" variant="ghost" size="icon" className="h-5 w-5 ml-1 text-destructive hover:text-destructive" onClick={() => removeItem(item)} disabled={updatingId === item.id}><Trash2 className="h-3 w-3" /></Button>
                                </div>
                              </div>
                              <div className="text-right shrink-0"><div className="font-semibold text-sm">{formatCurrency(best.price * item.quantity)}</div></div>
                            </motion.li>
                          )
                        })}
                      </AnimatePresence>
                    </ul>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <Separator />
            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={clearPurchased}><RotateCcw className="h-3.5 w-3.5 mr-1.5" />Clear purchased</Button>
              <div className="text-xs text-muted-foreground">Total: <span className="font-bold text-foreground">{formatCurrency(computed.totalCost)}</span>{computed.totalSavings > 0 && <> · <span className="text-amber-700 dark:text-amber-300 font-medium">Save {formatCurrency(computed.totalSavings)}</span></>}</div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
