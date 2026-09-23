import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// DELETE /api/shopping-list/clear?mode=purchased|all
// - mode=purchased (default): removes purchased items only (use after a trip)
// - mode=all: clears everything
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('mode') ?? 'purchased'

  try {
    if (mode === 'all') {
      await db.shoppingListItem.deleteMany({})
    } else {
      await db.shoppingListItem.deleteMany({ where: { purchased: true } })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Failed to clear shopping list:', err)
    return NextResponse.json(
      { error: 'Failed to clear shopping list' },
      { status: 500 }
    )
  }
}
