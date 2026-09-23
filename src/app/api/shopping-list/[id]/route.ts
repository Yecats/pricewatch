import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = await req.json()
    const { quantity, notes, purchased } = body

    const item = await db.shoppingListItem.update({
      where: { id },
      data: {
        ...(typeof quantity === 'number' && quantity > 0 ? { quantity } : {}),
        ...(typeof notes === 'string' ? { notes: notes.trim() || null } : {}),
        ...(typeof purchased === 'boolean' ? { purchased } : {}),
      },
    })
    return NextResponse.json(item)
  } catch (err) {
    console.error('Failed to update shopping list item:', err)
    return NextResponse.json(
      { error: 'Failed to update shopping list item' },
      { status: 500 }
    )
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    // Soft delete — set deletedAt so the sync layer can propagate the tombstone
    await db.shoppingListItem.update({ where: { id }, data: { deletedAt: new Date() } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Failed to delete shopping list item:', err)
    return NextResponse.json(
      { error: 'Failed to delete shopping list item' },
      { status: 500 }
    )
  }
}
