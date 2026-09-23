// Unit conversion + price math
// Supports weight (oz, lb, g, kg), volume (ml, L, fl_oz, gal), and count units.

export type UnitCategory = 'weight' | 'volume' | 'count'

export const UNIT_CATEGORIES: Record<string, UnitCategory> = {
  oz: 'weight',
  lb: 'weight',
  g: 'weight',
  kg: 'weight',
  ml: 'volume',
  L: 'volume',
  fl_oz: 'volume',
  gal: 'volume',
  count: 'count',
  each: 'count',
  box: 'count',
  pack: 'count',
}

// Conversion factors to base unit per category
// weight -> oz, volume -> ml, count -> each
export const TO_BASE: Record<string, number> = {
  // weight (base: oz)
  oz: 1,
  lb: 16,
  g: 0.035274,
  kg: 35.274,
  // volume (base: ml)
  ml: 1,
  L: 1000,
  fl_oz: 29.5735,
  gal: 3785.41,
  // count (base: each)
  count: 1,
  each: 1,
  box: 1,
  pack: 1,
}

export const BASE_UNIT: Record<UnitCategory, string> = {
  weight: 'oz',
  volume: 'ml',
  count: 'each',
}

export const BASE_UNIT_LABEL: Record<UnitCategory, string> = {
  weight: 'oz',
  volume: 'ml',
  count: 'ea',
}

export const UNITS_BY_CATEGORY: Record<UnitCategory, string[]> = {
  weight: ['oz', 'lb', 'g', 'kg'],
  volume: ['ml', 'L', 'fl_oz', 'gal'],
  count: ['count', 'each', 'box', 'pack'],
}

export const UNIT_LABELS: Record<string, string> = {
  oz: 'oz',
  lb: 'lb',
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  L: 'L',
  fl_oz: 'fl oz',
  gal: 'gal',
  count: 'count',
  each: 'each',
  box: 'box',
  pack: 'pack',
}

export function getUnitCategory(unit: string): UnitCategory {
  return UNIT_CATEGORIES[unit] ?? 'count'
}

/** Convert a quantity of `unit` into the base unit for its category. */
export function toBaseUnit(value: number, unit: string): number {
  const factor = TO_BASE[unit] ?? 1
  return value * factor
}

export interface PriceEntryInput {
  price: number
  quantity: number
  sizeValue: number
  sizeUnit: string
}

export interface ComputedPrice extends PriceEntryInput {
  id?: string
  storeId?: string
  storeName?: string
  storeColor?: string
  notes?: string | null
  dateChecked?: Date | string
  // computed
  totalPrice?: number // price * quantity (if price is per-item)
  totalBaseUnits?: number // quantity * sizeValue (in base unit)
  category?: UnitCategory
  baseUnit?: string
  pricePerBaseUnit?: number
  displayPrice?: string
  displayPerUnit?: string
}

/**
 * Each price entry represents:
 *   price paid for `quantity` items, each item has size `sizeValue sizeUnit`.
 * Examples:
 *   - 1 box of 7.5 oz Mac & Cheese at $1.48 → price=1.48, quantity=1, sizeValue=7.5, sizeUnit='oz'
 *   - 18 boxes of 7.5 oz Mac & Cheese at $24.99 → price=24.99, quantity=18, sizeValue=7.5, sizeUnit='oz'
 *
 * Total weight = quantity * sizeValue (in sizeUnit), then converted to base unit (oz/ml/each).
 * Price per base unit = price / totalBaseUnits.
 */
export function computePrice(entry: PriceEntryInput): {
  totalBaseUnits: number
  category: UnitCategory
  baseUnit: string
  pricePerBaseUnit: number
} {
  const category = getUnitCategory(entry.sizeUnit)
  const baseUnit = BASE_UNIT[category]
  const perItemInBase = toBaseUnit(entry.sizeValue, entry.sizeUnit)
  const totalBaseUnits = perItemInBase * Math.max(entry.quantity, 0)
  const pricePerBaseUnit = totalBaseUnits > 0 ? entry.price / totalBaseUnits : 0

  return {
    totalBaseUnits,
    category,
    baseUnit,
    pricePerBaseUnit,
  }
}

export function formatCurrency(value: number): string {
  if (value === 0) return '$0.00'
  if (value < 0.01 && value > 0) return `$${value.toFixed(4)}`
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

export function formatNumber(value: number, maxDigits = 2): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: maxDigits,
  }).format(value)
}

export function formatSize(value: number, unit: string): string {
  const label = UNIT_LABELS[unit] ?? unit
  return `${formatNumber(value)} ${label}`
}

export function formatPricePerUnit(price: number, category: UnitCategory): string {
  const unitLabel = BASE_UNIT_LABEL[category]
  return `${formatCurrency(price)} / ${unitLabel}`
}

/**
 * Pick the most readable display unit for a given base-unit price.
 * - For very small weight values (< $0.10/oz), display $/lb instead.
 * - For very small volume values (< $0.01/ml), display $/L instead.
 */
export function formatPricePerUnitSmart(price: number, category: UnitCategory): {
  price: number
  unit: string
  label: string
  text: string
} {
  if (category === 'weight' && price < 0.1 && price > 0) {
    const perLb = price * 16
    return {
      price: perLb,
      unit: 'lb',
      label: 'lb',
      text: `${formatCurrency(perLb)} / lb`,
    }
  }
  if (category === 'volume' && price < 0.01 && price > 0) {
    const perL = price * 1000
    return {
      price: perL,
      unit: 'L',
      label: 'L',
      text: `${formatCurrency(perL)} / L`,
    }
  }
  return {
    price,
    unit: BASE_UNIT_LABEL[category],
    label: BASE_UNIT_LABEL[category],
    text: formatPricePerUnit(price, category),
  }
}

export function formatRelativeDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
  return `${Math.floor(diffDays / 365)}y ago`
}

/** Has a sale price expired? Returns true if saleExpiresAt is in the past. */
export function isSaleExpired(saleExpiresAt?: Date | string | null): boolean {
  if (!saleExpiresAt) return false
  const d = typeof saleExpiresAt === 'string' ? new Date(saleExpiresAt) : saleExpiresAt
  return d.getTime() <= Date.now()
}

/**
 * Returns a short human label for how long until a sale expires.
 * Examples: "expires today", "expires tomorrow", "expires in 3d", "expired".
 */
export function formatSaleCountdown(saleExpiresAt?: Date | string | null): string | null {
  if (!saleExpiresAt) return null
  const d = typeof saleExpiresAt === 'string' ? new Date(saleExpiresAt) : saleExpiresAt
  const diffMs = d.getTime() - Date.now()
  if (diffMs <= 0) return 'expired'

  const dayMs = 1000 * 60 * 60 * 24
  const diffDays = Math.floor(diffMs / dayMs)
  const remainingMs = diffMs - diffDays * dayMs
  const diffHours = Math.floor(remainingMs / (1000 * 60 * 60))

  if (diffDays === 0) {
    if (diffHours <= 0) return 'expires soon'
    if (diffHours === 1) return 'expires in 1h'
    return `expires in ${diffHours}h`
  }
  if (diffDays === 0 && diffHours === 0) return 'expires today'
  if (diffDays === 1) return 'expires tomorrow'
  if (diffDays < 7) return `expires in ${diffDays}d`
  if (diffDays < 30) return `expires in ${Math.floor(diffDays / 7)}w`
  return `expires in ${Math.floor(diffDays / 30)}mo`
}

/**
 * Returns a color severity for the countdown — closer to expiry = more urgent.
 * 'urgent' (red) for <1 day, 'warning' (amber) for 1-3 days, 'normal' otherwise.
 */
export function saleCountdownSeverity(saleExpiresAt?: Date | string | null): 'urgent' | 'warning' | 'normal' | 'expired' {
  if (!saleExpiresAt) return 'normal'
  const d = typeof saleExpiresAt === 'string' ? new Date(saleExpiresAt) : saleExpiresAt
  const diffMs = d.getTime() - Date.now()
  if (diffMs <= 0) return 'expired'
  const dayMs = 1000 * 60 * 60 * 24
  const diffDays = diffMs / dayMs
  if (diffDays < 1) return 'urgent'
  if (diffDays < 3) return 'warning'
  return 'normal'
}
