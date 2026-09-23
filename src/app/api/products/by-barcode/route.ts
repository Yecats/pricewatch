import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/products/by-barcode?code=<digits>
// Returns the product with this barcode, or 404.
// Useful when adding a price entry for a scanned barcode to check if it
// already exists as a product before deciding to create a new product.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')?.trim() ?? ''
  if (!code) {
    return NextResponse.json({ error: 'Missing code parameter' }, { status: 400 })
  }
  const product = await db.product.findFirst({
    where: { barcode: code, deletedAt: null },
    include: {
      prices: {
        where: { deletedAt: null },
        include: { store: true },
        orderBy: { price: 'asc' },
        take: 5,
      },
    },
  })
  if (!product) {
    return NextResponse.json({ found: false }, { status: 404 })
  }
  return NextResponse.json({ found: true, product })
}
