import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { computePrice, isSaleExpired } from '@/lib/units'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const product = await db.product.findUnique({
    where: { id },
    include: {
      prices: {
        include: { store: true },
        orderBy: { price: 'asc' },
      },
    },
  })
  if (!product || product.deletedAt) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Filter out expired sales and soft-deleted entries
  const visiblePrices = product.prices.filter(
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
    brand: pr.brand ?? null,
    imageUrl: pr.imageUrl ?? null,
    notes: pr.notes,
    isSale: pr.isSale === true,
    saleExpiresAt: pr.saleExpiresAt ?? null,
    isOnline: pr.isOnline === true,
    barcode: pr.barcode ?? null,
    dateChecked: pr.dateChecked,
    createdAt: pr.createdAt,
    ...computePrice(pr),
  }))

  // Group by category
  const byCategory: Record<string, typeof computed> = {}
  for (const c of computed) {
    const key = c.category
    if (!byCategory[key]) byCategory[key] = []
    byCategory[key].push(c)
  }
  // Sort each group by price per base unit ascending
  for (const k of Object.keys(byCategory)) {
    byCategory[k].sort((a, b) => a.pricePerBaseUnit - b.pricePerBaseUnit)
  }

  // Best per category
  const bestPerCategory: Record<string, (typeof computed)[number] | undefined> = {}
  for (const [cat, entries] of Object.entries(byCategory)) {
    bestPerCategory[cat] = entries[0]
  }

  const allPrices = computed.map((c) => c.pricePerBaseUnit)
  const lowestPricePerUnit = allPrices.length ? Math.min(...allPrices) : null
  const storeCount = new Set(visiblePrices.map((pr) => pr.storeId)).size

  return NextResponse.json({
    ...product,
    prices: computed,
    byCategory,
    bestPerCategory,
    lowestPricePerUnit,
    storeCount,
    priceCount: visiblePrices.length,
  })
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = await req.json()
    const { name, category, notes } = body

    const updated = await db.product.update({
      where: { id },
      data: {
        ...(typeof name === 'string' ? { name: name.trim() } : {}),
        ...(typeof category === 'string' ? { category: category.trim() || null } : {}),
        ...(typeof notes === 'string' ? { notes: notes.trim() || null } : {}),
      },
    })
    return NextResponse.json(updated)
  } catch (err) {
    console.error('Failed to update product:', err)
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    // Soft delete — set deletedAt so the sync layer can propagate the tombstone
    await db.product.update({ where: { id }, data: { deletedAt: new Date() } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Failed to delete product:', err)
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 })
  }
}
