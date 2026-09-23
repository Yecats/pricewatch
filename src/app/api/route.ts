import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { computePrice, isSaleExpired } from '@/lib/units'

// GET /api/shopping-list
// Returns all unpurchased shopping list items, with prices for each product.
// The client uses `groupShoppingListByBestStore` to compute the best store grouping.
export async function GET() {
  const items = await db.shoppingListItem.findMany({
    where: { purchased: false, deletedAt: null },
    orderBy: { addedAt: 'desc' },
    include: {
      product: {
        where: { deletedAt: null },
        include: {
          prices: {
            where: { deletedAt: null },
            include: { store: true },
          },
        },
      },
    },
  })

  // Filter out expired sales + compute price per base unit
  const result = items.map((item) => {
    const visiblePrices = item.product.prices.filter(
      (p) => !p.isSale || !isSaleExpired(p.saleExpiresAt)
    )
    const prices = visiblePrices.map((p) => ({
      id: p.id,
      storeId: p.storeId,
      storeName: p.store.name,
      storeColor: p.store.color,
      price: p.price,
      quantity: p.quantity,
      sizeValue: p.sizeValue,
      sizeUnit: p.sizeUnit,
      isSale: p.isSale === true,
      saleExpiresAt: p.saleExpiresAt ?? null,
      dateChecked: p.dateChecked,
      ...computePrice(p),
    }))

    return {
      id: item.id,
      productId: item.productId,
      quantity: item.quantity,
      notes: item.notes,
      addedAt: item.addedAt,
      purchased: item.purchased,
      product: {
        id: item.product.id,
        name: item.product.name,
        brand: item.product.brand,
        category: item.product.category,
        imageUrl: item.product.imageUrl,
      },
      prices,
    }
  })

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { productId, quantity, notes } = body

    if (!productId || typeof productId !== 'string') {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 })
    }

    const product = await db.product.findUnique({ where: { id: productId } })
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // If the product is already on the shopping list (unpurchased), increment
    // the quantity rather than creating a duplicate.
    const existing = await db.shoppingListItem.findFirst({
      where: { productId, purchased: false },
    })
    if (existing) {
      const updated = await db.shoppingListItem.update({
        where: { id: existing.id },
        data: {
          quantity: existing.quantity + (typeof quantity === 'number' ? quantity : 1),
          notes:
            typeof notes === 'string' && notes.trim()
              ? notes.trim()
              : existing.notes,
        },
      })
      return NextResponse.json(updated)
    }

    const item = await db.shoppingListItem.create({
      data: {
        productId,
        quantity: typeof quantity === 'number' && quantity > 0 ? quantity : 1,
        notes: typeof notes === 'string' ? notes.trim() || null : null,
      },
    })
    return NextResponse.json(item, { status: 201 })
  } catch (err) {
    console.error('Failed to create shopping list item:', err)
    return NextResponse.json(
      { error: 'Failed to create shopping list item' },
      { status: 500 }
    )
  }
}
