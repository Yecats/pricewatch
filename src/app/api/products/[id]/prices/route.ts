import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { computePrice, UNIT_CATEGORIES } from '@/lib/units'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: productId } = await ctx.params
    const body = await req.json()
    const {
      storeId,
      price,
      quantity,
      sizeValue,
      sizeUnit,
      notes,
      dateChecked,
      isSale,
      saleExpiresAt,
      isOnline,
      barcode,
    } = body

    if (!storeId) {
      return NextResponse.json({ error: 'Store is required' }, { status: 400 })
    }
    if (typeof price !== 'number' || price < 0) {
      return NextResponse.json({ error: 'Price must be a positive number' }, { status: 400 })
    }
    if (typeof quantity !== 'number' || quantity < 0) {
      return NextResponse.json({ error: 'Quantity must be a positive number' }, { status: 400 })
    }
    if (typeof sizeValue !== 'number' || sizeValue < 0) {
      return NextResponse.json({ error: 'Size value must be a positive number' }, { status: 400 })
    }
    if (typeof sizeUnit !== 'string' || !UNIT_CATEGORIES[sizeUnit]) {
      return NextResponse.json({ error: 'Invalid size unit' }, { status: 400 })
    }

    // Verify product exists
    const product = await db.product.findUnique({ where: { id: productId } })
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }
    // Verify store exists
    const store = await db.store.findUnique({ where: { id: storeId } })
    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 })
    }

    // If marked as sale, require an expiration date
    const saleFlag = Boolean(isSale)
    let expiresAt: Date | null = null
    if (saleFlag) {
      if (saleExpiresAt) {
        expiresAt = new Date(saleExpiresAt)
        if (isNaN(expiresAt.getTime())) {
          return NextResponse.json({ error: 'Invalid sale expiration date' }, { status: 400 })
        }
      } else {
        // Default to end of next day
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        tomorrow.setHours(23, 59, 0, 0)
        expiresAt = tomorrow
      }
    }

    const entry = await db.priceEntry.create({
      data: {
        productId,
        storeId,
        price,
        quantity,
        sizeValue,
        sizeUnit,
        notes: typeof notes === 'string' ? notes.trim() || null : null,
        isSale: saleFlag,
        saleExpiresAt: expiresAt,
        isOnline: Boolean(isOnline ?? false),
        barcode:
          typeof barcode === 'string' && barcode.trim() ? barcode.trim() : null,
        dateChecked: dateChecked ? new Date(dateChecked) : new Date(),
      },
      include: { store: true },
    })

    return NextResponse.json({
      ...entry,
      storeName: entry.store.name,
      storeColor: entry.store.color,
      ...computePrice(entry),
    }, { status: 201 })
  } catch (err) {
    console.error('Failed to create price entry:', err)
    return NextResponse.json({ error: 'Failed to create price entry' }, { status: 500 })
  }
}
