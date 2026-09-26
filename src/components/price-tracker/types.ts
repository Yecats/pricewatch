import { UnitCategory } from '@/lib/units'

export interface Store {
  id: string
  name: string
  color: string
  location?: string | null
  createdAt: string
  updatedAt: string
  _count?: { prices: number }
}

// A comparison group — e.g. "Mac & Cheese"
export interface ProductGroup {
  id: string
  name: string
  category?: string | null
  notes?: string | null
  createdAt: string
  updatedAt: string
  // Populated when loading with prices
  products?: GroupProduct[]
  // Aggregate stats
  bestPrice?: ComputedPrice | null
  lowestPricePerUnit?: number | null
  storeCount?: number
  productCount?: number
  priceCount?: number
  isOnShoppingList?: boolean
}

// A product within a group context (with its prices)
export interface GroupProduct {
  id: string
  productId: string
  name: string
  brand?: string | null
  imageUrl?: string | null
  barcode?: string | null
  category?: string | null
  notes?: string | null
  prices: ComputedPrice[]
  bestPrice?: ComputedPrice | null
  lowestPricePerUnit?: number | null
  storeCount?: number
  priceCount?: number
}

// A price entry with computed fields
export interface ComputedPrice {
  id: string
  storeId: string
  storeName: string
  storeColor: string
  storeLocation?: string | null
  productId: string
  price: number
  quantity: number
  sizeValue: number
  sizeUnit: string
  notes?: string | null
  isSale: boolean
  saleExpiresAt?: string | null
  isOnline?: boolean
  dateChecked: string
  createdAt?: string
  totalBaseUnits: number
  category: UnitCategory
  baseUnit: string
  pricePerBaseUnit: number
}

// A standalone product (Products tab view)
export interface Product {
  id: string
  name: string
  brand?: string | null
  barcode?: string | null
  imageUrl?: string | null
  category?: string | null
  notes?: string | null
  createdAt: string
  updatedAt: string
  // Populated when loading with prices
  prices?: ComputedPrice[]
  bestPrice?: ComputedPrice | null
  lowestPricePerUnit?: number | null
  storeCount?: number
  priceCount?: number
  // Which groups this product belongs to
  groupIds?: string[]
}
