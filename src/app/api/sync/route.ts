import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { computePrice, isSaleExpired } from '@/lib/units'

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
    productGroups?: SyncRecord[]
    groupProducts?: SyncRecord[]
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
    const whereClause = { updatedAt: { gt: lastSyncAt } }

    // === APPLY INCOMING (push from client → server) ===
    const applied = { stores: 0, productGroups: 0, groupProducts: 0, products: 0, priceEntries: 0, shoppingListItems: 0 }

    for (const r of incoming.stores ?? []) await upsert('store', r, {
      name: String(r.name ?? ''), color: String(r.color ?? '#8b5cf6'),
      location: r.location ? String(r.location) : null,
      updatedAt: new Date(r.updatedAt), deletedAt: r.deletedAt ? new Date(r.deletedAt) : null,
    }, applied, 'stores')

    for (const r of incoming.productGroups ?? []) await upsert('productGroup', r, {
      name: String(r.name ?? ''), category: r.category ? String(r.category) : null,
      notes: r.notes ? String(r.notes) : null,
      updatedAt: new Date(r.updatedAt), deletedAt: r.deletedAt ? new Date(r.deletedAt) : null,
    }, applied, 'productGroups')

    for (const r of incoming.groupProducts ?? []) {
      const existing = await db.groupProduct.findUnique({ where: { id: r.id } })
      if (!existing) {
        await db.groupProduct.create({ data: { id: r.id, groupId: String(r.groupId), productId: String(r.productId), createdAt: r.createdAt ? new Date(r.createdAt) : new Date() } }).catch(() => {})
        applied.groupProducts++
      }
    }

    for (const r of incoming.products ?? []) await upsert('product', r, {
      name: String(r.name ?? ''), brand: r.brand ? String(r.brand) : null,
      barcode: r.barcode ? String(r.barcode) : null, imageUrl: r.imageUrl ? String(r.imageUrl) : null,
      category: r.category ? String(r.category) : null, notes: r.notes ? String(r.notes) : null,
      updatedAt: new Date(r.updatedAt), deletedAt: r.deletedAt ? new Date(r.deletedAt) : null,
    }, applied, 'products')

    for (const r of incoming.priceEntries ?? []) await upsert('priceEntry', r, {
      productId: String(r.productId), storeId: String(r.storeId),
      price: Number(r.price ?? 0), quantity: Number(r.quantity ?? 1),
      sizeValue: Number(r.sizeValue ?? 1), sizeUnit: String(r.sizeUnit ?? 'count'),
      notes: r.notes ? String(r.notes) : null, isSale: Boolean(r.isSale),
      saleExpiresAt: r.saleExpiresAt ? new Date(r.saleExpiresAt) : null,
      isOnline: Boolean(r.isOnline ?? false), barcode: r.barcode ? String(r.barcode) : null,
      dateChecked: r.dateChecked ? new Date(r.dateChecked) : new Date(),
      updatedAt: new Date(r.updatedAt), deletedAt: r.deletedAt ? new Date(r.deletedAt) : null,
    }, applied, 'priceEntries')

    for (const r of incoming.shoppingListItems ?? []) await upsert('shoppingListItem', r, {
      groupId: String(r.groupId), quantity: Number(r.quantity ?? 1),
      notes: r.notes ? String(r.notes) : null, purchased: Boolean(r.purchased),
      addedAt: r.addedAt ? new Date(r.addedAt) : new Date(),
      updatedAt: new Date(r.updatedAt), deletedAt: r.deletedAt ? new Date(r.deletedAt) : null,
    }, applied, 'shoppingListItems')

    // === RETURN SERVER CHANGES SINCE lastSyncAt (pull to client) ===
    const [stores, productGroups, groupProducts, products, priceEntries, shoppingListItems] = await Promise.all([
      db.store.findMany({ where: whereClause }),
      db.productGroup.findMany({ where: whereClause }),
      db.groupProduct.findMany({ where: { createdAt: { gt: lastSyncAt } } }),
      db.product.findMany({ where: whereClause }),
      db.priceEntry.findMany({ where: whereClause }),
      db.shoppingListItem.findMany({ where: whereClause }),
    ])

    const visiblePriceEntries = priceEntries.filter((p) => !p.isSale || !isSaleExpired(p.saleExpiresAt))

    return NextResponse.json({
      serverTime: new Date().toISOString(),
      changes: { stores, productGroups, groupProducts, products, priceEntries: visiblePriceEntries, shoppingListItems },
      applied,
    })
  } catch (err) {
    console.error('Sync failed:', err)
    return NextResponse.json({ error: 'Sync failed', details: err instanceof Error ? err.message : 'Unknown' }, { status: 500 })
  }
}

async function upsert(model: string, record: SyncRecord, data: Record<string, unknown>, counts: Record<string, number>, key: string) {
  const existing = await (db as any)[model].findUnique({ where: { id: record.id } })
  const incomingUpdatedAt = new Date(record.updatedAt)
  if (existing && existing.updatedAt >= incomingUpdatedAt) return
  await (db as any)[model].upsert({
    where: { id: record.id },
    create: { id: record.id, ...data, createdAt: record.createdAt ? new Date(record.createdAt) : new Date() },
    update: data,
  })
  counts[key]++
}
