'use client'

import { useEffect, useState, useCallback } from 'react'
import { localDb, generateId, type LocalStore, type LocalProduct, type LocalPriceEntry, type LocalShoppingListItem } from '@/lib/local-db'
import { sync, scheduleSync, refreshPendingCount } from '@/lib/sync'
import { computePrice, isSaleExpired } from '@/lib/units'
import type { Product, Store, ComputedPrice } from '@/components/price-tracker/types'

// === Local DB query helpers (read from IndexedDB) ===

export function useLocalStores() {
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const local = await localDb.stores.toArray()
      const active = local
        .filter((s) => !s.deletedAt)
        .sort((a, b) => a.name.localeCompare(b.name))
      const mapped: Store[] = active.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        location: s.location ?? null,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }))
      setStores(mapped)
    } catch (err) {
      console.error('Failed to load stores from local DB:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { stores, loading, reload: load }
}

export function useLocalProducts() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [localProducts, localPrices, localStores] = await Promise.all([
        localDb.products.toArray(),
        localDb.priceEntries.toArray(),
        localDb.stores.toArray(),
      ])

      const storeMap = new Map(localStores.map((s) => [s.id, s]))
      const activeProducts = localProducts.filter((p) => !p.deletedAt)
        .sort((a, b) => a.name.localeCompare(b.name))

      const mapped: Product[] = activeProducts.map((p) => {
        const productPrices = localPrices
          .filter((pr) => pr.productId === p.id && !pr.deletedAt)
          .filter((pr) => !pr.isSale || !isSaleExpired(pr.saleExpiresAt))
          .map((pr): ComputedPrice => {
            const store = storeMap.get(pr.storeId)
            return {
              id: pr.id,
              storeId: pr.storeId,
              storeName: store?.name ?? 'Unknown',
              storeColor: store?.color ?? '#888',
              storeLocation: store?.location ?? null,
              price: pr.price,
              quantity: pr.quantity,
              sizeValue: pr.sizeValue,
              sizeUnit: pr.sizeUnit,
              brand: pr.brand ?? null,
              imageUrl: pr.imageUrl ?? null,
              notes: pr.notes ?? null,
              isSale: pr.isSale,
              saleExpiresAt: pr.saleExpiresAt ?? null,
              isOnline: pr.isOnline ?? false,
              barcode: pr.barcode ?? null,
              dateChecked: pr.dateChecked,
              createdAt: pr.createdAt,
              ...computePrice(pr),
            }
          })

        const byCategory: Record<string, ComputedPrice[]> = {}
        for (const c of productPrices) {
          const key = c.category
          if (!byCategory[key]) byCategory[key] = []
          byCategory[key].push(c)
        }
        for (const k of Object.keys(byCategory)) {
          byCategory[k].sort((a, b) => a.pricePerBaseUnit - b.pricePerBaseUnit)
        }
        const bestPerCategory: Record<string, ComputedPrice | undefined> = {}
        for (const [cat, entries] of Object.entries(byCategory)) {
          bestPerCategory[cat] = entries[0]
        }

        const allPrices = productPrices.map((c) => c.pricePerBaseUnit)
        const lowestPricePerUnit = allPrices.length ? Math.min(...allPrices) : null
        const storeCount = new Set(productPrices.map((pr) => pr.storeId)).size

        return {
          id: p.id,
          name: p.name,
          category: p.category ?? null,
          notes: p.notes ?? null,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          prices: productPrices,
          byCategory,
          bestPerCategory,
          lowestPricePerUnit,
          storeCount,
          priceCount: productPrices.length,
        }
      })

      setProducts(mapped)
    } catch (err) {
      console.error('Failed to load products from local DB:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { products, loading, reload: load }
}

// === Local DB mutation helpers (write to IndexedDB + trigger sync) ===

export async function localAddProduct(data: {
  name: string
  category?: string | null
  notes?: string | null
}): Promise<string> {
  const id = generateId()
  const now = new Date().toISOString()
  const record: LocalProduct = {
    id,
    name: data.name,
    category: data.category ?? null,
    notes: data.notes ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    _pendingSync: true,
  }
  await localDb.products.add(record)
  await refreshPendingCount()
  scheduleSync()
  return id
}

export async function localUpdateProduct(id: string, data: Partial<LocalProduct>): Promise<void> {
  const now = new Date().toISOString()
  await localDb.products.update(id, { ...data, updatedAt: now, _pendingSync: true })
  await refreshPendingCount()
  scheduleSync()
}

export async function localDeleteProduct(id: string): Promise<void> {
  const now = new Date().toISOString()
  await localDb.products.update(id, { deletedAt: now, updatedAt: now, _pendingSync: true })
  await refreshPendingCount()
  scheduleSync()
}

export async function localAddPrice(productId: string, data: {
  storeId: string
  price: number
  quantity: number
  sizeValue: number
  sizeUnit: string
  brand?: string | null
  imageUrl?: string | null
  notes?: string | null
  isSale?: boolean
  saleExpiresAt?: string | null
  isOnline?: boolean
  barcode?: string | null
  dateChecked?: string
}): Promise<string> {
  const id = generateId()
  const now = new Date().toISOString()
  const record: LocalPriceEntry = {
    id,
    productId,
    storeId: data.storeId,
    price: data.price,
    quantity: data.quantity,
    sizeValue: data.sizeValue,
    sizeUnit: data.sizeUnit,
    brand: data.brand ?? null,
    imageUrl: data.imageUrl ?? null,
    notes: data.notes ?? null,
    isSale: data.isSale ?? false,
    saleExpiresAt: data.saleExpiresAt ?? null,
    isOnline: data.isOnline ?? false,
    barcode: data.barcode ?? null,
    dateChecked: data.dateChecked ?? now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    _pendingSync: true,
  }
  await localDb.priceEntries.add(record)
  await refreshPendingCount()
  scheduleSync()
  return id
}

export async function localUpdatePrice(id: string, data: Partial<LocalPriceEntry>): Promise<void> {
  const now = new Date().toISOString()
  await localDb.priceEntries.update(id, { ...data, updatedAt: now, _pendingSync: true })
  await refreshPendingCount()
  scheduleSync()
}

export async function localDeletePrice(id: string): Promise<void> {
  const now = new Date().toISOString()
  await localDb.priceEntries.update(id, { deletedAt: now, updatedAt: now, _pendingSync: true })
  await refreshPendingCount()
  scheduleSync()
}

// === Store mutations ===

export async function localAddStore(data: {
  name: string
  color?: string
  location?: string | null
}): Promise<string> {
  const id = generateId()
  const now = new Date().toISOString()
  const record: LocalStore = {
    id,
    name: data.name,
    color: data.color ?? '#8b5cf6',
    location: data.location ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    _pendingSync: true,
  }
  await localDb.stores.add(record)
  await refreshPendingCount()
  scheduleSync()
  return id
}

export async function localUpdateStore(id: string, data: Partial<LocalStore>): Promise<void> {
  const now = new Date().toISOString()
  await localDb.stores.update(id, { ...data, updatedAt: now, _pendingSync: true })
  await refreshPendingCount()
  scheduleSync()
}

export async function localDeleteStore(id: string): Promise<void> {
  const now = new Date().toISOString()
  await localDb.stores.update(id, { deletedAt: now, updatedAt: now, _pendingSync: true })
  await refreshPendingCount()
  scheduleSync()
}

export async function localUpdateShoppingListItem(id: string, data: Partial<LocalShoppingListItem>): Promise<void> {
  const now = new Date().toISOString()
  await localDb.shoppingListItems.update(id, { ...data, updatedAt: now, _pendingSync: true })
  await refreshPendingCount()
  scheduleSync()
}

export async function localAddToShoppingList(productId: string, quantity = 1): Promise<string> {
  const id = generateId()
  const now = new Date().toISOString()
  const record: LocalShoppingListItem = {
    id,
    productId,
    quantity,
    notes: null,
    purchased: false,
    addedAt: now,
    updatedAt: now,
    deletedAt: null,
    _pendingSync: true,
  }
  await localDb.shoppingListItems.add(record)
  await refreshPendingCount()
  scheduleSync()
  return id
}

export async function localDeleteShoppingListItem(id: string): Promise<void> {
  const now = new Date().toISOString()
  await localDb.shoppingListItems.update(id, { deletedAt: now, updatedAt: now, _pendingSync: true })
  await refreshPendingCount()
  scheduleSync()
}

export async function localToggleShoppingListPurchased(id: string, purchased: boolean): Promise<void> {
  const now = new Date().toISOString()
  await localDb.shoppingListItems.update(id, { purchased, updatedAt: now, _pendingSync: true })
  await refreshPendingCount()
  scheduleSync()
}
