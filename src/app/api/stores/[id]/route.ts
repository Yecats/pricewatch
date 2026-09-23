import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const store = await db.store.findUnique({ where: { id } })
  if (!store) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(store)
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = await req.json()
    const { name, color, location } = body

    const store = await db.store.update({
      where: { id },
      data: {
        ...(typeof name === 'string' ? { name: name.trim() } : {}),
        ...(typeof color === 'string' ? { color } : {}),
        ...(location !== undefined ? { location: (location ?? '').trim() || null } : {}),
      },
    })
    return NextResponse.json(store)
  } catch (err) {
    console.error('Failed to update store:', err)
    return NextResponse.json({ error: 'Failed to update store' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    // Soft delete — set deletedAt so the sync layer can propagate the tombstone
    await db.store.update({ where: { id }, data: { deletedAt: new Date() } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Failed to delete store:', err)
    return NextResponse.json({ error: 'Failed to delete store' }, { status: 500 })
  }
}
