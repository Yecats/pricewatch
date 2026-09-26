import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/products/by-barcode?code=<digits>
// Returns the product (group) that has a price entry with this barcode, or 404.
// Since barcodes now live on PriceEntry (not Product), we search price entries.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')?.trim() ?? ''
  if (!code) {
    return NextResponse.json({ error: 'Missing code parameter' }, { status: 400 })
  }

  // Find a price entry with this barcode
  const priceEntry = await db.priceEntry.findFirst({
    where: { barcode: code, deletedAt: null },
    include: {
      product: true,
    },
  })

  if (!priceEntry || !priceEntry.product || priceEntry.product.deletedAt) {
    return NextResponse.json({ found: false }, { status: 404 })
  }

  // Return the product (group) with its prices
  const product = await db.product.findUnique({
    where: { id: priceEntry.productId },
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
