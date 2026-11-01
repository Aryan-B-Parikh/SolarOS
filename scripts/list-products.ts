import { db } from '../src/lib/db'

async function run() {
  const products = await db.product.findMany({
    include: {
      stockLevels: { include: { location: true } },
      _count: { select: { units: true } }
    },
    orderBy: { category: 'asc' }
  })
  console.log('TOTAL PRODUCTS:', products.length)
  for (const p of products) {
    const totalOnHand = p.stockLevels.reduce((acc, sl) => acc + sl.onHand, 0)
    const totalReserved = p.stockLevels.reduce((acc, sl) => acc + sl.reserved, 0)
    console.log(`[${p.sku}] ${p.name} | Cat: ${p.category} | Serialized: ${p.isSerialized} | onHand: ${totalOnHand} | reserved: ${totalReserved} | Units: ${p._count.units}`)
  }

  const unitsInStock = await db.inventoryUnit.count({ where: { status: 'IN_STOCK' } })
  const unitsInstalled = await db.inventoryUnit.count({ where: { status: 'INSTALLED' } })
  console.log(`Units IN_STOCK: ${unitsInStock}, INSTALLED: ${unitsInstalled}`)
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
