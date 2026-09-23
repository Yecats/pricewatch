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
  notes?: string | null
  isSale: boolean
  saleExpiresAt?: string | null
  barcode?: string | null
  dateChecked: string
  createdAt?: string
  totalBaseUnits: number
  category: UnitCategory
  baseUnit: string
  pricePerBaseUnit: number
}

export interface Product {
  id: string
  name: string
  brand?: string | null
  category?: string | null
  notes?: string | null
  imageUrl?: string | null
  barcode?: string | null
  createdAt: string
  updatedAt: string
  prices: ComputedPrice[]
  byCategory?: Record<string, ComputedPrice[]>
  bestPerCategory?: Record<string, ComputedPrice | undefined>
  lowestPricePerUnit: number | null
  storeCount: number
  priceCount: number
}
