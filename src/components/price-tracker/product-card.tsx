'use client'

import { useMemo, useState } from 'react'
import {
  Trophy,
  Store as StoreIcon,
  Pencil,
  Trash2,
  Tag,
  Clock,
  Flame,
  ShoppingCart,
  Check,
  Loader2,
  Globe,
} from 'lucide-react'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  formatCurrency,
  formatPricePerUnitSmart,
  formatSaleCountdown,
  saleCountdownSeverity,
  BASE_UNIT_LABEL,
} from '@/lib/units'
import type { Product, ComputedPrice } from './types'

interface Props {
  product: Product
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
  onAddToList?: (productId: string) => Promise<void> | void
  /** Optional: if true, shows a checkmark instead of cart icon (item already on list) */
  isOnList?: boolean
}

const SEVERITY_CLASS: Record<string, string> = {
  urgent: 'text-red-600 dark:text-red-400',
  warning: 'text-amber-600 dark:text-amber-400',
  normal: 'text-muted-foreground',
  expired: 'text-muted-foreground line-through',
}

const SEVERITY_ICON: Record<string, typeof Flame> = {
  urgent: Flame,
  warning: Clock,
  normal: Clock,
  expired: Clock,
}

/**
 * Compute the savings of a sale best-value vs the runner-up.
 * Returns null if the entry isn't a sale or if there's no runner-up.
 */
function computeSaleSavings(
  best: ComputedPrice,
  runnerUp?: ComputedPrice
): {
  total: number
  percent: number
  vsStoreName: string
} | null {
  if (!best.isSale || !runnerUp) return null
  const perUnitSavings = runnerUp.pricePerBaseUnit - best.pricePerBaseUnit
  if (perUnitSavings <= 0) return null
  const totalSavings = perUnitSavings * best.totalBaseUnits
  const percent =
    runnerUp.pricePerBaseUnit > 0
      ? (1 - best.pricePerBaseUnit / runnerUp.pricePerBaseUnit) * 100
      : 0
  return {
    total: totalSavings,
    percent,
    vsStoreName: runnerUp.storeName,
  }
}

export function ProductCard({
  product,
  onOpen,
  onEdit,
  onDelete,
  onAddToList,
  isOnList,
}: Props) {
  const bestCats = product.bestPerCategory
    ? Object.values(product.bestPerCategory).filter(Boolean) as ComputedPrice[]
    : []

  // Pick the cheapest unit price overall
  const overallBest =
    bestCats.length > 0
      ? bestCats.reduce((min, cur) =>
          cur.pricePerBaseUnit < min.pricePerBaseUnit ? cur : min
        )
      : null

  // Find the runner-up for savings comparison: any other price entry that's
  // more expensive than the best, in the same category.
  const runnerUp = useMemo(() => {
    if (!overallBest) return undefined
    const candidates = product.prices
      .filter((p) => p.category === overallBest.category && p.id !== overallBest.id)
      .sort((a, b) => a.pricePerBaseUnit - b.pricePerBaseUnit)
    return candidates[0]
  }, [product.prices, overallBest])

  const bestIsSale = overallBest?.isSale === true
  const bestCountdown = bestIsSale
    ? formatSaleCountdown(overallBest!.saleExpiresAt)
    : null
  const bestSeverity = bestIsSale
    ? saleCountdownSeverity(overallBest!.saleExpiresAt)
    : 'normal'
  const SeverityIcon = SEVERITY_ICON[bestSeverity] ?? Clock

  const saleSavings =
    bestIsSale && overallBest ? computeSaleSavings(overallBest, runnerUp) : null

  // Total number of active sales across the product
  const activeSaleCount = product.prices.filter((p) => p.isSale).length

  const [adding, setAdding] = useState(false)

  async function handleAddToList(e: React.MouseEvent) {
    e.stopPropagation()
    if (!onAddToList) return
    setAdding(true)
    try {
      await onAddToList(product.id)
    } finally {
      setAdding(false)
    }
  }

  return (
    <Card
      className="group relative overflow-hidden p-4 cursor-pointer hover:shadow-md hover:border-primary/40 transition-all"
      onClick={onOpen}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-tight truncate">{product.name}</h3>
          {product.category && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {product.category}
            </p>
          )}
        </div>
        <div className="flex opacity-0 group-hover:opacity-100 transition-opacity gap-0.5 -mr-1 -mt-1">
          {onAddToList && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={handleAddToList}
              disabled={adding}
              aria-label={
                isOnList
                  ? `Remove ${product.name} from shopping list`
                  : `Add ${product.name} to shopping list`
              }
              title={
                isOnList ? 'Remove from shopping list' : 'Add to shopping list'
              }
            >
              {adding ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <div className="relative inline-flex">
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
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
            aria-label={`Edit ${product.name}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            aria-label={`Delete ${product.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {product.priceCount === 0 ? (
        <div className="mt-4 text-xs text-muted-foreground italic">
          No prices tracked yet
        </div>
      ) : (
        <>
          {overallBest && (
            <div
              className={`mt-3 rounded-lg border px-3 py-2 ${
                bestIsSale
                  ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300/60 dark:border-amber-700/60'
                  : 'bg-primary/8 dark:bg-primary/10 border-primary/30'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider ${
                    bestIsSale
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-primary'
                  }`}
                >
                  {bestIsSale ? <Tag className="h-3 w-3" /> : <Trophy className="h-3 w-3" />}
                  {bestIsSale ? 'Sale — best value' : 'Best value'}
                </span>
                <span
                  className={`font-semibold text-sm ${
                    bestIsSale
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-primary'
                  }`}
                >
                  {formatPricePerUnitSmart(
                    overallBest.pricePerBaseUnit,
                    overallBest.category
                  ).text}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs flex-wrap">
                <span
                  className="inline-block h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: overallBest.storeColor }}
                />
                <span className="font-medium">{overallBest.storeName}</span>
                {overallBest.isOnline && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-medium px-1 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300">
                    <Globe className="h-2 w-2" />
                    Online
                  </span>
                )}
                <span className="text-muted-foreground">
                  · {formatCurrency(overallBest.price)} for {overallBest.quantity}
                </span>
              </div>
              {/* Savings callout — dollar amount + percent vs runner-up */}
              {saleSavings && (
                <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                  <Tag className="h-2.5 w-2.5" />
                  Save {formatCurrency(saleSavings.total)} ({saleSavings.percent.toFixed(0)}%) vs {saleSavings.vsStoreName}
                </div>
              )}
              {bestIsSale && bestCountdown && (
                <div
                  className={`mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 ${SEVERITY_CLASS[bestSeverity]}`}
                >
                  <SeverityIcon className="h-2.5 w-2.5" />
                  {bestCountdown}
                </div>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <StoreIcon className="h-3 w-3" />
              {product.storeCount} store{product.storeCount === 1 ? '' : 's'}
            </span>
            <div className="flex items-center gap-1.5">
              {activeSaleCount > 0 && (
                <Badge
                  variant="outline"
                  className="text-[10px] h-4.5 border-amber-400/60 text-amber-700 dark:text-amber-400 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/30"
                >
                  <Tag className="h-2.5 w-2.5 mr-0.5" />
                  {activeSaleCount}
                </Badge>
              )}
              <Badge variant="secondary" className="text-[10px] h-4.5">
                {product.priceCount} price{product.priceCount === 1 ? '' : 's'}
              </Badge>
            </div>
          </div>

          {/* Multi-category comparison hints */}
          {bestCats.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {bestCats.map((b, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 text-[10px] rounded-full bg-muted px-1.5 py-0.5"
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: b.storeColor }}
                  />
                  {BASE_UNIT_LABEL[b.category]}
                  {b.isSale && <Tag className="h-2 w-2 ml-0.5 text-amber-600 dark:text-amber-400" />}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  )
}

