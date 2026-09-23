// Shopping list computation: figure out the best store to buy each item at,
// factoring in active sales. When a sale expires, the item should "fall through"
// to the next-best store automatically.

import { isSaleExpired, type UnitCategory } from './units'

export interface ShoppingListPrice {
  id: string
  storeId: string
  storeName: string
  storeColor: string
  price: number
  quantity: number
  sizeValue: number
  sizeUnit: string
  isSale: boolean
  saleExpiresAt?: string | null
  pricePerBaseUnit: number
  totalBaseUnits: number
  category: UnitCategory
}

export interface ShoppingListItemProduct {
  id: string
  name: string
  brand?: string | null
  category?: string | null
  imageUrl?: string | null
}

export interface ShoppingListItemInput {
  id: string // ShoppingListItem id
  productId: string
  quantity: number // how many the user wants to buy
  notes?: string | null
  addedAt: string
  purchased: boolean
  product: ShoppingListItemProduct
  prices: ShoppingListPrice[]
}

export interface ShoppingListBestStore {
  // The recommended store to buy this item at right now
  price: ShoppingListPrice
  // The next-best option (used for savings comparison when on sale)
  runnerUp?: ShoppingListPrice
  // Total cost for the requested quantity at the best store
  // (assumes buying 1 pack at the best store; quantity multiplier applied)
  totalPrice: number
  // Per-unit price (always populated)
  pricePerBaseUnit: number
  // Savings info — only populated when the best is a sale
  savings?: {
    // Dollar amount saved per base unit vs runner-up
    perUnit: number
    // Total dollar amount saved if you buy `quantity` packs at the best store
    total: number
    // Percentage saved vs runner-up
    percent: number
    // Store name of the runner-up
    vsStoreName: string
  }
}

export interface ShoppingListGroupedItem {
  item: ShoppingListItemInput
  best: ShoppingListBestStore
}

export interface ShoppingListGroup {
  store: {
    id: string
    name: string
    color: string
  }
  items: ShoppingListGroupedItem[]
  // Sum of all item totalPrices in this group
  subtotal: number
  // Total savings across all sale items in this group
  totalSavings: number
  // Number of items in this group that are on sale
  saleItemCount: number
}

export interface ShoppingListComputed {
  groups: ShoppingListGroup[]
  ungroupedItems: ShoppingListGroupedItem[] // items with no available prices
  totalItems: number
  totalCost: number
  totalSavings: number
  totalSaleItems: number
}

/**
 * Given a shopping list item with its prices, find the best store to buy it at.
 * Excludes expired sales.
 *
 * "Best" = lowest price per base unit, factoring in size differences.
 * If a sale is best, also compute savings vs the runner-up (which is what the user
 * would pay when the sale expires).
 */
export function computeBestStoreForItem(
  item: ShoppingListItemInput
): ShoppingListBestStore | null {
  // Filter out expired sales
  const visible = item.prices.filter(
    (p) => !p.isSale || !isSaleExpired(p.saleExpiresAt)
  )
  if (visible.length === 0) return null

  // Sort by price per base unit ascending
  const sorted = [...visible].sort(
    (a, b) => a.pricePerBaseUnit - b.pricePerBaseUnit
  )
  const best = sorted[0]
  const runnerUp = sorted[1]

  // Total price for the user's requested quantity (buying one pack at a time)
  const totalPrice = best.price * Math.max(item.quantity, 1)

  let savings: ShoppingListBestStore['savings'] | undefined
  if (best.isSale && runnerUp) {
    const perUnitSavings = runnerUp.pricePerBaseUnit - best.pricePerBaseUnit
    const totalBaseUnits = best.totalBaseUnits * Math.max(item.quantity, 1)
    const totalSavings = perUnitSavings * totalBaseUnits
    const percent =
      runnerUp.pricePerBaseUnit > 0
        ? (1 - best.pricePerBaseUnit / runnerUp.pricePerBaseUnit) * 100
        : 0
    if (perUnitSavings > 0) {
      savings = {
        perUnit: perUnitSavings,
        total: totalSavings,
        percent,
        vsStoreName: runnerUp.storeName,
      }
    }
  }

  return {
    price: best,
    runnerUp,
    totalPrice,
    pricePerBaseUnit: best.pricePerBaseUnit,
    savings,
  }
}

/**
 * Group shopping list items by their best store.
 * Each group contains the items to buy at that store, with subtotals and savings.
 * Items with no prices go into `ungroupedItems`.
 */
export function groupShoppingListByBestStore(
  items: ShoppingListItemInput[]
): ShoppingListComputed {
  const groupsMap = new Map<string, ShoppingListGroup>()
  const ungroupedItems: ShoppingListGroupedItem[] = []

  for (const item of items) {
    if (item.purchased) continue // skip purchased items
    const best = computeBestStoreForItem(item)
    if (!best) {
      ungroupedItems.push({ item, best: null as unknown as ShoppingListBestStore })
      continue
    }

    const storeId = best.price.storeId
    if (!groupsMap.has(storeId)) {
      groupsMap.set(storeId, {
        store: {
          id: storeId,
          name: best.price.storeName,
          color: best.price.storeColor,
        },
        items: [],
        subtotal: 0,
        totalSavings: 0,
        saleItemCount: 0,
      })
    }

    const group = groupsMap.get(storeId)!
    group.items.push({ item, best })
    group.subtotal += best.totalPrice
    if (best.savings) {
      group.totalSavings += best.savings.total
      group.saleItemCount += 1
    }
  }

  // Sort groups: by subtotal descending (so the most expensive trip is first)
  const groups = Array.from(groupsMap.values()).sort(
    (a, b) => b.subtotal - a.subtotal
  )
  // Within each group, sort items: sale items first (most urgent), then by name
  for (const g of groups) {
    g.items.sort((a, b) => {
      if (a.best.savings && !b.best.savings) return -1
      if (!a.best.savings && b.best.savings) return 1
      return a.item.product.name.localeCompare(b.item.product.name)
    })
  }

  const totalCost = groups.reduce((sum, g) => sum + g.subtotal, 0)
  const totalSavings = groups.reduce((sum, g) => sum + g.totalSavings, 0)
  const totalSaleItems = groups.reduce((sum, g) => sum + g.saleItemCount, 0)
  const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0) + ungroupedItems.length

  return {
    groups,
    ungroupedItems,
    totalItems,
    totalCost,
    totalSavings,
    totalSaleItems,
  }
}
