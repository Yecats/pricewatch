import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const stores = await db.store.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { prices: true } },
    },
  })
  return NextResponse.json(stores)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, color, location } = body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Store name is required' }, { status: 400 })
    }

    const store = await db.store.create({
      data: {
        name: name.trim(),
        color: typeof color === 'string' ? color : '#10b981',
        location: typeof location === 'string' ? location.trim() || null : null,
      },
    })
    return NextResponse.json(store, { status: 201 })
  } catch (err) {
    console.error('Failed to create store:', err)
    return NextResponse.json({ error: 'Failed to create store' }, { status: 500 })
  }
}
