import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { computePrice, UNIT_CATEGORIES } from '@/lib/units'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: productId } = await ctx.params
    const body = await req.json()
    const { storeId, price, quantity, sizeValue, sizeUnit, notes, dateChecked, isSale, saleExpiresAt, isOnline, barcode } = body

    if (!storeId) return NextResponse.json({ error: 'Store required' }, { status: 400 })
    if (typeof price !== 'number' || price < 0) return NextResponse.json({ error: 'Invalid price' }, { status: 400 })
    if (typeof sizeUnit !== 'string' || !UNIT_CATEGORIES[sizeUnit]) return NextResponse.json({ error: 'Invalid unit' }, { status: 400 })

    const product = await db.product.findUnique({ where: { id: productId } })
    if (!product || product.deletedAt) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    const store = await db.store.findUnique({ where: { id: storeId } })
    if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

    const saleFlag = Boolean(isSale)
    let expiresAt: Date | null = null
    if (saleFlag) {
      expiresAt = saleExpiresAt ? new Date(saleExpiresAt) : (() => {
        const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(23, 59, 0, 0); return t
      })()
      if (isNaN(expiresAt.getTime())) return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    }

    const entry = await db.priceEntry.create({
      data: {
        productId, storeId, price, quantity: quantity ?? 1, sizeValue: sizeValue ?? 1,
        sizeUnit, notes: notes?.trim() || null, isSale: saleFlag, saleExpiresAt: expiresAt,
        isOnline: Boolean(isOnline ?? false),
        barcode: barcode?.trim() || null,
        dateChecked: dateChecked ? new Date(dateChecked) : new Date(),
      },
      include: { store: true },
    })

    return NextResponse.json({
      ...entry, storeName: entry.store.name, storeColor: entry.store.color,
      ...computePrice(entry),
    }, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
