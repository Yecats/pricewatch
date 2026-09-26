import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { computePrice, UNIT_CATEGORIES } from '@/lib/units'

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = await req.json()
    const { storeId, price, quantity, sizeValue, sizeUnit, notes, dateChecked, isSale, saleExpiresAt, isOnline, barcode } = body

    if (typeof price !== 'number' || price < 0) return NextResponse.json({ error: 'Invalid price' }, { status: 400 })
    if (typeof sizeUnit !== 'string' || !UNIT_CATEGORIES[sizeUnit]) return NextResponse.json({ error: 'Invalid unit' }, { status: 400 })

    const saleFlag = Boolean(isSale)
    let expiresAt: Date | null = null
    if (saleFlag) {
      expiresAt = saleExpiresAt ? new Date(saleExpiresAt) : (() => {
        const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(23, 59, 0, 0); return t
      })()
    }

    const entry = await db.priceEntry.update({
      where: { id },
      data: {
        ...(storeId ? { storeId } : {}),
        price, quantity, sizeValue, sizeUnit,
        notes: typeof notes === 'string' ? notes.trim() || null : undefined,
        isSale: saleFlag, saleExpiresAt: expiresAt,
        isOnline: typeof isOnline === 'boolean' ? isOnline : undefined,
        barcode: typeof barcode === 'string' ? barcode.trim() || null : undefined,
        dateChecked: dateChecked ? new Date(dateChecked) : undefined,
      },
      include: { store: true },
    })

    return NextResponse.json({
      ...entry, storeName: entry.store.name, storeColor: entry.store.color,
      ...computePrice(entry),
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  await db.priceEntry.update({ where: { id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ ok: true })
}
