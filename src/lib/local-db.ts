// Local IndexedDB database for offline-first sync.
// Three-layer model: ProductGroup → Product → PriceEntry
// Products are standalone (not children of groups). They link to groups via GroupProduct.

import Dexie, { type Table } from 'dexie'

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

// A comparison group — e.g. "Mac & Cheese"
export interface LocalProductGroup {
  id: string
  name: string
  category?: string | null
  notes?: string | null
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
  _pendingSync?: boolean
}

// Junction: links a Product to a Group (many-to-many)
export interface LocalGroupProduct {
  id: string
  groupId: string
  productId: string
  createdAt: string
  _pendingSync?: boolean
  _pendingDelete?: boolean
}

// A physical product with a barcode — e.g. "Kraft Mac & Cheese 18-pack"
export interface LocalProduct {
  id: string
  name: string
  brand?: string | null
  barcode?: string | null
  imageUrl?: string | null
  category?: string | null
  notes?: string | null
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
  _pendingSync?: boolean
}

// A price entry at a specific store for a specific product
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
  isOnline: boolean
  dateChecked: string
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
  _pendingSync?: boolean
}

// Shopping list items are linked to groups
export interface LocalShoppingListItem {
  id: string
  groupId: string
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

class LocalDB extends Dexie {
  stores!: Table<LocalStore, string>
  productGroups!: Table<LocalProductGroup, string>
  groupProducts!: Table<LocalGroupProduct, string>
  products!: Table<LocalProduct, string>
  priceEntries!: Table<LocalPriceEntry, string>
  shoppingListItems!: Table<LocalShoppingListItem, string>
  syncMeta!: Table<SyncMeta, string>

  constructor() {
    super('pricewatch')

    this.version(3).stores({
      stores: 'id, name, updatedAt, deletedAt, _pendingSync',
      productGroups: 'id, name, category, updatedAt, deletedAt, _pendingSync',
      groupProducts: 'id, groupId, productId, _pendingSync',
      products: 'id, name, brand, barcode, category, updatedAt, deletedAt, _pendingSync',
      priceEntries: 'id, productId, storeId, updatedAt, deletedAt, _pendingSync',
      shoppingListItems: 'id, groupId, purchased, updatedAt, deletedAt, _pendingSync',
      syncMeta: 'key',
    })
  }
}

export const localDb = new LocalDB()

export function generateId(): string {
  return 'c' + crypto.randomUUID().replace(/-/g, '').slice(0, 23)
}
