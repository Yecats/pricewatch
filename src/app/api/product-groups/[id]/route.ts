import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await req.json()
  const { name, category, notes } = body
  const updated = await db.productGroup.update({
    where: { id },
    data: {
      ...(typeof name === 'string' ? { name: name.trim() } : {}),
      ...(typeof category === 'string' ? { category: category.trim() || null } : {}),
      ...(typeof notes === 'string' ? { notes: notes.trim() || null } : {}),
    },
  })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  await db.productGroup.update({ where: { id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ ok: true })
}
