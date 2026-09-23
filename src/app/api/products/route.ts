import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { computePrice, isSaleExpired } from '@/lib/units'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() ?? ''
  const category = searchParams.get('category')?.trim() ?? ''

  const products = await db.product.findMany({
    where: {
      AND: [
        { deletedAt: null },
        q
          ? {
              OR: [
                { name: { contains: q } },
                { brand: { contains: q } },
                { category: { contains: q } },
              ],
            }
          : {},
        category ? { category: { contains: category } } : {},
      ],
    },
    orderBy: { name: 'asc' },
    include: {
      prices: {
        include: { store: true },
      },
    },
  })

  // Compute aggregate stats per product — expired sales and soft-deleted entries are hidden
  const result = products.map((p) => {
    const visiblePrices = p.prices.filter(
      (pr) => !pr.deletedAt && (!pr.isSale || !isSaleExpired(pr.saleExpiresAt))
    )

    const computed = visiblePrices.map((pr) => ({
      id: pr.id,
      storeId: pr.storeId,
      storeName: pr.store.name,
      storeColor: pr.store.color,
      storeLocation: pr.store.location,
      price: pr.price,
      quantity: pr.quantity,
      sizeValue: pr.sizeValue,
      sizeUnit: pr.sizeUnit,
      notes: pr.notes,
      isSale: pr.isSale === true,
      saleExpiresAt: pr.saleExpiresAt ?? null,
      isOnline: pr.isOnline === true,
      barcode: pr.barcode ?? null,
      dateChecked: pr.dateChecked,
      createdAt: pr.createdAt,
      ...computePrice(pr),
    }))

    // Find best value per category
    const byCategory: Record<string, typeof computed> = {}
    for (const c of computed) {
      const key = c.category
      if (!byCategory[key]) byCategory[key] = []
      byCategory[key].push(c)
    }

    const bestPerCategory: Record<string, (typeof computed)[number]> = {}
    for (const [cat, entries] of Object.entries(byCategory)) {
      bestPerCategory[cat] = entries.reduce((best, cur) =>
        cur.pricePerBaseUnit < best.pricePerBaseUnit ? cur : best
      )
    }

    const allPrices = computed.map((c) => c.pricePerBaseUnit)
    const lowestPricePerUnit = allPrices.length ? Math.min(...allPrices) : null
    const storeCount = new Set(visiblePrices.map((pr) => pr.storeId)).size

    return {
      ...p,
      prices: computed,
      bestPerCategory,
      lowestPricePerUnit,
      storeCount,
      priceCount: visiblePrices.length,
    }
  })

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, brand, category, notes, imageUrl, barcode } = body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Product name is required' }, { status: 400 })
    }

    // If a barcode is provided, check if a product with that barcode already exists
    // so we don't create duplicates. Returns the existing one with a 200 status.
    if (barcode && typeof barcode === 'string' && barcode.trim()) {
      const existing = await db.product.findFirst({
        where: { barcode: barcode.trim() },
      })
      if (existing) {
        return NextResponse.json(existing, { status: 200 })
      }
    }

    const product = await db.product.create({
      data: {
        name: name.trim(),
        brand: typeof brand === 'string' ? brand.trim() || null : null,
        category: typeof category === 'string' ? category.trim() || null : null,
        notes: typeof notes === 'string' ? notes.trim() || null : null,
        imageUrl: typeof imageUrl === 'string' ? imageUrl.trim() || null : null,
        barcode:
          typeof barcode === 'string' && barcode.trim()
            ? barcode.trim()
            : null,
      },
    })
    return NextResponse.json(product, { status: 201 })
  } catch (err) {
    console.error('Failed to create product:', err)
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 })
  }
}

