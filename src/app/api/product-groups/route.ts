import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { computePrice, isSaleExpired } from '@/lib/units'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() ?? ''

  const groups = await db.productGroup.findMany({
    where: { deletedAt: null, ...(q ? { name: { contains: q } } : {}) },
    orderBy: { name: 'asc' },
    include: {
      products: {
        include: {
          product: {
            include: {
              prices: { where: { deletedAt: null }, include: { store: true } },
            },
          },
        },
      },
    },
  })

  const result = groups.map((g) => {
    const allPrices: any[] = []
    const products = g.products.map((gp) => {
      const visiblePrices = gp.product.prices
        .filter((p) => !p.isSale || !isSaleExpired(p.saleExpiresAt))
        .map((p) => ({
          id: p.id, productId: p.productId, storeId: p.storeId,
          storeName: p.store.name, storeColor: p.store.color,
          storeLocation: p.store.location,
          price: p.price, quantity: p.quantity, sizeValue: p.sizeValue,
          sizeUnit: p.sizeUnit, notes: p.notes,
          isSale: p.isSale === true, saleExpiresAt: p.saleExpiresAt ?? null,
          isOnline: p.isOnline ?? false,
          dateChecked: p.dateChecked, createdAt: p.createdAt,
          ...computePrice(p),
        }))
      allPrices.push(...visiblePrices)
      const prices = visiblePrices.map((c) => c.pricePerBaseUnit)
      return {
        id: gp.id, productId: gp.product.id,
        name: gp.product.name, brand: gp.product.brand,
        barcode: gp.product.barcode, imageUrl: gp.product.imageUrl,
        category: gp.product.category, notes: gp.product.notes,
        prices: visiblePrices,
        bestPrice: visiblePrices.length ? [...visiblePrices].sort((a, b) => a.pricePerBaseUnit - b.pricePerBaseUnit)[0] : null,
        lowestPricePerUnit: prices.length ? Math.min(...prices) : null,
        storeCount: new Set(visiblePrices.map((p) => p.storeId)).size,
        priceCount: visiblePrices.length,
      }
    })
    const allVals = allPrices.map((c) => c.pricePerBaseUnit)
    return {
      id: g.id, name: g.name, category: g.category, notes: g.notes,
      createdAt: g.createdAt, updatedAt: g.updatedAt,
      products,
      lowestPricePerUnit: allVals.length ? Math.min(...allVals) : null,
      storeCount: new Set(allPrices.map((p) => p.storeId)).size,
      productCount: products.length,
      priceCount: allPrices.length,
    }
  })

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, category, notes, productIds } = body
    if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

    const group = await db.productGroup.create({
      data: { name: name.trim(), category: category?.trim() || null, notes: notes?.trim() || null },
    })

    if (Array.isArray(productIds)) {
      for (const pid of productIds) {
        await db.groupProduct.create({ data: { groupId: group.id, productId: pid } }).catch(() => {})
      }
    }

    return NextResponse.json(group, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
