'use client'

import { useEffect, useState } from 'react'
import {
  Loader2, Plus, Pencil, Trash2, Trophy, Store as StoreIcon, Calendar,
  StickyNote, Package, Tag, Clock, Flame, ShoppingCart, Check, Globe,
  Copy, History, Layers,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import {
  formatCurrency, formatNumber, formatPricePerUnitSmart, formatRelativeDate,
  formatSaleCountdown, saleCountdownSeverity, isSaleExpired, formatSize,
  BASE_UNIT_LABEL, type UnitCategory,
} from '@/lib/units'
import { localDb } from '@/lib/local-db'
import { localAddPrice, localDeletePrice, localAddProductToGroup } from '@/hooks/use-local-data'
import type { ComputedPrice, ProductGroup, GroupProduct, Store } from './types'
import { PriceFormDialog } from './price-form-dialog'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  group: ProductGroup | null
  stores: Store[]
  onPricesChanged: () => void
  onAddToList?: (groupId: string) => Promise<void> | void
  isOnList?: boolean
}

export function GroupDetailDialog({ open, onOpenChange, group, stores, onPricesChanged, onAddToList, isOnList }: Props) {
  const { toast } = useToast()
  const [priceFormOpen, setPriceFormOpen] = useState(false)
  const [editingPrice, setEditingPrice] = useState<ComputedPrice | null>(null)
  const [forkingPrice, setForkingPrice] = useState<ComputedPrice | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [addingToList, setAddingToList] = useState(false)
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current')
  const [historyPrices, setHistoryPrices] = useState<ComputedPrice[]>([])
  const [reactivatingId, setReactivatingId] = useState<string | null>(null)
  const [currentGroup, setCurrentGroup] = useState<ProductGroup | null>(group)
  const [addProductOpen, setAddProductOpen] = useState(false)
  const [addProductQuery, setAddProductQuery] = useState('')
  const [addableProducts, setAddableProducts] = useState<Array<{ id: string; name: string; brand?: string | null; category?: string | null; barcode?: string | null; groupCount: number }>>([])
  const [pendingAddIds, setPendingAddIds] = useState<Set<string>>(new Set())
  const [addingProducts, setAddingProducts] = useState(false)

  useEffect(() => { setCurrentGroup(group) }, [group])

  useEffect(() => {
    if (open && activeTab === 'history' && group) void loadHistory()
  }, [open, activeTab, group])

  useEffect(() => {
    if (!open) {
      setPriceFormOpen(false); setEditingPrice(null); setForkingPrice(null)
      setDeletingId(null); setActiveTab('current'); setHistoryPrices([])
      setAddProductOpen(false); setAddProductQuery(''); setAddableProducts([]); setPendingAddIds(new Set())
    }
  }, [open])

  // Load all products not in this group, for the "Add product" picker
  useEffect(() => {
    if (!open || !group) return
    let cancelled = false
    void (async () => {
      try {
        const [allProducts, allLinks] = await Promise.all([
          localDb.products.toArray(),
          localDb.groupProducts.where('groupId').equals(group.id).toArray(),
        ])
        const inThisGroup = new Set(allLinks.map(l => l.productId))
        // Count how many other groups each candidate product is already in, for context
        const allOtherLinks = await localDb.groupProducts.toArray()
        const groupCountByProduct = new Map<string, number>()
        for (const l of allOtherLinks) {
          if (l.groupId === group.id) continue
          groupCountByProduct.set(l.productId, (groupCountByProduct.get(l.productId) ?? 0) + 1)
        }
        const candidates = allProducts
          .filter(p => !p.deletedAt && !inThisGroup.has(p.id))
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(p => ({
            id: p.id, name: p.name, brand: p.brand ?? null,
            category: p.category ?? null, barcode: p.barcode ?? null,
            groupCount: groupCountByProduct.get(p.id) ?? 0,
          }))
        if (!cancelled) setAddableProducts(candidates)
      } catch (err) { console.error('Failed to load addable products:', err) }
    })()
    return () => { cancelled = true }
  }, [open, group])

  async function loadHistory() {
    if (!group) return
    try {
      const [links, localStores] = await Promise.all([
        localDb.groupProducts.where('groupId').equals(group.id).toArray(),
        localDb.stores.toArray(),
      ])
      const productIds = links.map(l => l.productId)
      const allPrices = await localDb.priceEntries.where('productId').anyOf(productIds).toArray()
      const storeMap = new Map(localStores.filter(s => !s.deletedAt).map(s => [s.id, s]))
      const { computePrice } = await import('@/lib/units')
      const all = allPrices.filter(p => !p.deletedAt).map(p => {
        const store = storeMap.get(p.storeId)
        return {
          id: p.id, productId: p.productId, storeId: p.storeId,
          storeName: store?.name ?? 'Unknown', storeColor: store?.color ?? '#888',
          storeLocation: store?.location ?? null,
          price: p.price, quantity: p.quantity, sizeValue: p.sizeValue, sizeUnit: p.sizeUnit,
          notes: p.notes ?? null, isSale: p.isSale, saleExpiresAt: p.saleExpiresAt ?? null,
          isOnline: p.isOnline ?? false, dateChecked: p.dateChecked, createdAt: p.createdAt,
          ...computePrice(p),
        } as ComputedPrice
      }).sort((a, b) => new Date(b.dateChecked).getTime() - new Date(a.dateChecked).getTime())
      setHistoryPrices(all)
    } catch (err) { console.error(err) }
  }

  async function deletePrice(p: ComputedPrice) {
    setDeletingId(p.id)
    try {
      await localDeletePrice(p.id)
      toast({ title: 'Price removed' })
      onPricesChanged()
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e instanceof Error ? e.message : 'Failed' })
    } finally { setDeletingId(null) }
  }

  async function reactivateSale(p: ComputedPrice) {
    setReactivatingId(p.id)
    try {
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(23, 59, 0, 0)
      await localAddPrice(p.productId, {
        storeId: p.storeId, price: p.price, quantity: p.quantity, sizeValue: p.sizeValue,
        sizeUnit: p.sizeUnit, notes: p.notes, isSale: true, saleExpiresAt: tomorrow.toISOString(),
        isOnline: p.isOnline, dateChecked: new Date().toISOString(),
      })
      toast({ title: 'Sale reactivated', description: 'New sale entry created with expiry tomorrow' })
      await loadHistory(); onPricesChanged()
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e instanceof Error ? e.message : 'Failed' })
    } finally { setReactivatingId(null) }
  }

  async function addSelectedProductsToGroup() {
    if (!currentGroup || pendingAddIds.size === 0) return
    setAddingProducts(true)
    try {
      for (const pid of Array.from(pendingAddIds)) {
        await localAddProductToGroup(currentGroup.id, pid)
      }
      toast({ title: 'Products added', description: `${pendingAddIds.size} product${pendingAddIds.size === 1 ? '' : 's'} added to ${currentGroup.name}` })
      setPendingAddIds(new Set())
      setAddProductOpen(false)
      onPricesChanged()
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e instanceof Error ? e.message : 'Failed' })
    } finally { setAddingProducts(false) }
  }

  if (!currentGroup) return null

  const products = currentGroup.products ?? []
  const allPrices = products.flatMap(p => p.prices)
  const overallBest = allPrices.length ? [...allPrices].sort((a, b) => a.pricePerBaseUnit - b.pricePerBaseUnit)[0] : null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="min-w-0">
              <DialogTitle className="text-xl leading-tight">{currentGroup.name}</DialogTitle>
              <DialogDescription className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {currentGroup.category && <span>{currentGroup.category}</span>}
                <span>·</span>
                <span>{products.length} product{products.length === 1 ? '' : 's'}</span>
                <span>·</span>
                <span>{allPrices.length} price{allPrices.length === 1 ? '' : 's'}</span>
              </DialogDescription>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              {onAddToList && (
                <Button size="sm" variant="outline" disabled={addingToList}
                  onClick={async () => { setAddingToList(true); try { await onAddToList(currentGroup.id) } finally { setAddingToList(false) } }}>
                  {addingToList ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : (
                    <div className="relative inline-flex mr-1">
                      <ShoppingCart className={`h-3.5 w-3.5 ${isOnList ? 'text-primary' : 'text-muted-foreground'}`} />
                      {isOnList && <span className="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full bg-primary flex items-center justify-center ring-1 ring-background"><Check className="h-2 w-2 text-primary-foreground" strokeWidth={4} /></span>}
                    </div>
                  )}
                  {isOnList ? 'On list' : 'Add to list'}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setAddProductOpen(true)}>
                <Layers className="mr-1 h-3.5 w-3.5" /> Add product
              </Button>
              <Button size="sm" onClick={() => { setEditingPrice(null); setForkingPrice(null); setPriceFormOpen(true) }}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add price
              </Button>
            </div>
          </DialogHeader>

          {currentGroup.notes && (
            <div className="flex items-start gap-2 rounded-md bg-muted/60 p-2.5 text-xs text-muted-foreground">
              <StickyNote className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{currentGroup.notes}</span>
            </div>
          )}

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'current' | 'history')} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-2 mb-2">
              <TabsTrigger value="current">Current Prices</TabsTrigger>
              <TabsTrigger value="history"><History className="h-3 w-3 mr-1" /> Price History</TabsTrigger>
            </TabsList>

            <TabsContent value="current" className="flex-1 overflow-y-auto scrollbar-thin -mx-1 px-1 space-y-4 mt-0">
              {allPrices.length === 0 ? (
                <div className="text-center py-10 text-sm text-muted-foreground">
                  <Package className="mx-auto mb-2 h-10 w-10 opacity-40" />
                  <p>No prices tracked yet.</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => { setEditingPrice(null); setForkingPrice(null); setPriceFormOpen(true) }}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add the first price
                  </Button>
                </div>
              ) : (
                products.map((product) => (
                  <div key={product.id} className="rounded-lg border overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30">
                      <span className="font-medium text-sm">{product.name}</span>
                      {product.brand && <span className="text-[10px] text-muted-foreground">· {product.brand}</span>}
                    </div>
                    <div className="divide-y">
                      {product.prices
                        .sort((a, b) => a.pricePerBaseUnit - b.pricePerBaseUnit)
                        .map((p, idx) => {
                          const isBest = overallBest?.id === p.id
                          const isSale = p.isSale
                          const expired = isSale && isSaleExpired(p.saleExpiresAt)
                          const countdown = isSale && !expired ? formatSaleCountdown(p.saleExpiresAt) : null
                          const sev = isSale && !expired ? saleCountdownSeverity(p.saleExpiresAt) : 'normal'
                          const SevIcon = sev === 'urgent' ? Flame : Clock
                          return (
                            <div key={p.id} className={`group relative flex items-center gap-3 p-2.5 transition-colors ${isBest ? (isSale ? 'bg-amber-50/40 dark:bg-amber-950/15' : 'bg-primary/5') : ''}`}>
                              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: p.storeColor }} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`text-sm ${isBest ? 'font-semibold' : 'font-medium'}`}>{p.storeName}</span>
                                  {isBest && <Badge className={isSale ? 'bg-amber-500 text-white text-[10px] py-0 h-4.5' : 'bg-primary/90 text-primary-foreground text-[10px] py-0 h-4.5'}>{isSale ? 'Sale — best' : 'Best'}</Badge>}
                                  {p.isOnline && <Badge variant="outline" className="text-[9px] h-4 px-1 py-0 border-sky-500/60 text-sky-700 dark:text-sky-300 dark:border-sky-700/60 bg-sky-100 dark:bg-sky-900/40"><Globe className="h-2 w-2 mr-0.5" />Online</Badge>}
                                  {isSale && !isBest && <Badge variant="outline" className="text-[9px] h-4 px-1 py-0 border-amber-500/60 text-amber-700 dark:text-amber-300 dark:border-amber-700/60 bg-amber-100 dark:bg-amber-900/40"><Tag className="h-2 w-2 mr-0.5" />Sale</Badge>}
                                </div>
                                <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                                  <span>{formatNumber(p.quantity)} × {formatSize(p.sizeValue, p.sizeUnit)}</span>
                                  <span className="text-muted-foreground/60">·</span>
                                  <span>{formatPricePerUnitSmart(p.pricePerBaseUnit, p.category).text}</span>
                                  <span className="text-muted-foreground/60">·</span>
                                  <span>{formatRelativeDate(p.dateChecked)}</span>
                                  {countdown && <span className={`inline-flex items-center gap-0.5 ${sev === 'urgent' ? 'text-red-600 dark:text-red-400' : sev === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}><SevIcon className="h-2.5 w-2.5" />{countdown}</span>}
                                </div>
                                {p.notes && <p className="text-[10px] text-muted-foreground italic mt-0.5 truncate">{p.notes}</p>}
                              </div>
                              <div className="text-right shrink-0">
                                <div className="font-semibold text-sm">{formatCurrency(p.price)}</div>
                              </div>
                              <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditingPrice(p); setForkingPrice(null); setPriceFormOpen(true) }} aria-label="Edit price"><Pencil className="h-3 w-3" /></Button>
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditingPrice(null); setForkingPrice(p); setPriceFormOpen(true) }} aria-label="Copy as new"><Copy className="h-3 w-3" /></Button>
                                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => deletePrice(p)} disabled={deletingId === p.id} aria-label="Delete price">
                                  {deletingId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="history" className="flex-1 overflow-y-auto scrollbar-thin -mx-1 px-1 space-y-4 mt-0">
              {historyPrices.length === 0 ? (
                <div className="text-center py-10 text-sm text-muted-foreground">
                  <History className="mx-auto mb-2 h-10 w-10 opacity-40" />
                  <p>No price history yet.</p>
                </div>
              ) : (
                (() => {
                  const byProduct = new Map<string, ComputedPrice[]>()
                  for (const p of historyPrices) {
                    const product = products.find(prod => prod.productId === p.productId)
                    const key = product?.name ?? 'Unknown'
                    if (!byProduct.has(key)) byProduct.set(key, [])
                    byProduct.get(key)!.push(p)
                  }
                  return Array.from(byProduct.entries()).map(([productName, entries]) => (
                    <div key={productName} className="rounded-lg border overflow-hidden">
                      <div className="px-3 py-1.5 border-b bg-muted/30 font-medium text-sm">{productName}</div>
                      <div className="divide-y">
                        {entries.map(p => {
                          const expired = p.isSale && isSaleExpired(p.saleExpiresAt)
                          return (
                            <div key={p.id} className="flex items-center gap-2 p-2.5 text-xs">
                              <span className="font-mono font-semibold">{formatCurrency(p.price)}</span>
                              <span className="text-muted-foreground">{formatPricePerUnitSmart(p.pricePerBaseUnit, p.category).text}</span>
                              <span className="text-muted-foreground/60">{p.storeName}</span>
                              {p.isSale && <Badge variant="outline" className={`text-[8px] h-3.5 px-1 py-0 ${expired ? 'border-muted-foreground/30 text-muted-foreground bg-muted/30' : 'border-amber-500/60 text-amber-700 dark:text-amber-300 dark:border-amber-700/60 bg-amber-100 dark:bg-amber-900/40'}`}><Tag className="h-2 w-2 mr-0.5" />{expired ? 'Expired' : 'Sale'}</Badge>}
                              {p.isOnline && <Badge variant="outline" className="text-[8px] h-3.5 px-1 py-0 border-sky-500/60 text-sky-700 dark:text-sky-300 dark:border-sky-700/60 bg-sky-100 dark:bg-sky-900/40"><Globe className="h-2 w-2 mr-0.5" />Online</Badge>}
                              <span className="text-muted-foreground/60 text-[10px] ml-auto">{formatRelativeDate(p.dateChecked)}</span>
                              {expired && <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px]" onClick={() => reactivateSale(p)} disabled={reactivatingId === p.id}>{reactivatingId === p.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : 'Reactivate'}</Button>}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))
                })()
              )}
            </TabsContent>
          </Tabs>

          {allPrices.length > 0 && (
            <>
              <Separator />
              <DialogFooter className="sm:justify-between items-center">
                <p className="text-xs text-muted-foreground"><StoreIcon className="inline h-3 w-3 mr-1" />Prices compared across {currentGroup.storeCount} store{currentGroup.storeCount === 1 ? '' : 's'}.</p>
                <Button variant="outline" size="sm" onClick={() => { setEditingPrice(null); setForkingPrice(null); setPriceFormOpen(true) }}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add price
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <PriceFormDialog
        open={priceFormOpen}
        onOpenChange={setPriceFormOpen}
        context={{ mode: 'group', group: currentGroup }}
        stores={stores}
        initial={editingPrice}
        forkFrom={forkingPrice}
        onSaved={() => { onPricesChanged(); void loadHistory() }}
      />

      {/* Add existing products to this group */}
      <Dialog open={addProductOpen} onOpenChange={setAddProductOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Layers className="h-5 w-5 text-primary" />Add products to {currentGroup.name}</DialogTitle>
            <DialogDescription>Pick existing products from your catalog to compare inside this group.</DialogDescription>
          </DialogHeader>
          <Input value={addProductQuery} onChange={e => setAddProductQuery(e.target.value)} placeholder="Search products..." className="mb-2" />
          <div className="max-h-72 overflow-y-auto scrollbar-thin rounded-lg border divide-y">
            {addableProducts.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">No more products to add. Create new ones from the Products tab.</div>
            ) : (
              (() => {
                const q = addProductQuery.trim().toLowerCase()
                const filtered = q
                  ? addableProducts.filter(p => [p.name, p.brand, p.category, p.barcode].filter(Boolean).join(' ').toLowerCase().includes(q))
                  : addableProducts
                if (filtered.length === 0) return <div className="p-4 text-center text-xs text-muted-foreground">No matches for "{addProductQuery}".</div>
                return filtered.map(p => (
                  <button key={p.id} type="button"
                    onClick={() => setPendingAddIds(prev => {
                      const next = new Set(prev)
                      if (next.has(p.id)) next.delete(p.id)
                      else next.add(p.id)
                      return next
                    })}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${pendingAddIds.has(p.id) ? 'bg-primary/5' : 'hover:bg-accent'}`}>
                    <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${pendingAddIds.has(p.id) ? 'bg-primary border-primary' : 'border-input'}`}>
                      {pendingAddIds.has(p.id) && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {p.brand ? `${p.brand} · ` : ''}{p.category ?? 'No category'}
                        {p.groupCount > 0 ? ` · in ${p.groupCount} other group${p.groupCount === 1 ? '' : 's'}` : ''}
                      </div>
                    </div>
                  </button>
                ))
              })()
            )}
          </div>
          <DialogFooter>
            <div className="text-xs text-muted-foreground mr-auto">{pendingAddIds.size} selected</div>
            <Button type="button" variant="ghost" onClick={() => { setAddProductOpen(false); setPendingAddIds(new Set()) }} disabled={addingProducts}>Cancel</Button>
            <Button type="button" disabled={pendingAddIds.size === 0 || addingProducts} onClick={addSelectedProductsToGroup}>
              {addingProducts && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add {pendingAddIds.size > 0 ? `(${pendingAddIds.size})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
