import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { computePrice, isSaleExpired } from '@/lib/units'

// POST /api/sync
//
// Bidirectional sync between a client (phone PWA / web browser) and the server.
// The client sends its locally-pending changes + a "lastSyncAt" cursor.
// The server applies incoming changes (last-write-wins by updatedAt), then
// returns all records that changed since lastSyncAt.
//
// Request body:
//   {
//     lastSyncAt: string | null,   // ISO timestamp of last successful sync, or null for first sync
//     changes: {
//       stores: Store[],
//       products: Product[],
//       priceEntries: PriceEntry[],
//       shoppingListItems: ShoppingListItem[]
//     }
//   }
//
// Response:
//   {
//     serverTime: string,          // current server time (use as next lastSyncAt)
//     changes: {
//       stores: Store[],
//       products: Product[],
//       priceEntries: PriceEntry[],
//       shoppingListItems: ShoppingListItem[]
//     }
//   }

interface SyncRecord {
  id: string
  updatedAt: string
  deletedAt?: string | null
  [key: string]: unknown
}

interface SyncRequestBody {
  lastSyncAt: string | null
  changes: {
    stores?: SyncRecord[]
    products?: SyncRecord[]
    priceEntries?: SyncRecord[]
    shoppingListItems?: SyncRecord[]
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SyncRequestBody
    const lastSyncAt = body.lastSyncAt ? new Date(body.lastSyncAt) : new Date(0)

    const incoming = body.changes ?? {}

    // === APPLY INCOMING CHANGES (push from client → server) ===
    // For each record, check if the server version is older. If so, upsert.
    // Last-write-wins by updatedAt.

    const appliedCounts = {
      stores: 0,
      products: 0,
      priceEntries: 0,
      shoppingListItems: 0,
    }

    // Stores
    if (incoming.stores) {
      for (const record of incoming.stores) {
        await applyStoreChange(record, appliedCounts)
      }
    }

    // Products
    if (incoming.products) {
      for (const record of incoming.products) {
        await applyProductChange(record, appliedCounts)
      }
    }

    // Price entries
    if (incoming.priceEntries) {
      for (const record of incoming.priceEntries) {
        await applyPriceEntryChange(record, appliedCounts)
      }
    }

    // Shopping list items
    if (incoming.shoppingListItems) {
      for (const record of incoming.shoppingListItems) {
        await applyShoppingListItemChange(record, appliedCounts)
      }
    }

    // === RETURN SERVER CHANGES SINCE lastSyncAt (pull to client) ===
    const whereClause = { updatedAt: { gt: lastSyncAt } }

    const [stores, products, priceEntries, shoppingListItems] = await Promise.all([
      db.store.findMany({ where: whereClause }),
      db.product.findMany({ where: whereClause }),
      db.priceEntry.findMany({ where: whereClause }),
      db.shoppingListItem.findMany({ where: whereClause }),
    ])

    // Compute price-per-unit for price entries so the client doesn't have to
    const priceEntriesWithComputed = priceEntries.map((p) => ({
      ...p,
      ...computePrice(p),
    }))

    // Also send back expired-sale info so the client can filter them out
    const visiblePriceEntries = priceEntriesWithComputed.filter(
      (p) => !p.isSale || !isSaleExpired(p.saleExpiresAt)
    )

    return NextResponse.json({
      serverTime: new Date().toISOString(),
      changes: {
        stores,
        products,
        priceEntries: visiblePriceEntries,
        shoppingListItems,
      },
      applied: appliedCounts,
    })
  } catch (err) {
    console.error('Sync failed:', err)
    return NextResponse.json(
      { error: 'Sync failed', details: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// === Per-model apply functions ===

async function applyStoreChange(record: SyncRecord, counts: { stores: number }) {
  const existing = await db.store.findUnique({ where: { id: record.id } })
  const incomingUpdatedAt = new Date(record.updatedAt)

  if (existing && existing.updatedAt >= incomingUpdatedAt) {
    return // server is newer or equal — skip
  }

  const data = {
    name: String(record.name ?? ''),
    color: String(record.color ?? '#8b5cf6'),
    location: record.location ? String(record.location) : null,
    updatedAt: incomingUpdatedAt,
    deletedAt: record.deletedAt ? new Date(record.deletedAt) : null,
  }

  await db.store.upsert({
    where: { id: record.id },
    create: { id: record.id, ...data, createdAt: record.createdAt ? new Date(record.createdAt) : new Date() },
    update: data,
  })
  counts.stores++
}

async function applyProductChange(record: SyncRecord, counts: { products: number }) {
  const existing = await db.product.findUnique({ where: { id: record.id } })
  const incomingUpdatedAt = new Date(record.updatedAt)

  if (existing && existing.updatedAt >= incomingUpdatedAt) {
    return
  }

  // Product is now a group — no brand, imageUrl, or barcode
  const data = {
    name: String(record.name ?? ''),
    category: record.category ? String(record.category) : null,
    notes: record.notes ? String(record.notes) : null,
    updatedAt: incomingUpdatedAt,
    deletedAt: record.deletedAt ? new Date(record.deletedAt) : null,
  }

  await db.product.upsert({
    where: { id: record.id },
    create: { id: record.id, ...data, createdAt: record.createdAt ? new Date(record.createdAt) : new Date() },
    update: data,
  })
  counts.products++
}

async function applyPriceEntryChange(record: SyncRecord, counts: { priceEntries: number }) {
  const existing = await db.priceEntry.findUnique({ where: { id: record.id } })
  const incomingUpdatedAt = new Date(record.updatedAt)

  if (existing && existing.updatedAt >= incomingUpdatedAt) {
    return
  }

  const data = {
    productId: String(record.productId),
    storeId: String(record.storeId),
    price: Number(record.price ?? 0),
    quantity: Number(record.quantity ?? 1),
    sizeValue: Number(record.sizeValue ?? 1),
    sizeUnit: String(record.sizeUnit ?? 'count'),
    brand: record.brand ? String(record.brand) : null,
    imageUrl: record.imageUrl ? String(record.imageUrl) : null,
    notes: record.notes ? String(record.notes) : null,
    isSale: Boolean(record.isSale),
    saleExpiresAt: record.saleExpiresAt ? new Date(record.saleExpiresAt) : null,
    isOnline: Boolean(record.isOnline ?? false),
    barcode: record.barcode ? String(record.barcode) : null,
    dateChecked: record.dateChecked ? new Date(record.dateChecked) : new Date(),
    updatedAt: incomingUpdatedAt,
    deletedAt: record.deletedAt ? new Date(record.deletedAt) : null,
  }

  await db.priceEntry.upsert({
    where: { id: record.id },
    create: { id: record.id, ...data, createdAt: record.createdAt ? new Date(record.createdAt) : new Date() },
    update: data,
  })
  counts.priceEntries++
}

async function applyShoppingListItemChange(record: SyncRecord, counts: { shoppingListItems: number }) {
  const existing = await db.shoppingListItem.findUnique({ where: { id: record.id } })
  const incomingUpdatedAt = new Date(record.updatedAt)

  if (existing && existing.updatedAt >= incomingUpdatedAt) {
    return
  }

  const data = {
    productId: String(record.productId),
    quantity: Number(record.quantity ?? 1),
    notes: record.notes ? String(record.notes) : null,
    purchased: Boolean(record.purchased),
    addedAt: record.addedAt ? new Date(record.addedAt) : new Date(),
    updatedAt: incomingUpdatedAt,
    deletedAt: record.deletedAt ? new Date(record.deletedAt) : null,
  }

  await db.shoppingListItem.upsert({
    where: { id: record.id },
    create: { id: record.id, ...data },
    update: data,
  })
  counts.shoppingListItems++
}
