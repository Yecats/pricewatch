// Hooks + mutations for the 3-layer model: ProductGroup → Product → PriceEntry
import { useEffect, useState, useCallback } from 'react'
import { localDb, generateId, type LocalStore, type LocalProductGroup, type LocalGroupProduct, type LocalProduct, type LocalPriceEntry, type LocalShoppingListItem } from '@/lib/local-db'
import { scheduleSync, refreshPendingCount } from '@/lib/sync'
import { computePrice, isSaleExpired } from '@/lib/units'
import type { ProductGroup, GroupProduct, Product, ComputedPrice, Store } from '@/components/price-tracker/types'

const now = () => new Date().toISOString()

function markAndSchedule(table: any, id: string) {
  return table.update(id, { _pendingSync: true }).then(() => { refreshPendingCount(); scheduleSync() })
}

// === Store hooks ===
export function useLocalStores() {
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    const all = await localDb.stores.toArray()
    setStores(all.filter(s => !s.deletedAt).sort((a, b) => a.name.localeCompare(b.name)).map(s => ({
      id: s.id, name: s.name, color: s.color, location: s.location ?? null, createdAt: s.createdAt, updatedAt: s.updatedAt,
    })))
    setLoading(false)
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])
  return { stores, loading, reload: load }
}

// === Group hooks ===
export function useLocalGroups() {
  const [groups, setGroups] = useState<ProductGroup[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [localGroups, localGroupProducts, localProducts, localPrices, localStores] = await Promise.all([
      localDb.productGroups.toArray(), localDb.groupProducts.toArray(),
      localDb.products.toArray(), localDb.priceEntries.toArray(), localDb.stores.toArray(),
    ])
    const storeMap = new Map(localStores.filter(s => !s.deletedAt).map(s => [s.id, s]))
    const productMap = new Map(localProducts.filter(p => !p.deletedAt).map(p => [p.id, p]))

    const result: ProductGroup[] = localGroups
      .filter(g => !g.deletedAt)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(g => {
        const groupLinks = localGroupProducts.filter(gp => gp.groupId === g.id)
        const allPrices: ComputedPrice[] = []

        const products: GroupProduct[] = groupLinks.map(gp => {
          const product = productMap.get(gp.productId)
          if (!product) return null
          const productPrices = localPrices
            .filter(p => p.productId === product.id && !p.deletedAt)
            .filter(p => !p.isSale || !isSaleExpired(p.saleExpiresAt))
            .map((p): ComputedPrice => {
              const store = storeMap.get(p.storeId)
              return {
                id: p.id, productId: p.productId, storeId: p.storeId,
                storeName: store?.name ?? 'Unknown', storeColor: store?.color ?? '#888',
                storeLocation: store?.location ?? null,
                price: p.price, quantity: p.quantity, sizeValue: p.sizeValue, sizeUnit: p.sizeUnit,
                notes: p.notes ?? null, isSale: p.isSale, saleExpiresAt: p.saleExpiresAt ?? null,
                isOnline: p.isOnline ?? false, dateChecked: p.dateChecked, createdAt: p.createdAt,
                ...computePrice(p),
              }
            })
          allPrices.push(...productPrices)
          const vals = productPrices.map(c => c.pricePerBaseUnit)
          const best = productPrices.length ? [...productPrices].sort((a, b) => a.pricePerBaseUnit - b.pricePerBaseUnit)[0] : null
          return {
            id: gp.id, productId: product.id, name: product.name, brand: product.brand,
            barcode: product.barcode, imageUrl: product.imageUrl, category: product.category, notes: product.notes,
            prices: productPrices, bestPrice: best,
            lowestPricePerUnit: vals.length ? Math.min(...vals) : null,
            storeCount: new Set(productPrices.map(p => p.storeId)).size,
            priceCount: productPrices.length,
          }
        }).filter(Boolean) as GroupProduct[]

        const allVals = allPrices.map(c => c.pricePerBaseUnit)
        const best = allPrices.length ? [...allPrices].sort((a, b) => a.pricePerBaseUnit - b.pricePerBaseUnit)[0] : null
        return {
          id: g.id, name: g.name, category: g.category, notes: g.notes,
          createdAt: g.createdAt, updatedAt: g.updatedAt,
          products,
          bestPrice: best,
          lowestPricePerUnit: allVals.length ? Math.min(...allVals) : null,
          storeCount: new Set(allPrices.map(p => p.storeId)).size,
          productCount: products.length,
          priceCount: allPrices.length,
        }
      })

    setGroups(result)
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])
  return { groups, loading, reload: load }
}

// === Product hooks (standalone Products tab) ===
export function useLocalProducts() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [localProducts, localPrices, localStores, localGroupProducts] = await Promise.all([
      localDb.products.toArray(), localDb.priceEntries.toArray(), localDb.stores.toArray(), localDb.groupProducts.toArray(),
    ])
    const storeMap = new Map(localStores.filter(s => !s.deletedAt).map(s => [s.id, s]))

    const result: Product[] = localProducts
      .filter(p => !p.deletedAt)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(p => {
        const productPrices = localPrices
          .filter(pr => pr.productId === p.id && !pr.deletedAt)
          .filter(pr => !pr.isSale || !isSaleExpired(pr.saleExpiresAt))
          .map((pr): ComputedPrice => {
            const store = storeMap.get(pr.storeId)
            return {
              id: pr.id, productId: pr.productId, storeId: pr.storeId,
              storeName: store?.name ?? 'Unknown', storeColor: store?.color ?? '#888',
              storeLocation: store?.location ?? null,
              price: pr.price, quantity: pr.quantity, sizeValue: pr.sizeValue, sizeUnit: pr.sizeUnit,
              notes: pr.notes ?? null, isSale: pr.isSale, saleExpiresAt: pr.saleExpiresAt ?? null,
              isOnline: pr.isOnline ?? false, dateChecked: pr.dateChecked, createdAt: pr.createdAt,
              ...computePrice(pr),
            }
          })
        const vals = productPrices.map(c => c.pricePerBaseUnit)
        const best = productPrices.length ? [...productPrices].sort((a, b) => a.pricePerBaseUnit - b.pricePerBaseUnit)[0] : null
        return {
          id: p.id, name: p.name, brand: p.brand, barcode: p.barcode, imageUrl: p.imageUrl,
          category: p.category, notes: p.notes, createdAt: p.createdAt, updatedAt: p.updatedAt,
          prices: productPrices, bestPrice: best,
          lowestPricePerUnit: vals.length ? Math.min(...vals) : null,
          storeCount: new Set(productPrices.map(pr => pr.storeId)).size,
          priceCount: productPrices.length,
          groupIds: localGroupProducts.filter(gp => gp.productId === p.id).map(gp => gp.groupId),
        }
      })

    setProducts(result)
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])
  return { products, loading, reload: load }
}

// === Mutations ===
export async function localAddGroup(data: { name: string; category?: string | null; notes?: string | null; productIds?: string[] }): Promise<string> {
  const id = generateId()
  const t = now()
  await localDb.productGroups.add({ id, name: data.name, category: data.category ?? null, notes: data.notes ?? null, createdAt: t, updatedAt: t, deletedAt: null, _pendingSync: true })
  if (data.productIds) {
    for (const pid of data.productIds) {
      const gpid = generateId()
      await localDb.groupProducts.add({ id: gpid, groupId: id, productId: pid, createdAt: t, _pendingSync: true })
    }
  }
  await refreshPendingCount(); scheduleSync()
  return id
}

export async function localUpdateGroup(id: string, data: Partial<LocalProductGroup>): Promise<void> {
  await localDb.productGroups.update(id, { ...data, updatedAt: now(), _pendingSync: true })
  await refreshPendingCount(); scheduleSync()
}

export async function localDeleteGroup(id: string): Promise<void> {
  await localDb.productGroups.update(id, { deletedAt: now(), updatedAt: now(), _pendingSync: true })
  await refreshPendingCount(); scheduleSync()
}

export async function localAddProduct(data: {
  name: string; brand?: string | null; barcode?: string | null; imageUrl?: string | null;
  category?: string | null; notes?: string | null; groupId?: string | null;
}): Promise<string> {
  const id = generateId()
  const t = now()
  await localDb.products.add({ id, name: data.name, brand: data.brand ?? null, barcode: data.barcode ?? null, imageUrl: data.imageUrl ?? null, category: data.category ?? null, notes: data.notes ?? null, createdAt: t, updatedAt: t, deletedAt: null, _pendingSync: true })
  if (data.groupId) {
    const gpid = generateId()
    await localDb.groupProducts.add({ id: gpid, groupId: data.groupId, productId: id, createdAt: t, _pendingSync: true })
  }
  await refreshPendingCount(); scheduleSync()
  return id
}

export async function localUpdateProduct(id: string, data: Partial<LocalProduct>): Promise<void> {
  await localDb.products.update(id, { ...data, updatedAt: now(), _pendingSync: true })
  await refreshPendingCount(); scheduleSync()
}

export async function localDeleteProduct(id: string): Promise<void> {
  await localDb.products.update(id, { deletedAt: now(), updatedAt: now(), _pendingSync: true })
  await refreshPendingCount(); scheduleSync()
}

export async function localAddPrice(productId: string, data: {
  storeId: string; price: number; quantity: number; sizeValue: number; sizeUnit: string;
  notes?: string | null; isSale?: boolean; saleExpiresAt?: string | null;
  isOnline?: boolean; barcode?: string | null; dateChecked?: string;
}): Promise<string> {
  const id = generateId()
  const t = now()
  await localDb.priceEntries.add({ id, productId, storeId: data.storeId, price: data.price, quantity: data.quantity, sizeValue: data.sizeValue, sizeUnit: data.sizeUnit, notes: data.notes ?? null, isSale: data.isSale ?? false, saleExpiresAt: data.saleExpiresAt ?? null, isOnline: data.isOnline ?? false, dateChecked: data.dateChecked ?? t, createdAt: t, updatedAt: t, deletedAt: null, _pendingSync: true })
  await refreshPendingCount(); scheduleSync()
  return id
}

export async function localUpdatePrice(id: string, data: Partial<LocalPriceEntry>): Promise<void> {
  await localDb.priceEntries.update(id, { ...data, updatedAt: now(), _pendingSync: true })
  await refreshPendingCount(); scheduleSync()
}

export async function localDeletePrice(id: string): Promise<void> {
  await localDb.priceEntries.update(id, { deletedAt: now(), updatedAt: now(), _pendingSync: true })
  await refreshPendingCount(); scheduleSync()
}

export async function localAddToShoppingList(groupId: string, quantity = 1): Promise<string> {
  const id = generateId()
  const t = now()
  await localDb.shoppingListItems.add({ id, groupId, quantity, notes: null, purchased: false, addedAt: t, updatedAt: t, deletedAt: null, _pendingSync: true })
  await refreshPendingCount(); scheduleSync()
  return id
}

export async function localDeleteShoppingListItem(id: string): Promise<void> {
  await localDb.shoppingListItems.update(id, { deletedAt: now(), updatedAt: now(), _pendingSync: true })
  await refreshPendingCount(); scheduleSync()
}

export async function localToggleShoppingListPurchased(id: string, purchased: boolean): Promise<void> {
  await localDb.shoppingListItems.update(id, { purchased, updatedAt: now(), _pendingSync: true })
  await refreshPendingCount(); scheduleSync()
}

export async function localUpdateShoppingListItem(id: string, data: Partial<LocalShoppingListItem>): Promise<void> {
  await localDb.shoppingListItems.update(id, { ...data, updatedAt: now(), _pendingSync: true })
  await refreshPendingCount(); scheduleSync()
}

export async function localAddStore(data: { name: string; color?: string; location?: string | null }): Promise<string> {
  const id = generateId()
  const t = now()
  await localDb.stores.add({ id, name: data.name, color: data.color ?? '#8b5cf6', location: data.location ?? null, createdAt: t, updatedAt: t, deletedAt: null, _pendingSync: true })
  await refreshPendingCount(); scheduleSync()
  return id
}

export async function localUpdateStore(id: string, data: Partial<LocalStore>): Promise<void> {
  await localDb.stores.update(id, { ...data, updatedAt: now(), _pendingSync: true })
  await refreshPendingCount(); scheduleSync()
}

export async function localDeleteStore(id: string): Promise<void> {
  await localDb.stores.update(id, { deletedAt: now(), updatedAt: now(), _pendingSync: true })
  await refreshPendingCount(); scheduleSync()
}

export async function localAddProductToGroup(groupId: string, productId: string): Promise<void> {
  const id = generateId()
  await localDb.groupProducts.add({ id, groupId, productId, createdAt: now(), _pendingSync: true })
  await refreshPendingCount(); scheduleSync()
}
