import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { computePrice, isSaleExpired } from '@/lib/units'

// GET /api/products — returns all standalone products with their prices + group memberships
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() ?? ''

  const products = await db.product.findMany({
    where: { deletedAt: null, ...(q ? { OR: [{ name: { contains: q } }, { brand: { contains: q } }, { barcode: { contains: q } }] } : {}) },
    orderBy: { name: 'asc' },
    include: {
      prices: { where: { deletedAt: null }, include: { store: true } },
      groups: true,
    },
  })

  const result = products.map((p) => {
    const visiblePrices = p.prices
      .filter((pr) => !pr.isSale || !isSaleExpired(pr.saleExpiresAt))
      .map((pr) => ({
        id: pr.id, productId: pr.productId, storeId: pr.storeId,
        storeName: pr.store.name, storeColor: pr.store.color,
        storeLocation: pr.store.location,
        price: pr.price, quantity: pr.quantity, sizeValue: pr.sizeValue,
        sizeUnit: pr.sizeUnit, notes: pr.notes,
        isSale: pr.isSale === true, saleExpiresAt: pr.saleExpiresAt ?? null,
        isOnline: pr.isOnline ?? false,
        dateChecked: pr.dateChecked, createdAt: pr.createdAt,
        ...computePrice(pr),
      }))

    const allVals = visiblePrices.map((c) => c.pricePerBaseUnit)
    const best = visiblePrices.length ? [...visiblePrices].sort((a, b) => a.pricePerBaseUnit - b.pricePerBaseUnit)[0] : null

    return {
      id: p.id, name: p.name, brand: p.brand, barcode: p.barcode,
      imageUrl: p.imageUrl, category: p.category, notes: p.notes,
      createdAt: p.createdAt, updatedAt: p.updatedAt,
      prices: visiblePrices,
      bestPrice: best,
      lowestPricePerUnit: allVals.length ? Math.min(...allVals) : null,
      storeCount: new Set(visiblePrices.map((pr) => pr.storeId)).size,
      priceCount: visiblePrices.length,
      groupIds: p.groups.map((gp) => gp.groupId),
    }
  })

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, brand, barcode, imageUrl, category, notes, groupId } = body
    if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

    const product = await db.product.create({
      data: {
        name: name.trim(),
        brand: brand?.trim() || null,
        barcode: barcode?.trim() || null,
        imageUrl: imageUrl?.trim() || null,
        category: category?.trim() || null,
        notes: notes?.trim() || null,
      },
    })

    // If a groupId is provided, link the product to that group
    if (groupId && typeof groupId === 'string') {
      await db.groupProduct.create({ data: { groupId, productId: product.id } }).catch(() => {})
    }

    return NextResponse.json(product, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
