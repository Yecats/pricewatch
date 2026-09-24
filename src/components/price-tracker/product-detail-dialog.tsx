'use client'

import { useEffect, useState } from 'react'
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Trophy,
  Store as StoreIcon,
  Calendar,
  StickyNote,
  Package,
  Scale,
  Tag,
  Clock,
  Flame,
  ShoppingCart,
  Check,
  Copy,
  Globe,
  History,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import {
  formatCurrency,
  formatNumber,
  formatPricePerUnitSmart,
  formatRelativeDate,
  formatSaleCountdown,
  saleCountdownSeverity,
  isSaleExpired,
  formatSize,
  BASE_UNIT_LABEL,
  type UnitCategory,
} from '@/lib/units'
import { localDb } from '@/lib/local-db'
import { localAddPrice } from '@/hooks/use-local-data'
import type { ComputedPrice, Product, Store } from './types'
import { PriceFormDialog } from './price-form-dialog'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  product: Product | null
  stores: Store[]
  onPricesChanged: () => void
  onAddToList?: (productId: string) => Promise<void> | void
  isOnList?: boolean
}

const CATEGORY_TITLE: Record<UnitCategory, string> = {
  weight: 'By Weight',
  volume: 'By Volume',
  count: 'By Count',
}

const CATEGORY_ICON: Record<UnitCategory, typeof Scale> = {
  weight: Scale,
  volume: Package,
  count: Package,
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

export function ProductDetailDialog({
  open,
  onOpenChange,
  product,
  stores,
  onPricesChanged,
  onAddToList,
  isOnList,
}: Props) {
  const { toast } = useToast()
  const [priceFormOpen, setPriceFormOpen] = useState(false)
  const [editingPrice, setEditingPrice] = useState<ComputedPrice | null>(null)
  const [forkingPrice, setForkingPrice] = useState<ComputedPrice | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [addingToList, setAddingToList] = useState(false)
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current')
  const [historyPrices, setHistoryPrices] = useState<ComputedPrice[]>([])
  const [reactivatingId, setReactivatingId] = useState<string | null>(null)

  // Load ALL price entries (including expired sales) when the history tab is opened
  useEffect(() => {
    if (open && activeTab === 'history' && product) {
      void loadHistory()
    }
  }, [open, activeTab, product])

  // Reset internal state when dialog closes
  useEffect(() => {
    if (!open) {
      setPriceFormOpen(false)
      setEditingPrice(null)
      setForkingPrice(null)
      setDeletingId(null)
      setActiveTab('current')
      setHistoryPrices([])
    }
  }, [open])

  async function loadHistory() {
    if (!product) return
    try {
      const [localPrices, localStores] = await Promise.all([
        localDb.priceEntries.where('productId').equals(product.id).toArray(),
        localDb.stores.toArray(),
      ])
      const storeMap = new Map(localStores.filter((s) => !s.deletedAt).map((s) => [s.id, s]))
      const { computePrice } = await import('@/lib/units')
      const all = localPrices
        .filter((p) => !p.deletedAt)
        .map((p) => {
          const store = storeMap.get(p.storeId)
          return {
            id: p.id,
            storeId: p.storeId,
            storeName: store?.name ?? 'Unknown',
            storeColor: store?.color ?? '#888',
            storeLocation: store?.location ?? null,
            price: p.price,
            quantity: p.quantity,
            sizeValue: p.sizeValue,
            sizeUnit: p.sizeUnit,
            notes: p.notes ?? null,
            isSale: p.isSale,
            saleExpiresAt: p.saleExpiresAt ?? null,
            isOnline: p.isOnline ?? false,
            barcode: p.barcode ?? null,
            dateChecked: p.dateChecked,
            createdAt: p.createdAt,
            ...computePrice(p),
          } as ComputedPrice
        })
        .sort((a, b) => new Date(b.dateChecked).getTime() - new Date(a.dateChecked).getTime())
      setHistoryPrices(all)
    } catch (err) {
      console.error('Failed to load price history:', err)
    }
  }

  async function reactivateSale(p: ComputedPrice) {
    setReactivatingId(p.id)
    try {
      // Create a new price entry with the same details but a new sale expiry
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(23, 59, 0, 0)

      await localAddPrice(product!.id, {
        storeId: p.storeId,
        price: p.price,
        quantity: p.quantity,
        sizeValue: p.sizeValue,
        sizeUnit: p.sizeUnit,
        notes: p.notes,
        isSale: true,
        saleExpiresAt: tomorrow.toISOString(),
        isOnline: p.isOnline,
        barcode: p.barcode,
        dateChecked: new Date().toISOString(),
      })

      toast({
        title: 'Sale reactivated',
        description: `New sale entry created with expiry tomorrow`,
      })
      await loadHistory()
      onPricesChanged()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong'
      toast({ variant: 'destructive', title: 'Error', description: msg })
    } finally {
      setReactivatingId(null)
    }
  }

  if (!product) return null

  async function deletePrice(p: ComputedPrice) {
    setDeletingId(p.id)
    try {
      // Use local DB delete (writes to IndexedDB + schedules sync).
      // The local delete + onPricesChanged() will update the UI instantly.
      const { localDeletePrice } = await import('@/hooks/use-local-data')
      await localDeletePrice(p.id)
      toast({ title: 'Price removed', description: `${product?.name} — ${p.storeName}` })
      onPricesChanged()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Something went wrong'
      toast({ variant: 'destructive', title: 'Error', description: msg })
    } finally {
      setDeletingId(null)
    }
  }

  // Group prices by category and sort each group by price-per-base-unit ascending
  const grouped: Record<string, ComputedPrice[]> = {}
  for (const p of product.prices) {
    if (!grouped[p.category]) grouped[p.category] = []
    grouped[p.category].push(p)
  }
  for (const k of Object.keys(grouped)) {
    grouped[k].sort((a, b) => a.pricePerBaseUnit - b.pricePerBaseUnit)
  }
  const categories = Object.keys(grouped).sort() as UnitCategory[]

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="min-w-0">
              <DialogTitle className="text-xl leading-tight">{product.name}</DialogTitle>
              <DialogDescription className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {product.brand && <span className="font-medium text-foreground/80">{product.brand}</span>}
                {product.category && (
                  <>
                    <span>·</span>
                    <span>{product.category}</span>
                  </>
                )}
                <span>·</span>
                <span>{product.storeCount} store{product.storeCount === 1 ? '' : 's'}</span>
                <span>·</span>
                <span>{product.priceCount} price{product.priceCount === 1 ? '' : 's'}</span>
              </DialogDescription>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              {onAddToList && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={addingToList}
                  onClick={async () => {
                    setAddingToList(true)
                    try {
                      await onAddToList(product.id)
                    } finally {
                      setAddingToList(false)
                    }
                  }}
                >
                  {addingToList ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <div className="relative inline-flex mr-1">
                      <ShoppingCart
                        className={`h-3.5 w-3.5 ${
                          isOnList ? 'text-primary' : 'text-muted-foreground'
                        }`}
                      />
                      {isOnList && (
                        <span className="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full bg-primary flex items-center justify-center ring-1 ring-background">
                          <Check className="h-2 w-2 text-primary-foreground" strokeWidth={4} />
                        </span>
                      )}
                    </div>
                  )}
                  {isOnList ? 'On list' : 'Add to list'}
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => {
                  setEditingPrice(null)
                  setForkingPrice(null)
                  setPriceFormOpen(true)
                }}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Add price
              </Button>
            </div>
          </DialogHeader>

          {product.notes && (
            <div className="flex items-start gap-2 rounded-md bg-muted/60 p-2.5 text-xs text-muted-foreground">
              <StickyNote className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{product.notes}</span>
            </div>
          )}

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'current' | 'history')} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-2 mb-2">
              <TabsTrigger value="current">Current Prices</TabsTrigger>
              <TabsTrigger value="history">
                <History className="h-3 w-3 mr-1" />
                Price History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="current" className="flex-1 overflow-y-auto scrollbar-thin -mx-1 px-1 space-y-5 mt-0">
            {product.priceCount === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                <Package className="mx-auto mb-2 h-10 w-10 opacity-40" />
                <p>No prices tracked yet.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    setEditingPrice(null)
                    setForkingPrice(null)
                    setPriceFormOpen(true)
                  }}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add the first price
                </Button>
              </div>
            ) : (
              categories.map((cat) => {
                const entries = grouped[cat]
                const best = entries[0]
                const runnerUp = entries[1]
                const savingsVsRunnerUp = runnerUp
                  ? (1 - best.pricePerBaseUnit / runnerUp.pricePerBaseUnit) * 100
                  : null
                // Dollar savings: per-unit difference × total base units of the best pack
                // (this is what the user actually saves by buying the best pack vs the runner-up pack)
                const dollarSavings =
                  runnerUp && best.totalBaseUnits > 0
                    ? (runnerUp.pricePerBaseUnit - best.pricePerBaseUnit) * best.totalBaseUnits
                    : null
                const Icon = CATEGORY_ICON[cat]
                const smartLabel = best
                  ? formatPricePerUnitSmart(best.pricePerBaseUnit, cat).label
                  : BASE_UNIT_LABEL[cat]

                const bestIsSale = best.isSale === true
                const bestCountdown = bestIsSale
                  ? formatSaleCountdown(best.saleExpiresAt)
                  : null
                const bestSeverity = bestIsSale
                  ? saleCountdownSeverity(best.saleExpiresAt)
                  : 'normal'
                const BestSeverityIcon = SEVERITY_ICON[bestSeverity] ?? Clock

                return (
                  <section key={cat} className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5" />
                        {CATEGORY_TITLE[cat]}
                      </h3>
                      <span className="text-[10px] text-muted-foreground">
                        per {smartLabel}
                      </span>
                    </div>

                    {/* Best value card */}
                    {best && (
                      <div
                        className={`relative overflow-hidden rounded-xl border-2 p-3.5 ${
                          bestIsSale
                            ? 'border-amber-400/70 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/30'
                            : 'border-primary/60 bg-primary/5'
                        }`}
                      >
                        <div className="absolute inset-0 pointer-events-none best-value-glow opacity-60" />
                        <div className="relative flex items-start gap-3">
                          <div
                            className={`h-10 w-10 rounded-full grid place-items-center shrink-0 shadow-sm ${
                              bestIsSale
                                ? 'bg-amber-500 text-white'
                                : 'bg-primary text-primary-foreground'
                            }`}
                          >
                            {bestIsSale ? <Tag className="h-5 w-5" /> : <Trophy className="h-5 w-5" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: best.storeColor }}
                              />
                              <span className="font-semibold">{best.storeName}</span>
                              {best.isOnline && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] h-4 px-1 py-0 border-sky-500/60 text-sky-700 dark:text-sky-300 dark:border-sky-700/60 bg-sky-100 dark:bg-sky-900/40"
                                >
                                  <Globe className="h-2 w-2 mr-0.5" />
                                  Online
                                </Badge>
                              )}
                              <Badge
                                className={
                                  bestIsSale
                                    ? 'bg-amber-500 hover:bg-amber-500 text-white text-[10px] py-0 h-4.5'
                                    : 'bg-primary/90 text-primary-foreground text-[10px] py-0 h-4.5'
                                }
                              >
                                {bestIsSale ? 'Sale — best value' : 'Best value'}
                              </Badge>
                            </div>
                            <div className="mt-1 text-sm text-muted-foreground">
                              {formatNumber(best.quantity)} ×{' '}
                              {formatSize(best.sizeValue, best.sizeUnit)} pack
                              {best.notes && (
                                <span className="italic"> — {best.notes}</span>
                              )}
                            </div>
                            <div className="mt-2 flex items-baseline gap-3 flex-wrap">
                              <span className="text-2xl font-bold tracking-tight">
                                {formatCurrency(best.price)}
                              </span>
                              <span
                                className={`text-sm font-medium ${
                                  bestIsSale
                                    ? 'text-amber-700 dark:text-amber-300'
                                    : 'text-primary'
                                }`}
                              >
                                {formatPricePerUnitSmart(best.pricePerBaseUnit, best.category).text}
                              </span>
                              {savingsVsRunnerUp !== null && savingsVsRunnerUp > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  saves {savingsVsRunnerUp.toFixed(0)}%{dollarSavings !== null && dollarSavings > 0 ? ` (${formatCurrency(dollarSavings)})` : ''} vs {runnerUp.storeName}
                                </span>
                              )}
                            </div>
                            {bestIsSale && bestCountdown && (
                              <div
                                className={`mt-2 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 ${SEVERITY_TEXT_CLASS[bestSeverity]}`}
                              >
                                <BestSeverityIcon className="h-3 w-3" />
                                {bestCountdown}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col gap-1 shrink-0">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => {
                                setEditingPrice(best)
                                setForkingPrice(null)
                                setPriceFormOpen(true)
                              }}
                              aria-label="Edit best price"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => {
                                setEditingPrice(null)
                                setForkingPrice(best)
                                setPriceFormOpen(true)
                              }}
                              aria-label="Copy as new price"
                              title="Copy as new"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => deletePrice(best)}
                              disabled={deletingId === best.id}
                              aria-label="Delete best price"
                            >
                              {deletingId === best.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Other entries */}
                    {entries.length > 1 && (
                      <ul className="space-y-1.5">
                        {entries.slice(1).map((p) => {
                          const ratio = p.pricePerBaseUnit / best.pricePerBaseUnit
                          const pctMore = (ratio - 1) * 100
                          const pIsSale = p.isSale === true
                          const pCountdown = pIsSale
                            ? formatSaleCountdown(p.saleExpiresAt)
                            : null
                          const pSeverity = pIsSale
                            ? saleCountdownSeverity(p.saleExpiresAt)
                            : 'normal'
                          const PSeverityIcon = SEVERITY_ICON[pSeverity] ?? Clock
                          return (
                            <li
                              key={p.id}
                              className={`group relative flex items-center gap-3 rounded-lg border p-2.5 transition-colors ${
                                pIsSale
                                  ? 'border-amber-300/50 dark:border-amber-800/40 bg-amber-50/40 dark:bg-amber-950/15 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                                  : 'hover:bg-accent/50'
                              }`}
                            >
                              <span
                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: p.storeColor }}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-medium text-sm">{p.storeName}</span>
                                  {p.isOnline && (
                                    <Badge
                                      variant="outline"
                                      className="text-[9px] h-4 px-1 py-0 border-sky-500/60 text-sky-700 dark:text-sky-300 dark:border-sky-700/60 bg-sky-100 dark:bg-sky-900/40"
                                    >
                                      <Globe className="h-2 w-2 mr-0.5" />
                                      Online
                                    </Badge>
                                  )}
                                  {pIsSale && (
                                    <Badge
                                      variant="outline"
                                      className="text-[9px] h-4 px-1 py-0 border-amber-500/60 text-amber-700 dark:text-amber-300 dark:border-amber-700/60 bg-amber-100 dark:bg-amber-900/40"
                                    >
                                      <Tag className="h-2 w-2 mr-0.5" />
                                      Sale
                                    </Badge>
                                  )}
                                  <span className="text-[10px] text-muted-foreground">
                                    {formatNumber(p.quantity)} × {formatSize(p.sizeValue, p.sizeUnit)}
                                  </span>
                                </div>
                                {p.notes && (
                                  <p className="text-[11px] text-muted-foreground italic truncate">
                                    {p.notes}
                                  </p>
                                )}
                                <div className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                                  <span className="inline-flex items-center gap-0.5">
                                    <Calendar className="h-2.5 w-2.5" />
                                    {formatRelativeDate(p.dateChecked)}
                                  </span>
                                  {pIsSale && pCountdown && (
                                    <span
                                      className={`inline-flex items-center gap-0.5 ${SEVERITY_TEXT_CLASS[pSeverity]}`}
                                    >
                                      <PSeverityIcon className="h-2.5 w-2.5" />
                                      {pCountdown}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="font-semibold text-sm">
                                  {formatCurrency(p.price)}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  {formatPricePerUnitSmart(p.pricePerBaseUnit, p.category).text}
                                </div>
                                {pctMore > 0.5 && (
                                  <div className="text-[10px] text-amber-600 dark:text-amber-500 font-medium">
                                    +{pctMore.toFixed(0)}%
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  onClick={() => {
                                    setEditingPrice(p)
                                    setForkingPrice(null)
                                    setPriceFormOpen(true)
                                  }}
                                  aria-label="Edit price"
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  onClick={() => {
                                    setEditingPrice(null)
                                    setForkingPrice(p)
                                    setPriceFormOpen(true)
                                  }}
                                  aria-label="Copy as new price"
                                  title="Copy as new"
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-destructive hover:text-destructive"
                                  onClick={() => deletePrice(p)}
                                  disabled={deletingId === p.id}
                                  aria-label="Delete price"
                                >
                                  {deletingId === p.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3 w-3" />
                                  )}
                                </Button>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </section>
                )
              })
            )}
            </TabsContent>

            {/* Price History tab */}
            <TabsContent value="history" className="flex-1 overflow-y-auto scrollbar-thin -mx-1 px-1 space-y-4 mt-0">
              {historyPrices.length === 0 ? (
                <div className="text-center py-10 text-sm text-muted-foreground">
                  <History className="mx-auto mb-2 h-10 w-10 opacity-40" />
                  <p>No price history yet.</p>
                </div>
              ) : (
                (() => {
                  // Group by store, then by variant (quantity, sizeValue, sizeUnit)
                  const byStore = new Map<string, { storeName: string; storeColor: string; variants: Map<string, ComputedPrice[]> }>()
                  for (const p of historyPrices) {
                    if (!byStore.has(p.storeId)) {
                      byStore.set(p.storeId, { storeName: p.storeName, storeColor: p.storeColor, variants: new Map() })
                    }
                    const storeGroup = byStore.get(p.storeId)!
                    const variantKey = `${p.quantity}×${p.sizeValue}${p.sizeUnit}`
                    if (!storeGroup.variants.has(variantKey)) {
                      storeGroup.variants.set(variantKey, [])
                    }
                    storeGroup.variants.get(variantKey)!.push(p)
                  }

                  return Array.from(byStore.entries()).map(([storeId, storeGroup]) => (
                    <div key={storeId} className="rounded-lg border overflow-hidden">
                      <div
                        className="flex items-center gap-2 px-3 py-1.5 border-b"
                        style={{ backgroundColor: `color-mix(in srgb, ${storeGroup.storeColor} 12%, transparent)` }}
                      >
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: storeGroup.storeColor }} />
                        <span className="font-semibold text-sm">{storeGroup.storeName}</span>
                      </div>
                      <div className="divide-y">
                        {Array.from(storeGroup.variants.entries()).map(([variantKey, entries]) => {
                          const first = entries[0]
                          return (
                            <div key={variantKey} className="p-2.5">
                              <div className="text-[10px] text-muted-foreground font-medium mb-1.5">
                                {formatNumber(first.quantity)} × {formatSize(first.sizeValue, first.sizeUnit)}
                              </div>
                              <ul className="space-y-1">
                                {entries.map((p) => {
                                  const expired = p.isSale && isSaleExpired(p.saleExpiresAt)
                                  return (
                                    <li key={p.id} className="flex items-center gap-2 text-xs">
                                      <span className="font-mono font-semibold">{formatCurrency(p.price)}</span>
                                      <span className="text-muted-foreground">
                                        {formatPricePerUnitSmart(p.pricePerBaseUnit, p.category).text}
                                      </span>
                                      {p.isSale && (
                                        <Badge
                                          variant="outline"
                                          className={`text-[8px] h-3.5 px-1 py-0 ${
                                            expired
                                              ? 'border-muted-foreground/30 text-muted-foreground bg-muted/30'
                                              : 'border-amber-500/60 text-amber-700 dark:text-amber-300 dark:border-amber-700/60 bg-amber-100 dark:bg-amber-900/40'
                                          }`}
                                        >
                                          <Tag className="h-2 w-2 mr-0.5" />
                                          {expired ? 'Sale expired' : 'Sale'}
                                        </Badge>
                                      )}
                                      {p.isOnline && (
                                        <Badge
                                          variant="outline"
                                          className="text-[8px] h-3.5 px-1 py-0 border-sky-500/60 text-sky-700 dark:text-sky-300 dark:border-sky-700/60 bg-sky-100 dark:bg-sky-900/40"
                                        >
                                          <Globe className="h-2 w-2 mr-0.5" />
                                          Online
                                        </Badge>
                                      )}
                                      <span className="text-muted-foreground/60 text-[10px]">
                                        {formatRelativeDate(p.dateChecked)}
                                      </span>
                                      {expired && (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-5 px-1.5 text-[10px] ml-auto"
                                          onClick={() => reactivateSale(p)}
                                          disabled={reactivatingId === p.id}
                                        >
                                          {reactivatingId === p.id ? (
                                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                          ) : (
                                            'Reactivate'
                                          )}
                                        </Button>
                                      )}
                                    </li>
                                  )
                                })}
                              </ul>
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

          <div className="flex-1 overflow-hidden" />

          {product.priceCount > 0 && (
            <>
              <Separator />
              <DialogFooter className="sm:justify-between items-center">
                <p className="text-xs text-muted-foreground">
                  <StoreIcon className="inline h-3 w-3 mr-1" />
                  Prices compared across {product.storeCount} store{product.storeCount === 1 ? '' : 's'}.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingPrice(null)
                    setForkingPrice(null)
                    setPriceFormOpen(true)
                  }}
                >
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
        product={product}
        stores={stores}
        initial={editingPrice}
        forkFrom={forkingPrice}
        onSaved={onPricesChanged}
      />
    </>
  )
}
