// Barcode lookup utility — calls free public barcode databases.
// Primary: OpenFoodFacts (https://world.openfoodfacts.org/data)
// Fallback: UPCitemdb trial (https://www.upcitemdb.com/wp/docs/main/development/getting-started)

export interface BarcodeLookupResult {
  barcode: string
  name: string
  brand?: string | null
  category?: string | null
  imageUrl?: string | null
  // Normalized size info — what's printed on the packaging
  sizeValue?: number | null
  sizeUnit?: string | null
  source: 'openfoodfacts' | 'upcitemdb' | 'manual'
}

/**
 * Parse a quantity string like "7.5 oz", "18 count", "500 ml", "1 gal", "16.9 fl oz"
 * into a numeric sizeValue + a recognized sizeUnit (oz/lb/g/kg/ml/L/fl_oz/gal/count/each/box/pack).
 * Returns null if it can't make sense of the string.
 */
export function parseQuantityString(raw: string): {
  sizeValue: number
  sizeUnit: string
} | null {
  if (!raw) return null
  // Normalize: collapse whitespace, lowercase
  const s = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!s) return null

  // Match patterns like "7.5 oz", "18 count", "16.9 fl oz", "1 gallon", "500ml"
  const m = s.match(/^(\d+(?:\.\d+)?)\s*([a-z\s]+)$/)
  if (!m) return null
  const value = parseFloat(m[1])
  let unit = m[2].trim()

  // Normalize common unit spellings to our internal names
  const aliases: Record<string, string> = {
    'oz': 'oz',
    'ounce': 'oz',
    'ounces': 'oz',
    'lb': 'lb',
    'lbs': 'lb',
    'pound': 'lb',
    'pounds': 'lb',
    'g': 'g',
    'gram': 'g',
    'grams': 'g',
    'kg': 'kg',
    'kilogram': 'kg',
    'kilograms': 'kg',
    'ml': 'ml',
    'milliliter': 'ml',
    'milliliters': 'ml',
    'millilitre': 'ml',
    'millilitres': 'ml',
    'l': 'L',
    'liter': 'L',
    'liters': 'L',
    'litre': 'L',
    'litres': 'L',
    'fl oz': 'fl_oz',
    'fl. oz.': 'fl_oz',
    'floz': 'fl_oz',
    'fluid ounce': 'fl_oz',
    'fluid ounces': 'fl_oz',
    'gal': 'gal',
    'gallon': 'gal',
    'gallons': 'gal',
    'count': 'count',
    'ct': 'count',
    'each': 'each',
    'ea': 'each',
    'box': 'box',
    'boxes': 'box',
    'pack': 'pack',
    'pk': 'pack',
  }
  const normalized = aliases[unit] ?? null
  if (!normalized) return null
  return { sizeValue: value, sizeUnit: normalized }
}

/**
 * Try to extract a sensible "quantity" string from an OpenFoodFacts product.
 * OpenFoodFacts exposes `quantity` (free text) and sometimes structured fields.
 */
function extractQuantityFromOFF(p: any): string | null {
  if (!p) return null
  if (typeof p.quantity === 'string' && p.quantity.trim()) return p.quantity.trim()
  // Sometimes the quantity is in the name (e.g. "Mac & Cheese 7.5 oz")
  if (typeof p.product_name === 'string') {
    const m = p.product_name.match(/(\d+(?:\.\d+)?)\s*(oz|ounce|lb|pound|g|gram|kg|ml|milliliter|l|liter|fl\.?\s*oz|fluid ounce|gal|gallon|count|ct|ea|each|box|pack|pk)\b/i)
    if (m) return `${m[1]} ${m[2]}`
  }
  return null
}

/** Map an OpenFoodFacts category string to a short category label.
 * Tries to map OFF's specific tags to our common grocery categories first.
 * Falls back to a cleaned-up version of the most-specific tag.
 */
function extractCategory(p: any): string | null {
  if (!p) return null
  const cats: string[] = Array.isArray(p.categories_tags)
    ? p.categories_tags
    : typeof p.categories === 'string'
    ? p.categories.split(',').map((s: string) => s.trim()).filter(Boolean)
    : []
  if (cats.length === 0) return null

  // Join all categories into a single lowercase string for matching
  const allCatsLower = cats.join(' ').toLowerCase()

  // Map common OpenFoodFacts tags to our standard categories
  const mappings: Array<{ test: RegExp; category: string }> = [
    { test: /dair(y|ies)/, category: 'Dairy' },
    { test: /milk|cheese|yogurt|butter|cream/, category: 'Dairy' },
    { test: /meat|beef|pork|chicken|poultry|sausage|bacon/, category: 'Meat' },
    { test: /fish|seafood|salmon|tuna|shrimp/, category: 'Seafood' },
    { test: /fruit|vegetable|produce|fresh/, category: 'Produce' },
    { test: /frozen/, category: 'Frozen' },
    { test: /bread|bakery|pastry|cake|cookie/, category: 'Bakery' },
    { test: /beverage|drink|soda|juice|tea|coffee|water/, category: 'Beverages' },
    { test: /snack|chip|candy|chocolate|popcorn/, category: 'Snacks' },
    { test: /sauce|condiment|ketchup|mustard|mayonnaise/, category: 'Condiments & Sauces' },
    { test: /spice|seasoning|herb/, category: 'Spices & Seasonings' },
    { test: /canned|jarred/, category: 'Canned Goods' },
    { test: /pasta|noodle|rice|grain|cereal/, category: 'Pasta & Grains' },
    { test: /breakfast|oatmeal|granola/, category: 'Cereal & Breakfast' },
    { test: /baking|flour|sugar|baking/, category: 'Baking' },
    { test: /deli|delicatessen/, category: 'Deli' },
    { test: /pantry|food|grocery|meal|dish|prepared/, category: 'Pantry' },
  ]

  for (const { test, category } of mappings) {
    if (test.test(allCatsLower)) {
      return category
    }
  }

  // Fallback: pick the most specific category (last in the chain), cleaned up
  const last = cats[cats.length - 1].replace(/^en:/, '')
  return last
    .split('-')
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

async function lookupOpenFoodFacts(barcode: string): Promise<BarcodeLookupResult | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,brands,quantity,image_url,image_front_url,image_front_small_url,categories,categories_tags,product_name_en,generic_name`,
      { headers: { Accept: 'application/json' } }
    )
    if (!res.ok) return null
    const data = await res.json()
    if (data.status !== 1 || !data.product) return null
    const p = data.product
    const name = p.product_name_en || p.product_name || p.generic_name
    if (!name) return null
    const brandStr = p.brands || null
    const brand = brandStr ? brandStr.split(',')[0].trim() : null
    const qStr = extractQuantityFromOFF(p)
    const parsed = qStr ? parseQuantityString(qStr) : null
    const imageUrl = p.image_front_url || p.image_front_small_url || p.image_url || null
    return {
      barcode,
      name,
      brand,
      category: extractCategory(p),
      imageUrl,
      sizeValue: parsed?.sizeValue ?? null,
      sizeUnit: parsed?.sizeUnit ?? null,
      source: 'openfoodfacts',
    }
  } catch {
    return null
  }
}

async function lookupUPCitemdb(barcode: string): Promise<BarcodeLookupResult | null> {
  try {
    // Trial endpoint — limited but no auth required
    const res = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`,
      { headers: { Accept: 'application/json' } }
    )
    if (!res.ok) return null
    const data = await res.json()
    if (!data || data.code !== 'OK' || !Array.isArray(data.items) || data.items.length === 0) {
      return null
    }
    const item = data.items[0]
    const name = item.title || item.description
    if (!name) return null
    const brand = item.brand || null
    const category = item.category || null
    const imageUrl = item.image || null
    const parsed = item.size ? parseQuantityString(item.size) : null
    return {
      barcode,
      name,
      brand,
      category,
      imageUrl,
      sizeValue: parsed?.sizeValue ?? null,
      sizeUnit: parsed?.sizeUnit ?? null,
      source: 'upcitemdb',
    }
  } catch {
    return null
  }
}

/**
 * Look up a barcode across multiple free databases. Returns the first hit.
 * Throws if both backends are unreachable.
 */
export async function lookupBarcode(barcode: string): Promise<BarcodeLookupResult | null> {
  const cleaned = barcode.replace(/\D/g, '')
  if (!cleaned) return null
  // Try OpenFoodFacts first (better for grocery items, has weights/sizes)
  const off = await lookupOpenFoodFacts(cleaned)
  if (off) return off
  // Fallback to UPCitemdb
  const upc = await lookupUPCitemdb(cleaned)
  if (upc) return upc
  return null
}
