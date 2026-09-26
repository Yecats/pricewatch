import { db } from '@/lib/db'

async function main() {
  // Clear existing data
  await db.priceEntry.deleteMany()
  await db.product.deleteMany()
  await db.store.deleteMany()

  // Helper: get a date N days in the future
  const future = (days: number) => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    d.setHours(23, 59, 0, 0)
    return d
  }

  // Create stores — modern palette, no green for the default look
  const costco = await db.store.create({
    data: { name: 'Costco', color: '#8b5cf6', location: 'Local warehouse' },
  })
  const walmart = await db.store.create({
    data: { name: 'Walmart', color: '#ef4444' },
  })
  const target = await db.store.create({
    data: { name: 'Target', color: '#dc2626' },
  })
  const safeway = await db.store.create({
    data: { name: 'Safeway', color: '#f59e0b' },
  })
  const traderJoes = await db.store.create({
    data: { name: "Trader Joe's", color: '#06b6d4' },
  })

  // Create products (now just groups — no brand, no barcode, no imageUrl)
  const macAndCheese = await db.product.create({
    data: {
      name: 'Mac & Cheese',
      category: 'Pantry',
      notes: 'Family favorite — compare bulk vs single box',
    },
  })

  const milk = await db.product.create({
    data: {
      name: 'Whole Milk',
      category: 'Dairy',
    },
  })

  const eggs = await db.product.create({
    data: {
      name: 'Large Eggs',
      category: 'Dairy',
    },
  })

  const chicken = await db.product.create({
    data: {
      name: 'Boneless Skinless Chicken Breast',
      category: 'Meat',
    },
  })

  const oliveOil = await db.product.create({
    data: {
      name: 'Extra Virgin Olive Oil',
      category: 'Pantry',
    },
  })

  // Mac & Cheese prices
  await db.priceEntry.create({
    data: {
      productId: macAndCheese.id,
      storeId: costco.id,
      price: 24.99,
      quantity: 18,
      sizeValue: 7.5,
      sizeUnit: 'oz',
      brand: 'Kraft',
      notes: '18-count bulk box',
    },
  })
  await db.priceEntry.create({
    data: {
      productId: macAndCheese.id,
      storeId: walmart.id,
      price: 1.48,
      quantity: 1,
      sizeValue: 7.25,
      sizeUnit: 'oz',
      brand: 'Kraft',
    },
  })
  // Target sale — temporary deal, expires in 4 days
  await db.priceEntry.create({
    data: {
      productId: macAndCheese.id,
      storeId: target.id,
      price: 0.99,
      quantity: 1,
      sizeValue: 7.25,
      sizeUnit: 'oz',
      brand: 'Kraft',
      notes: 'Weekly ad',
      isSale: true,
      saleExpiresAt: future(4),
    },
  })
  await db.priceEntry.create({
    data: {
      productId: macAndCheese.id,
      storeId: safeway.id,
      price: 4.99,
      quantity: 5,
      sizeValue: 7.25,
      sizeUnit: 'oz',
      brand: 'Kraft',
      notes: '5-pack',
    },
  })

  // Milk prices
  await db.priceEntry.create({
    data: {
      productId: milk.id,
      storeId: costco.id,
      price: 4.99,
      quantity: 2,
      sizeValue: 1,
      sizeUnit: 'gal',
      brand: 'Kirkland',
    },
  })
  // Walmart sale on milk — expiring very soon (1 day)
  await db.priceEntry.create({
    data: {
      productId: milk.id,
      storeId: walmart.id,
      price: 2.50,
      quantity: 1,
      sizeValue: 1,
      sizeUnit: 'gal',
      brand: 'Great Value',
      notes: 'Weekend rollback',
      isSale: true,
      saleExpiresAt: future(1),
    },
  })
  await db.priceEntry.create({
    data: {
      productId: milk.id,
      storeId: safeway.id,
      price: 3.99,
      quantity: 1,
      sizeValue: 1,
      sizeUnit: 'gal',
      brand: 'Safeway',
    },
  })

  // Egg prices
  await db.priceEntry.create({
    data: {
      productId: eggs.id,
      storeId: costco.id,
      price: 8.99,
      quantity: 24,
      sizeValue: 1,
      sizeUnit: 'count',
      brand: 'Kirkland',
    },
  })
  await db.priceEntry.create({
    data: {
      productId: eggs.id,
      storeId: traderJoes.id,
      price: 4.49,
      quantity: 12,
      sizeValue: 1,
      sizeUnit: 'count',
      brand: "Trader Joe's",
    },
  })
  await db.priceEntry.create({
    data: {
      productId: eggs.id,
      storeId: walmart.id,
      price: 3.78,
      quantity: 12,
      sizeValue: 1,
      sizeUnit: 'count',
      brand: 'Great Value',
    },
  })

  // Chicken prices — Target has a 1-day sale
  await db.priceEntry.create({
    data: {
      productId: chicken.id,
      storeId: costco.id,
      price: 24.99,
      quantity: 6,
      sizeValue: 1,
      sizeUnit: 'lb',
      brand: 'Kirkland',
      notes: '6-pack, individually sealed',
    },
  })
  await db.priceEntry.create({
    data: {
      productId: chicken.id,
      storeId: walmart.id,
      price: 4.99,
      quantity: 1,
      sizeValue: 1,
      sizeUnit: 'lb',
      brand: 'Great Value',
    },
  })
  await db.priceEntry.create({
    data: {
      productId: chicken.id,
      storeId: target.id,
      price: 2.99,
      quantity: 1,
      sizeValue: 1,
      sizeUnit: 'lb',
      brand: 'Good & Gather',
      isSale: true,
      saleExpiresAt: future(0), // expires today — urgent
    },
  })
  await db.priceEntry.create({
    data: {
      productId: chicken.id,
      storeId: safeway.id,
      price: 5.49,
      quantity: 1,
      sizeValue: 1,
      sizeUnit: 'lb',
      brand: 'Safeway',
    },
  })

  // Olive Oil prices
  await db.priceEntry.create({
    data: {
      productId: oliveOil.id,
      storeId: costco.id,
      price: 19.99,
      quantity: 1,
      sizeValue: 1,
      sizeUnit: 'L',
      brand: 'California Olive Ranch',
      notes: 'Two-pack available separately',
    },
  })
  await db.priceEntry.create({
    data: {
      productId: oliveOil.id,
      storeId: walmart.id,
      price: 12.97,
      quantity: 1,
      sizeValue: 500,
      sizeUnit: 'ml',
      brand: 'California Olive Ranch',
    },
  })
  await db.priceEntry.create({
    data: {
      productId: oliveOil.id,
      storeId: traderJoes.id,
      price: 8.99,
      quantity: 1,
      sizeValue: 16.9,
      sizeUnit: 'fl_oz',
      brand: 'California Olive Ranch',
    },
  })

  console.log('✅ Seed complete (with sale prices)')
  const counts = {
    stores: await db.store.count(),
    products: await db.product.count(),
    prices: await db.priceEntry.count(),
    sales: await db.priceEntry.count({ where: { isSale: true } }),
  }
  console.log(counts)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
