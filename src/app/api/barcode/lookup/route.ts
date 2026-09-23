import { NextRequest, NextResponse } from 'next/server'
import { lookupBarcode } from '@/lib/barcode'

// GET /api/barcode/lookup?code=<digits>
// Server-side proxy for OpenFoodFacts / UPCitemdb. Useful if the client is offline
// or to avoid any CORS surprises. Returns the lookup result or 404.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')?.trim() ?? ''
  if (!/^\d{6,14}$/.test(code)) {
    return NextResponse.json(
      { error: 'Invalid barcode — must be 6 to 14 digits.' },
      { status: 400 }
    )
  }
  try {
    const result = await lookupBarcode(code)
    if (!result) {
      return NextResponse.json(
        { error: 'Product not found in any database', code },
        { status: 404 }
      )
    }
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Lookup failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
