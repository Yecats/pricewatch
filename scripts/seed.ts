import { db } from '@/lib/db'

async function main() {
  await db.priceEntry.deleteMany()
  await db.groupProduct.deleteMany()
  await db.product.deleteMany()
  await db.productGroup.deleteMany()
  await db.store.deleteMany()
  await db.shoppingListItem.deleteMany()

  const future = (days: number) => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    d.setHours(23, 59, 0, 0)
    return d
  }

  // Stores
  const costco = await db.store.create({ data: { name: 'Costco', color: '#8b5cf6', location: 'Local warehouse' } })
  const walmart = await db.store.create({ data: { name: 'Walmart', color: '#ef4444' } })
  const target = await db.store.create({ data: { name: 'Target', color: '#dc2626' } })
  const safeway = await db.store.create({ data: { name: 'Safeway', color: '#f59e0b' } })
  const traderJoes = await db.store.create({ data: { name: "Trader Joe's", color: '#06b6d4' } })

  // Products (standalone — barcode, brand, image on Product)
  const kraft18 = await db.product.create({
    data: { name: 'Mac & Cheese 18-Pack', brand: 'Kraft', barcode: '021000061001', category: 'Pantry' },
  })
  const kraftCups = await db.product.create({
    data: { name: 'Mac & Cheese Dinner Cups', brand: 'Kraft', barcode: '021000061002', category: 'Pantry' },
  })
  const gvMac = await db.product.create({
    data: { name: 'Macaroni & Cheese', brand: 'Great Value', barcode: '041196910345', category: 'Pantry' },
  })
  const kirklandMilk = await db.product.create({
    data: { name: 'Whole Milk 2-Pack', brand: 'Kirkland', barcode: '096619100001', category: 'Dairy' },
  })
  const gvMilk = await db.product.create({
    data: { name: 'Whole Milk', brand: 'Great Value', barcode: '078742100012', category: 'Dairy' },
  })
  const kirklandEggs = await db.product.create({
    data: { name: 'Large Eggs 24-Pack', brand: 'Kirkland', barcode: '096619200001', category: 'Dairy' },
  })
  const gvEggs = await db.product.create({
    data: { name: 'Large Eggs 12-Pack', brand: 'Great Value', barcode: '041313100045', category: 'Dairy' },
  })
  const kirklandChicken = await db.product.create({
    data: { name: 'Chicken Breast 6-Pack', brand: 'Kirkland', barcode: '096619300001', category: 'Meat' },
  })
  const gvChicken = await db.product.create({
    data: { name: 'Chicken Breast', brand: 'Great Value', barcode: '078742200012', category: 'Meat' },
  })
  const corOliveOil = await db.product.create({
    data: { name: 'Extra Virgin Olive Oil 1L', brand: 'California Olive Ranch', barcode: '851989005001', category: 'Pantry' },
  })

  // Groups
  const macGroup = await db.productGroup.create({ data: { name: 'Mac & Cheese', category: 'Pantry', notes: 'Family favorite' } })
  const milkGroup = await db.productGroup.create({ data: { name: 'Whole Milk', category: 'Dairy' } })
  const eggsGroup = await db.productGroup.create({ data: { name: 'Large Eggs', category: 'Dairy' } })
  const chickenGroup = await db.productGroup.create({ data: { name: 'Chicken Breast', category: 'Meat' } })
  const oliveOilGroup = await db.productGroup.create({ data: { name: 'Olive Oil', category: 'Pantry' } })

  // Link products to groups (many-to-many)
  await db.groupProduct.createMany({ data: [
    { groupId: macGroup.id, productId: kraft18.id },
    { groupId: macGroup.id, productId: kraftCups.id },
    { groupId: macGroup.id, productId: gvMac.id },
    { groupId: milkGroup.id, productId: kirklandMilk.id },
    { groupId: milkGroup.id, productId: gvMilk.id },
    { groupId: eggsGroup.id, productId: kirklandEggs.id },
    { groupId: eggsGroup.id, productId: gvEggs.id },
    { groupId: chickenGroup.id, productId: kirklandChicken.id },
    { groupId: chickenGroup.id, productId: gvChicken.id },
    { groupId: oliveOilGroup.id, productId: corOliveOil.id },
  ]})

  // Prices
  // Mac & Cheese — Kraft 18-pack
  await db.priceEntry.create({ data: { productId: kraft18.id, storeId: costco.id, price: 24.99, quantity: 18, sizeValue: 7.5, sizeUnit: 'oz', notes: '18-count bulk box' } })
  await db.priceEntry.create({ data: { productId: kraft18.id, storeId: walmart.id, price: 1.48, quantity: 1, sizeValue: 7.25, sizeUnit: 'oz' } })
  await db.priceEntry.create({ data: { productId: kraft18.id, storeId: target.id, price: 0.99, quantity: 1, sizeValue: 7.25, sizeUnit: 'oz', notes: 'Weekly ad', isSale: true, saleExpiresAt: future(4) } })
  await db.priceEntry.create({ data: { productId: kraft18.id, storeId: safeway.id, price: 4.99, quantity: 5, sizeValue: 7.25, sizeUnit: 'oz', notes: '5-pack' } })

  // Mac & Cheese — Kraft Dinner Cups
  await db.priceEntry.create({ data: { productId: kraftCups.id, storeId: costco.id, price: 12.99, quantity: 12, sizeValue: 2.05, sizeUnit: 'oz', notes: '12-count cups' } })

  // Mac & Cheese — Great Value
  await db.priceEntry.create({ data: { productId: gvMac.id, storeId: walmart.id, price: 0.68, quantity: 1, sizeValue: 7.25, sizeUnit: 'oz' } })

  // Milk — Kirkland
  await db.priceEntry.create({ data: { productId: kirklandMilk.id, storeId: costco.id, price: 4.99, quantity: 2, sizeValue: 1, sizeUnit: 'gal' } })
  await db.priceEntry.create({ data: { productId: gvMilk.id, storeId: walmart.id, price: 2.50, quantity: 1, sizeValue: 1, sizeUnit: 'gal', notes: 'Weekend rollback', isSale: true, saleExpiresAt: future(1) } })
  await db.priceEntry.create({ data: { productId: gvMilk.id, storeId: safeway.id, price: 3.99, quantity: 1, sizeValue: 1, sizeUnit: 'gal' } })

  // Eggs
  await db.priceEntry.create({ data: { productId: kirklandEggs.id, storeId: costco.id, price: 8.99, quantity: 24, sizeValue: 1, sizeUnit: 'count' } })
  await db.priceEntry.create({ data: { productId: gvEggs.id, storeId: traderJoes.id, price: 4.49, quantity: 12, sizeValue: 1, sizeUnit: 'count' } })
  await db.priceEntry.create({ data: { productId: gvEggs.id, storeId: walmart.id, price: 3.78, quantity: 12, sizeValue: 1, sizeUnit: 'count' } })

  // Chicken
  await db.priceEntry.create({ data: { productId: kirklandChicken.id, storeId: costco.id, price: 24.99, quantity: 6, sizeValue: 1, sizeUnit: 'lb', notes: '6-pack, individually sealed' } })
  await db.priceEntry.create({ data: { productId: gvChicken.id, storeId: walmart.id, price: 4.99, quantity: 1, sizeValue: 1, sizeUnit: 'lb' } })
  await db.priceEntry.create({ data: { productId: gvChicken.id, storeId: target.id, price: 2.99, quantity: 1, sizeValue: 1, sizeUnit: 'lb', isSale: true, saleExpiresAt: future(0) } })
  await db.priceEntry.create({ data: { productId: gvChicken.id, storeId: safeway.id, price: 5.49, quantity: 1, sizeValue: 1, sizeUnit: 'lb' } })

  // Olive Oil
  await db.priceEntry.create({ data: { productId: corOliveOil.id, storeId: costco.id, price: 19.99, quantity: 1, sizeValue: 1, sizeUnit: 'L' } })
  await db.priceEntry.create({ data: { productId: corOliveOil.id, storeId: walmart.id, price: 12.97, quantity: 1, sizeValue: 500, sizeUnit: 'ml' } })
  await db.priceEntry.create({ data: { productId: corOliveOil.id, storeId: traderJoes.id, price: 8.99, quantity: 1, sizeValue: 16.9, sizeUnit: 'fl_oz' } })

  console.log('✅ Seed complete (3-layer model)')
  console.log({
    stores: await db.store.count(),
    groups: await db.productGroup.count(),
    products: await db.product.count(),
    groupProducts: await db.groupProduct.count(),
    prices: await db.priceEntry.count(),
    sales: await db.priceEntry.count({ where: { isSale: true } }),
  })
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await db.$disconnect() })
