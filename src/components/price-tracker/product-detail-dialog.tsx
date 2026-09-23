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
import { useToast } from '@/hooks/use-toast'
import {
  formatCurrency,
  formatNumber,
  formatPricePerUnitSmart,
  formatRelativeDate,
  formatSaleCountdown,
  saleCountdownSeverity,
  formatSize,
  BASE_UNIT_LABEL,
  type UnitCategory,
} from '@/lib/units'
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
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [addingToList, setAddingToList] = useState(false)

  // Reset internal state when dialog closes
  useEffect(() => {
    if (!open) {
      setPriceFormOpen(false)
      setEditingPrice(null)
      setDeletingId(null)
    }
  }, [open])

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
                  ) : isOnList ? (
                    <Check className="mr-1 h-3.5 w-3.5" />
                  ) : (
                    <ShoppingCart className="mr-1 h-3.5 w-3.5" />
                  )}
                  {isOnList ? 'On list (click to remove)' : 'Add to list'}
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => {
                  setEditingPrice(null)
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

          <div className="flex-1 overflow-y-auto scrollbar-thin -mx-1 px-1 space-y-5">
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
                                setPriceFormOpen(true)
                              }}
                              aria-label="Edit best price"
                            >
                              <Pencil className="h-3.5 w-3.5" />
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
                                    setPriceFormOpen(true)
                                  }}
                                  aria-label="Edit price"
                                >
                                  <Pencil className="h-3 w-3" />
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
          </div>

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
        onSaved={onPricesChanged}
      />
    </>
  )
}
