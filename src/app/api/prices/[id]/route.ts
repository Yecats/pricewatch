import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { computePrice, UNIT_CATEGORIES } from '@/lib/units'

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = await req.json()
    const {
      storeId,
      price,
      quantity,
      sizeValue,
      sizeUnit,
      brand,
      imageUrl,
      notes,
      dateChecked,
      isSale,
      saleExpiresAt,
      isOnline,
      barcode,
    } = body

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

    const saleFlag = Boolean(isSale)
    let expiresAt: Date | null = null
    if (saleFlag) {
      if (saleExpiresAt) {
        expiresAt = new Date(saleExpiresAt)
        if (isNaN(expiresAt.getTime())) {
          return NextResponse.json({ error: 'Invalid sale expiration date' }, { status: 400 })
        }
      } else {
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        tomorrow.setHours(23, 59, 0, 0)
        expiresAt = tomorrow
      }
    }

    const entry = await db.priceEntry.update({
      where: { id },
      data: {
        ...(storeId ? { storeId } : {}),
        price,
        quantity,
        sizeValue,
        sizeUnit,
        brand: typeof brand === 'string' ? brand.trim() || null : undefined,
        imageUrl: typeof imageUrl === 'string' ? imageUrl.trim() || null : undefined,
        notes: typeof notes === 'string' ? notes.trim() || null : undefined,
        isSale: saleFlag,
        saleExpiresAt: expiresAt,
        isOnline: typeof isOnline === 'boolean' ? isOnline : undefined,
        barcode:
          typeof barcode === 'string'
            ? barcode.trim() || null
            : undefined,
        dateChecked: dateChecked ? new Date(dateChecked) : undefined,
      },
      include: { store: true },
    })

    return NextResponse.json({
      ...entry,
      storeName: entry.store.name,
      storeColor: entry.store.color,
      ...computePrice(entry),
    })
  } catch (err) {
    console.error('Failed to update price entry:', err)
    return NextResponse.json({ error: 'Failed to update price entry' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    // Soft delete — set deletedAt so the sync layer can propagate the tombstone
    await db.priceEntry.update({ where: { id }, data: { deletedAt: new Date() } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Failed to delete price entry:', err)
    return NextResponse.json({ error: 'Failed to delete price entry' }, { status: 500 })
  }
}
