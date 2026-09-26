// Sync manager — bidirectional sync between local IndexedDB and server.
// Handles 6 tables: stores, productGroups, groupProducts, products, priceEntries, shoppingListItems

import { localDb, type LocalStore, type LocalProductGroup, type LocalGroupProduct, type LocalProduct, type LocalPriceEntry, type LocalShoppingListItem } from './local-db'

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error'

interface SyncState {
  status: SyncStatus
  lastSyncAt: string | null
  lastError: string | null
  pendingCount: number
  hadChanges: boolean
  syncCount: number
}

type SyncListener = (state: SyncState) => void

let currentState: SyncState = {
  status: 'idle', lastSyncAt: null, lastError: null, pendingCount: 0, hadChanges: false, syncCount: 0,
}

const listeners = new Set<SyncListener>()

function setState(patch: Partial<SyncState>) {
  currentState = { ...currentState, ...patch }
  listeners.forEach((l) => l(currentState))
}

export function getSyncState(): SyncState { return currentState }
export function subscribe(listener: SyncListener): () => void {
  listeners.add(listener); return () => listeners.delete(listener)
}

function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine
}

export async function refreshPendingCount(): Promise<number> {
  try {
    const [s, pg, gp, p, pe, sli] = await Promise.all([
      localDb.stores.toArray(), localDb.productGroups.toArray(), localDb.groupProducts.toArray(),
      localDb.products.toArray(), localDb.priceEntries.toArray(), localDb.shoppingListItems.toArray(),
    ])
    const total = [...s, ...pg, ...gp, ...p, ...pe, ...sli].filter((r: any) => r._pendingSync === true).length
    setState({ pendingCount: total })
    return total
  } catch { return 0 }
}

export async function sync(): Promise<void> {
  if (!isOnline()) { setState({ status: 'offline' }); return }
  setState({ status: 'syncing', lastError: null })

  try {
    const meta = await localDb.syncMeta.get('lastSyncAt')
    const lastSyncAt = meta?.value ?? null

    // Gather all pending records from all tables
    const [allStores, allGroups, allGroupProducts, allProducts, allPrices, allItems] = await Promise.all([
      localDb.stores.toArray(), localDb.productGroups.toArray(), localDb.groupProducts.toArray(),
      localDb.products.toArray(), localDb.priceEntries.toArray(), localDb.shoppingListItems.toArray(),
    ])

    const stripPending = (arr: any[]) => arr.filter((r) => r._pendingSync === true).map(({ _pendingSync, ...rest }) => rest)

    const changes = {
      stores: stripPending(allStores),
      productGroups: stripPending(allGroups),
      groupProducts: stripPending(allGroupProducts),
      products: stripPending(allProducts),
      priceEntries: stripPending(allPrices),
      shoppingListItems: stripPending(allItems),
    }

    const res = await fetch('/api/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastSyncAt, changes }),
    })

    if (!res.ok) throw new Error(`Server ${res.status}`)
    const data = await res.json()
    const sc = data.changes

    // Apply server changes to local DB
    await localDb.transaction('rw', [localDb.stores, localDb.productGroups, localDb.groupProducts, localDb.products, localDb.priceEntries, localDb.shoppingListItems], async () => {
      for (const s of sc.stores ?? []) await localDb.stores.put({ id: s.id, name: s.name, color: s.color, location: s.location, createdAt: s.createdAt, updatedAt: s.updatedAt, deletedAt: s.deletedAt ?? null, _pendingSync: false })
      for (const g of sc.productGroups ?? []) await localDb.productGroups.put({ id: g.id, name: g.name, category: g.category, notes: g.notes, createdAt: g.createdAt, updatedAt: g.updatedAt, deletedAt: g.deletedAt ?? null, _pendingSync: false })
      for (const gp of sc.groupProducts ?? []) await localDb.groupProducts.put({ id: gp.id, groupId: gp.groupId, productId: gp.productId, createdAt: gp.createdAt, _pendingSync: false })
      for (const p of sc.products ?? []) await localDb.products.put({ id: p.id, name: p.name, brand: p.brand, barcode: p.barcode, imageUrl: p.imageUrl, category: p.category, notes: p.notes, createdAt: p.createdAt, updatedAt: p.updatedAt, deletedAt: p.deletedAt ?? null, _pendingSync: false })
      for (const p of sc.priceEntries ?? []) await localDb.priceEntries.put({ id: p.id, productId: p.productId, storeId: p.storeId, price: p.price, quantity: p.quantity, sizeValue: p.sizeValue, sizeUnit: p.sizeUnit, notes: p.notes, isSale: p.isSale, saleExpiresAt: p.saleExpiresAt, isOnline: p.isOnline ?? false, dateChecked: p.dateChecked, createdAt: p.createdAt, updatedAt: p.updatedAt, deletedAt: p.deletedAt ?? null, _pendingSync: false })
      for (const i of sc.shoppingListItems ?? []) await localDb.shoppingListItems.put({ id: i.id, groupId: i.groupId, quantity: i.quantity, notes: i.notes, purchased: i.purchased, addedAt: i.addedAt, updatedAt: i.updatedAt, deletedAt: i.deletedAt ?? null, _pendingSync: false })

      // Clear pending flags on pushed records
      for (const r of [...changes.stores, ...changes.productGroups, ...changes.groupProducts, ...changes.products, ...changes.priceEntries, ...changes.shoppingListItems]) {
        const tables = [localDb.stores, localDb.productGroups, localDb.groupProducts, localDb.products, localDb.priceEntries, localDb.shoppingListItems]
        for (const t of tables) {
          const rec = await t.get(r.id)
          if (rec && rec.updatedAt === r.updatedAt) await t.update(r.id, { _pendingSync: false })
        }
      }
    })

    await localDb.syncMeta.put({ key: 'lastSyncAt', value: data.serverTime })
    await refreshPendingCount()

    const hadChanges = (sc.stores?.length ?? 0) + (sc.productGroups?.length ?? 0) + (sc.groupProducts?.length ?? 0) + (sc.products?.length ?? 0) + (sc.priceEntries?.length ?? 0) + (sc.shoppingListItems?.length ?? 0) + changes.stores.length + changes.productGroups.length + changes.groupProducts.length + changes.products.length + changes.priceEntries.length + changes.shoppingListItems.length > 0

    setState({ status: 'idle', lastSyncAt: data.serverTime, lastError: null, hadChanges, syncCount: hadChanges ? currentState.syncCount + 1 : currentState.syncCount })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sync failed'
    setState({ status: 'error', lastError: msg })
    console.error('[sync] failed:', msg)
  }
}

let syncTimer: ReturnType<typeof setTimeout> | null = null
export function scheduleSync(delayMs = 2000): void {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => { void sync(); syncTimer = null }, delayMs)
}

let initialized = false
export function initSync(): void {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  void sync()
  window.addEventListener('online', () => void sync())
  setInterval(() => { if (isOnline()) void sync() }, 60_000)
}
