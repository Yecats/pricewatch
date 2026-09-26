// Sync manager — bidirectional sync between local IndexedDB and the server.
//
// Architecture:
//   1. PULL: GET changes from server since lastSyncAt → upsert into local DB
//   2. PUSH: send all local records with _pendingSync=true → server applies them
//   3. After successful push, mark local records as _pendingSync=false
//
// Sync triggers:
//   - On app open (initial sync)
//   - After any local write (debounced)
//   - When network comes back online (navigator.onLine event)
//   - Periodically (every 60 seconds while online)
//
// Conflict resolution: last-write-wins by updatedAt. If both client and server
// modified the same record, the one with the later updatedAt wins.

import { localDb, type LocalStore, type LocalProduct, type LocalPriceEntry, type LocalShoppingListItem } from './local-db'

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error'

interface SyncState {
  status: SyncStatus
  lastSyncAt: string | null
  lastError: string | null
  pendingCount: number  // number of local changes not yet pushed
  hadChanges: boolean  // true if the last sync actually pulled/pushed changes
  syncCount: number  // increments on every sync that had changes (use as a dependency)
}

type SyncListener = (state: SyncState) => void

let currentState: SyncState = {
  status: 'idle',
  lastSyncAt: null,
  lastError: null,
  pendingCount: 0,
  hadChanges: false,
  syncCount: 0,
}

const listeners = new Set<SyncListener>()

function setState(patch: Partial<SyncState>) {
  currentState = { ...currentState, ...patch }
  listeners.forEach((l) => l(currentState))
}

export function getSyncState(): SyncState {
  return currentState
}

export function subscribe(listener: SyncListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// === Detect server reachability ===

function getServerBaseUrl(): string {
  // In dev/production on the same origin, just use relative URLs.
  // If the phone is pointing at a different server (e.g. LAN IP), set this
  // in localStorage before the app loads.
  if (typeof window === 'undefined') return ''
  const stored = window.localStorage.getItem('pricewatch.serverUrl')
  return stored ?? ''
}

function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine
}

// === Count pending changes (for the status indicator) ===

export async function refreshPendingCount(): Promise<number> {
  try {
    const [allStores, allProducts, allPrices, allItems] = await Promise.all([
      localDb.stores.toArray().catch(() => [] as LocalStore[]),
      localDb.products.toArray().catch(() => [] as LocalProduct[]),
      localDb.priceEntries.toArray().catch(() => [] as LocalPriceEntry[]),
      localDb.shoppingListItems.toArray().catch(() => [] as LocalShoppingListItem[]),
    ])
    const total =
      allStores.filter((r) => r._pendingSync === true).length +
      allProducts.filter((r) => r._pendingSync === true).length +
      allPrices.filter((r) => r._pendingSync === true).length +
      allItems.filter((r) => r._pendingSync === true).length
    setState({ pendingCount: total })
    return total
  } catch {
    return 0
  }
}

// === The core sync operation ===

export async function sync(): Promise<void> {
  if (!isOnline()) {
    setState({ status: 'offline' })
    return
  }

  setState({ status: 'syncing', lastError: null })

  try {
    // Read last sync cursor from local DB
    const meta = await localDb.syncMeta.get('lastSyncAt')
    const lastSyncAt = meta?.value ?? null

    // === Gather pending changes to push ===
    // Use filter() instead of where().equals() because _pendingSync is a boolean
    // and IndexedDB's querying of booleans is inconsistent across browsers.
    const [allStores, allProducts, allPrices, allItems] = await Promise.all([
      localDb.stores.toArray().catch(() => [] as LocalStore[]),
      localDb.products.toArray().catch(() => [] as LocalProduct[]),
      localDb.priceEntries.toArray().catch(() => [] as LocalPriceEntry[]),
      localDb.shoppingListItems.toArray().catch(() => [] as LocalShoppingListItem[]),
    ])
    const pendingStores = allStores.filter((r) => r._pendingSync === true)
    const pendingProducts = allProducts.filter((r) => r._pendingSync === true)
    const pendingPrices = allPrices.filter((r) => r._pendingSync === true)
    const pendingItems = allItems.filter((r) => r._pendingSync === true)

    const changes = {
      stores: pendingStores.map(({ _pendingSync, ...rest }) => rest),
      products: pendingProducts.map(({ _pendingSync, ...rest }) => rest),
      priceEntries: pendingPrices.map(({ _pendingSync, ...rest }) => rest),
      shoppingListItems: pendingItems.map(({ _pendingSync, ...rest }) => rest),
    }

    // === Send to server ===
    const baseUrl = getServerBaseUrl()
    const res = await fetch(`${baseUrl}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastSyncAt, changes }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error')
      throw new Error(`Server responded ${res.status}: ${text}`)
    }

    const data = await res.json()
    const serverTime: string = data.serverTime
    const serverChanges = data.changes

    // === Apply server changes to local DB (PULL) ===
    // Use a transaction so we don't end up in a half-synced state
    await localDb.transaction('rw', [localDb.stores, localDb.products, localDb.priceEntries, localDb.shoppingListItems], async () => {
      // Upsert stores
      for (const s of serverChanges.stores ?? []) {
        await localDb.stores.put({
          id: s.id,
          name: s.name,
          color: s.color,
          location: s.location,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          deletedAt: s.deletedAt ?? null,
          _pendingSync: false,
        })
      }

      // Upsert products (now just group name + category + notes, no brand/imageUrl/barcode)
      for (const p of serverChanges.products ?? []) {
        await localDb.products.put({
          id: p.id,
          name: p.name,
          category: p.category,
          notes: p.notes,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          deletedAt: p.deletedAt ?? null,
          _pendingSync: false,
        })
      }

      // Upsert price entries (now includes brand, imageUrl)
      for (const p of serverChanges.priceEntries ?? []) {
        await localDb.priceEntries.put({
          id: p.id,
          productId: p.productId,
          storeId: p.storeId,
          price: p.price,
          quantity: p.quantity,
          sizeValue: p.sizeValue,
          sizeUnit: p.sizeUnit,
          brand: p.brand ?? null,
          imageUrl: p.imageUrl ?? null,
          notes: p.notes,
          isSale: p.isSale,
          saleExpiresAt: p.saleExpiresAt,
          isOnline: p.isOnline ?? false,
          barcode: p.barcode,
          dateChecked: p.dateChecked,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          deletedAt: p.deletedAt ?? null,
          _pendingSync: false,
        })
      }

      // Upsert shopping list items
      for (const i of serverChanges.shoppingListItems ?? []) {
        await localDb.shoppingListItems.put({
          id: i.id,
          productId: i.productId,
          quantity: i.quantity,
          notes: i.notes,
          purchased: i.purchased,
          addedAt: i.addedAt,
          updatedAt: i.updatedAt,
          deletedAt: i.deletedAt ?? null,
          _pendingSync: false,
        })
      }

      // === Mark pushed records as synced ===
      // Only clear _pendingSync if the server didn't send back a newer version
      // of the same record (which would mean the server had a newer change).
      for (const record of [...pendingStores, ...pendingProducts, ...pendingPrices, ...pendingItems]) {
        // Re-read from DB to see if the pull updated this record
        const storeRec = await localDb.stores.get(record.id)
        const productRec = await localDb.products.get(record.id)
        const priceRec = await localDb.priceEntries.get(record.id)
        const itemRec = await localDb.shoppingListItems.get(record.id)
        const current = storeRec ?? productRec ?? priceRec ?? itemRec
        if (current && current.updatedAt === record.updatedAt) {
          // Server didn't override our version — safe to clear pending flag
          if (storeRec) await localDb.stores.update(record.id, { _pendingSync: false })
          if (productRec) await localDb.products.update(record.id, { _pendingSync: false })
          if (priceRec) await localDb.priceEntries.update(record.id, { _pendingSync: false })
          if (itemRec) await localDb.shoppingListItems.update(record.id, { _pendingSync: false })
        }
      }
    })

    // Save the sync cursor
    await localDb.syncMeta.put({ key: 'lastSyncAt', value: serverTime })

    await refreshPendingCount()

    // Determine if this sync actually had any changes (pulled or pushed)
    const hadChanges =
      (serverChanges.stores?.length ?? 0) > 0 ||
      (serverChanges.products?.length ?? 0) > 0 ||
      (serverChanges.priceEntries?.length ?? 0) > 0 ||
      (serverChanges.shoppingListItems?.length ?? 0) > 0 ||
      pendingStores.length > 0 ||
      pendingProducts.length > 0 ||
      pendingPrices.length > 0 ||
      pendingItems.length > 0

    setState({
      status: 'idle',
      lastSyncAt: serverTime,
      lastError: null,
      hadChanges,
      // Only increment syncCount if there were actual changes — this is what
      // the page listens to so it knows when to reload local data
      syncCount: hadChanges ? currentState.syncCount + 1 : currentState.syncCount,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sync failed'
    setState({ status: 'error', lastError: msg })
    // Don't rethrow — sync failures are recoverable, we'll retry on the next trigger
    console.error('[sync] failed:', msg)
  }
}

// === Debounced sync — call after local writes ===

let syncTimer: ReturnType<typeof setTimeout> | null = null
export function scheduleSync(delayMs = 2000): void {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    void sync()
    syncTimer = null
  }, delayMs)
}

// === Initialize — call on app startup ===

let initialized = false
export function initSync(): void {
  if (initialized) return
  if (typeof window === 'undefined') return
  initialized = true

  // Initial sync on load
  void sync()

  // Sync when network comes back online
  window.addEventListener('online', () => {
    void sync()
  })

  // Periodic sync while online (catches server-side changes from other devices)
  setInterval(() => {
    if (isOnline()) void sync()
  }, 60_000)  // every 60 seconds
}

// === Query helpers — read from local DB, filtering out deleted records ===

export async function getActiveStores(): Promise<LocalStore[]> {
  const all = await localDb.stores.toArray()
  return all.filter((s) => !s.deletedAt).sort((a, b) => a.name.localeCompare(b.name))
}

export async function getActiveProducts(): Promise<LocalProduct[]> {
  const all = await localDb.products.toArray()
  return all.filter((p) => !p.deletedAt).sort((a, b) => a.name.localeCompare(b.name))
}

export async function getActivePriceEntries(productId: string): Promise<LocalPriceEntry[]> {
  const all = await localDb.priceEntries.where('productId').equals(productId).toArray()
  return all.filter((p) => !p.deletedAt)
}

export async function getActiveShoppingListItems(): Promise<LocalShoppingListItem[]> {
  const all = await localDb.shoppingListItems.toArray()
  return all.filter((i) => !i.deletedAt && !i.purchased).sort((a, b) => {
    return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
  })
}
