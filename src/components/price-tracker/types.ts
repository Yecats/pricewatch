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

// ComputedPrice = a price entry variant with computed fields.
// Now includes brand, imageUrl, and barcode (moved from Product).
export interface ComputedPrice {
  id: string
  storeId: string
  storeName: string
  storeColor: string
  storeLocation?: string | null
  price: number
  quantity: number
  sizeValue: number
  sizeUnit: string
  brand?: string | null       // brand of THIS variant
  imageUrl?: string | null    // image of THIS variant
  notes?: string | null
  isSale: boolean
  saleExpiresAt?: string | null
  isOnline?: boolean
  barcode?: string | null
  dateChecked: string
  createdAt?: string
  totalBaseUnits: number
  category: UnitCategory
  baseUnit: string
  pricePerBaseUnit: number
}

// Product = a comparison GROUP. No brand, no barcode, no imageUrl.
// Those live on ComputedPrice (the variant).
export interface Product {
  id: string
  name: string                // group name, e.g. "Mac & Cheese"
  category?: string | null
  notes?: string | null       // group-level notes
  createdAt: string
  updatedAt: string
  prices: ComputedPrice[]
  byCategory?: Record<string, ComputedPrice[]>
  bestPerCategory?: Record<string, ComputedPrice | undefined>
  lowestPricePerUnit: number | null
  storeCount: number
  priceCount: number
}
