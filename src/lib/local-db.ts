// Local IndexedDB database for offline-first access on the phone PWA.
// Mirrors the server schema. All reads go through here; writes go here first
// (with a _pendingSync flag), then the sync manager pushes them to the server.

import Dexie, { type Table } from 'dexie'

// === Record types (mirror server schema + sync metadata) ===

export interface LocalStore {
  id: string
  name: string
  color: string
  location?: string | null
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
  _pendingSync?: boolean
}

export interface LocalProduct {
  id: string
  name: string
  category?: string | null
  brand?: string | null
  notes?: string | null
  imageUrl?: string | null
  barcode?: string | null
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
  _pendingSync?: boolean
}

export interface LocalPriceEntry {
  id: string
  productId: string
  storeId: string
  price: number
  quantity: number
  sizeValue: number
  sizeUnit: string
  notes?: string | null
  isSale: boolean
  saleExpiresAt?: string | null
  isOnline: boolean  // true = bought online (Amazon, manufacturer, etc.)
  barcode?: string | null
  dateChecked: string
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
  _pendingSync?: boolean
}

export interface LocalShoppingListItem {
  id: string
  productId: string
  quantity: number
  notes?: string | null
  purchased: boolean
  addedAt: string
  updatedAt: string
  deletedAt?: string | null
  _pendingSync?: boolean
}

export interface SyncMeta {
  key: string
  value: string
}

// === Dexie DB definition ===

class LocalDB extends Dexie {
  stores!: Table<LocalStore, string>
  products!: Table<LocalProduct, string>
  priceEntries!: Table<LocalPriceEntry, string>
  shoppingListItems!: Table<LocalShoppingListItem, string>
  syncMeta!: Table<SyncMeta, string>

  constructor() {
    super('pricewatch')

    this.version(1).stores({
      stores: 'id, name, updatedAt, deletedAt, _pendingSync',
      products: 'id, name, category, barcode, updatedAt, deletedAt, _pendingSync',
      priceEntries: 'id, productId, storeId, barcode, updatedAt, deletedAt, _pendingSync',
      shoppingListItems: 'id, productId, purchased, updatedAt, deletedAt, _pendingSync',
      syncMeta: 'key',
    })
  }
}

export const localDb = new LocalDB()

// === Generate a UUID-like ID for records created locally ===

export function generateId(): string {
  return 'c' + crypto.randomUUID().replace(/-/g, '').slice(0, 23)
}
