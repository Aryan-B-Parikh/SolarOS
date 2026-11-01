import { db } from '../src/lib/db'
import { randomBytes } from 'crypto'

const R = (rupees: number) => Math.round(rupees * 100)
const iso = (d: Date) => d.toISOString().slice(0, 10)

function randHex(bytes: number): string {
  return randomBytes(bytes).toString('hex').toUpperCase()
}

interface NewProductDef {
  sku: string
  name: string
  category: string
  brand: string
  model: string
  uom: string
  isSerialized: boolean
  warrantyMonths: number
  ratedPowerW?: number
  cost: number
  price: number
  reorder: number
  taxBp: number
  hsnCode?: string
  monitoringUrl?: string
  stockOnHand: number
  serialPrefix?: string
  qrPrefix?: string
}

const NEW_PRODUCTS: NewProductDef[] = [
  // ── Solar Panels ──────────────────────────────────────────────
  {
    sku: 'PNL-550-BI',
    name: 'Bifacial solar panel 550 Wp glass-glass',
    category: 'PANEL',
    brand: 'Adani Solar',
    model: 'ASM-550-BIFI',
    uom: 'NOS',
    isSerialized: true,
    warrantyMonths: 300, // 25 years
    ratedPowerW: 550,
    cost: 14000,
    price: 17500,
    reorder: 24,
    taxBp: 1200,
    hsnCode: '85414300',
    stockOnHand: 250,
    serialPrefix: 'PNL550-BIFI-26A',
    qrPrefix: 'SP-BIFI',
  },
  {
    sku: 'PNL-580-TOP',
    name: 'TOPCon solar panel 580 Wp n-type mono',
    category: 'PANEL',
    brand: 'Waaree Energies',
    model: 'W-580-TOPCON',
    uom: 'NOS',
    isSerialized: true,
    warrantyMonths: 300, // 25 years
    ratedPowerW: 580,
    cost: 15500,
    price: 19500,
    reorder: 24,
    taxBp: 1200,
    hsnCode: '85414300',
    stockOnHand: 200,
    serialPrefix: 'PNL580-TOP-26A',
    qrPrefix: 'SP-TOP',
  },

  // ── Inverters ──────────────────────────────────────────────────
  {
    sku: 'INV-HYB-6K',
    name: 'Hybrid solar inverter 6 kW with battery backup',
    category: 'INVERTER',
    brand: 'Growatt',
    model: 'SPH-6000-TL3',
    uom: 'NOS',
    isSerialized: true,
    warrantyMonths: 60, // 5 years
    ratedPowerW: 6000,
    cost: 62000,
    price: 78000,
    reorder: 4,
    taxBp: 1800,
    hsnCode: '85044000',
    monitoringUrl: 'https://server.growatt.example/dashboard',
    stockOnHand: 45,
    serialPrefix: 'INV6K-HYB-26A',
    qrPrefix: 'SP-HYB6K',
  },
  {
    sku: 'INV-ONG-10K',
    name: 'Three-phase on-grid inverter 10 kW',
    category: 'INVERTER',
    brand: 'Sungrow',
    model: 'SG10RT',
    uom: 'NOS',
    isSerialized: true,
    warrantyMonths: 60,
    ratedPowerW: 10000,
    cost: 85000,
    price: 108000,
    reorder: 4,
    taxBp: 1800,
    hsnCode: '85044000',
    monitoringUrl: 'https://isolarcloud.sungrow.example',
    stockOnHand: 40,
    serialPrefix: 'INV10K-3PH-26A',
    qrPrefix: 'SP-INV10K',
  },
  {
    sku: 'INV-ONG-15K',
    name: 'Three-phase commercial on-grid inverter 15 kW',
    category: 'INVERTER',
    brand: 'Sungrow',
    model: 'SG15RT',
    uom: 'NOS',
    isSerialized: true,
    warrantyMonths: 60,
    ratedPowerW: 15000,
    cost: 115000,
    price: 142000,
    reorder: 3,
    taxBp: 1800,
    hsnCode: '85044000',
    monitoringUrl: 'https://isolarcloud.sungrow.example',
    stockOnHand: 35,
    serialPrefix: 'INV15K-3PH-26A',
    qrPrefix: 'SP-INV15K',
  },
  {
    sku: 'INV-MICRO-1200',
    name: 'Quad microinverter 1200 W (4-in-1)',
    category: 'INVERTER',
    brand: 'Hoymiles',
    model: 'HMS-1200-4T',
    uom: 'NOS',
    isSerialized: true,
    warrantyMonths: 120, // 10 years
    ratedPowerW: 1200,
    cost: 22000,
    price: 29000,
    reorder: 10,
    taxBp: 1800,
    hsnCode: '85044000',
    monitoringUrl: 'https://s-miles.hoymiles.example',
    stockOnHand: 60,
    serialPrefix: 'MIC1200-26A',
    qrPrefix: 'SP-MIC12',
  },

  // ── Batteries ─────────────────────────────────────────────────
  {
    sku: 'BAT-LI-10K',
    name: 'Lithium LiFePO4 battery 10 kWh high voltage',
    category: 'BATTERY',
    brand: 'BYD',
    model: 'Battery-Box-HVS-10.2',
    uom: 'NOS',
    isSerialized: true,
    warrantyMonths: 120, // 10 years
    ratedPowerW: 10200,
    cost: 210000,
    price: 260000,
    reorder: 4,
    taxBp: 1800,
    hsnCode: '85076000',
    stockOnHand: 40,
    serialPrefix: 'BAT10K-LFP-26A',
    qrPrefix: 'SP-BAT10K',
  },
  {
    sku: 'BAT-LI-15K',
    name: 'Lithium battery wall-mount 15 kWh Powerwall',
    category: 'BATTERY',
    brand: 'Pylontech',
    model: 'US5000-3X',
    uom: 'NOS',
    isSerialized: true,
    warrantyMonths: 120,
    ratedPowerW: 14400,
    cost: 295000,
    price: 365000,
    reorder: 2,
    taxBp: 1800,
    hsnCode: '85076000',
    stockOnHand: 30,
    serialPrefix: 'BAT15K-PW-26A',
    qrPrefix: 'SP-BAT15K',
  },
  {
    sku: 'BAT-TUB-200',
    name: 'Tubular deep cycle solar battery 200 Ah / 12V',
    category: 'BATTERY',
    brand: 'Exide Solar',
    model: 'SOLATUBULAR-6LMS200',
    uom: 'NOS',
    isSerialized: true,
    warrantyMonths: 60, // 5 years
    ratedPowerW: 2400,
    cost: 16500,
    price: 22000,
    reorder: 10,
    taxBp: 1800,
    hsnCode: '85072000',
    stockOnHand: 50,
    serialPrefix: 'BAT200-EX-26A',
    qrPrefix: 'SP-EX200',
  },

  // ── Charge Controllers ────────────────────────────────────────
  {
    sku: 'CC-100A',
    name: 'Smart MPPT solar charge controller 100 A / 48V',
    category: 'CHARGE_CONTROLLER',
    brand: 'Victron Energy',
    model: 'SmartSolar-150/100',
    uom: 'NOS',
    isSerialized: true,
    warrantyMonths: 60,
    ratedPowerW: 5800,
    cost: 28000,
    price: 36000,
    reorder: 5,
    taxBp: 1800,
    hsnCode: '85044090',
    stockOnHand: 40,
    serialPrefix: 'CC100A-VIC-26A',
    qrPrefix: 'SP-CC100',
  },

  // ── Meters & Electrical Accessories ───────────────────────────
  {
    sku: 'MTR-NET-3PH',
    name: 'Bi-directional smart net meter 3-phase with CT',
    category: 'ACDB',
    brand: 'Secure Meters',
    model: 'Premier-300-Net',
    uom: 'NOS',
    isSerialized: true,
    warrantyMonths: 60,
    cost: 12000,
    price: 16500,
    reorder: 8,
    taxBp: 1800,
    hsnCode: '90283010',
    stockOnHand: 50,
    serialPrefix: 'MTR3P-SEC-26A',
    qrPrefix: 'SP-MTR3P',
  },
  {
    sku: 'DC-ISO-32A',
    name: 'Solar PV DC isolator switch 1000V 32A 4-pole',
    category: 'DCDB',
    brand: 'Suntree',
    model: 'SISO-32',
    uom: 'NOS',
    isSerialized: false,
    warrantyMonths: 60,
    cost: 1800,
    price: 3100,
    reorder: 15,
    taxBp: 1800,
    hsnCode: '85365020',
    stockOnHand: 100,
  },
  {
    sku: 'MOUNT-BALLAST',
    name: 'Elevated ballast mounting structure (per panel)',
    category: 'MOUNTING',
    brand: 'Stark Solar',
    model: 'BALLAST-PRO-25',
    uom: 'SET',
    isSerialized: false,
    warrantyMonths: 180, // 15 years
    cost: 3200,
    price: 4500,
    reorder: 30,
    taxBp: 1800,
    hsnCode: '73089090',
    stockOnHand: 250,
  },
  {
    sku: 'DC-CBL-6',
    name: 'DC solar cable 6 sq mm halogen-free (per metre)',
    category: 'CABLE',
    brand: 'Polycab Solar',
    model: 'EN50618-6MM',
    uom: 'MTR',
    isSerialized: false,
    warrantyMonths: 60,
    cost: 48,
    price: 78,
    reorder: 300,
    taxBp: 1800,
    hsnCode: '85444990',
    stockOnHand: 2000,
  },
]

// Existing product stock level top-ups so there are never shortages
const EXISTING_STOCK_TOPUPS: Record<string, number> = {
  'PNL-540': 250,      // was 24 onHand with 24 reserved!
  'INV-ONG-1K': 50,
  'INV-ONG-2K': 50,
  'INV-ONG-3K': 60,    // was 2 onHand with 2 reserved!
  'INV-ONG-4K': 50,
  'INV-ONG-5K': 60,
  'INV-OFF-2K': 40,
  'INV-OFF-3K': 40,
  'INV-OFF-5K': 40,
  'BAT-LI-5K': 50,
  'CC-60A': 50,
  'ACDB': 150,
  'DCDB': 150,
  'EARTH-KIT': 120,
  'LA-32': 80,         // was 3 onHand with 3 reserved!
  'MOUNT-SET': 600,
  'MC4-PR': 500,
  'DC-CBL-4': 2500,
  'AC-CBL-4': 2000,
}

async function run() {
  console.log('⚡ Starting Product Quantity & QR Testing Expansion…')

  const wh = await db.stockLocation.findFirst({ where: { code: 'WH1' } })
  const sites = await db.stockLocation.findFirst({ where: { code: 'SITES' } })
  if (!wh || !sites) {
    throw new Error('Required stock locations (WH1, SITES) not found.')
  }

  // 1. Upsert new products
  console.log('\n📦 1. Upserting 14 New Products…')
  const productMap = new Map<string, any>()

  for (const np of NEW_PRODUCTS) {
    const row = await db.product.upsert({
      where: { sku: np.sku },
      create: {
        sku: np.sku,
        name: np.name,
        category: np.category,
        brand: np.brand,
        model: np.model,
        uom: np.uom,
        isSerialized: np.isSerialized,
        warrantyMonths: np.warrantyMonths,
        warrantyStartBasis: 'DELIVERY',
        ratedPowerW: np.ratedPowerW ?? null,
        hsnCode: np.hsnCode ?? '85044000',
        taxRateBp: np.taxBp,
        stdCostPaise: R(np.cost),
        salePricePaise: R(np.price),
        reorderLevel: np.reorder,
        monitoringUrl: np.monitoringUrl ?? null,
      },
      update: {
        name: np.name,
        brand: np.brand,
        model: np.model,
        warrantyMonths: np.warrantyMonths,
        stdCostPaise: R(np.cost),
        salePricePaise: R(np.price),
        reorderLevel: np.reorder,
        monitoringUrl: np.monitoringUrl ?? null,
        isActive: true,
      },
    })
    productMap.set(np.sku, row)
    console.log(`  ✓ [${row.sku}] ${row.name} (${row.isSerialized ? 'Serialized' : 'Standard'})`)

    // Upsert stock level in WH1
    await db.stockLevel.upsert({
      where: { productId_locationId: { productId: row.id, locationId: wh.id } },
      create: {
        productId: row.id,
        locationId: wh.id,
        onHand: np.stockOnHand,
        reserved: 0,
        avgCostPaise: R(np.cost),
      },
      update: {
        onHand: np.stockOnHand,
      },
    })
  }

  // 2. Top-up existing product stock quantities in WH1
  console.log('\n📈 2. Boosting Existing Product Stock Quantities in Warehouse WH1…')
  for (const [sku, targetOnHand] of Object.entries(EXISTING_STOCK_TOPUPS)) {
    const prod = await db.product.findUnique({ where: { sku } })
    if (prod) {
      productMap.set(sku, prod)
      const curLevel = await db.stockLevel.findUnique({
        where: { productId_locationId: { productId: prod.id, locationId: wh.id } },
      })
      const curOnHand = curLevel?.onHand ?? 0
      const newOnHand = Math.max(curOnHand, targetOnHand)

      await db.stockLevel.upsert({
        where: { productId_locationId: { productId: prod.id, locationId: wh.id } },
        create: {
          productId: prod.id,
          locationId: wh.id,
          onHand: newOnHand,
          reserved: curLevel?.reserved ?? 0,
          avgCostPaise: prod.stdCostPaise,
        },
        update: {
          onHand: newOnHand,
        },
      })
      console.log(`  ✓ [${sku}] Stock onHand updated: ${curOnHand} → ${newOnHand} (Reserved: ${curLevel?.reserved ?? 0})`)
    }
  }

  // 3. Find sample customers and completed installations for linking INSTALLED test units
  const completedInstallations = await db.installation.findMany({
    where: { status: 'COMPLETED' },
    include: { order: { include: { customer: true } } },
    take: 40,
  })

  // 4. Generate Serialized Inventory Units & Scannable QR Codes
  console.log('\n🏷️ 3. Generating Serialized Units & Scannable QRs for Testing…')

  const serializedProducts = [
    // Existing serialized products
    { sku: 'PNL-540', serialPrefix: 'PNL540-26A', qrPrefix: 'SP-PNL540', countInStock: 40, countInstalled: 20 },
    { sku: 'INV-ONG-3K', serialPrefix: 'INV3K-26A', qrPrefix: 'SP-INV3K', countInStock: 25, countInstalled: 15 },
    { sku: 'INV-ONG-5K', serialPrefix: 'INV5K-26A', qrPrefix: 'SP-INV5K', countInStock: 25, countInstalled: 15 },
    { sku: 'BAT-LI-5K', serialPrefix: 'BAT5K-26A', qrPrefix: 'SP-BAT5K', countInStock: 20, countInstalled: 10 },
    { sku: 'CC-60A', serialPrefix: 'CC60A-26A', qrPrefix: 'SP-CC60A', countInStock: 20, countInstalled: 10 },
    // New serialized products
    { sku: 'PNL-550-BI', serialPrefix: 'PNL550-BIFI-26A', qrPrefix: 'SP-BIFI', countInStock: 40, countInstalled: 20 },
    { sku: 'PNL-580-TOP', serialPrefix: 'PNL580-TOP-26A', qrPrefix: 'SP-TOP', countInStock: 35, countInstalled: 15 },
    { sku: 'INV-HYB-6K', serialPrefix: 'INV6K-HYB-26A', qrPrefix: 'SP-HYB6K', countInStock: 25, countInstalled: 12 },
    { sku: 'INV-ONG-10K', serialPrefix: 'INV10K-3PH-26A', qrPrefix: 'SP-INV10K', countInStock: 20, countInstalled: 10 },
    { sku: 'INV-ONG-15K', serialPrefix: 'INV15K-3PH-26A', qrPrefix: 'SP-INV15K', countInStock: 18, countInstalled: 8 },
    { sku: 'INV-MICRO-1200', serialPrefix: 'MIC1200-26A', qrPrefix: 'SP-MIC12', countInStock: 30, countInstalled: 15 },
    { sku: 'BAT-LI-10K', serialPrefix: 'BAT10K-LFP-26A', qrPrefix: 'SP-BAT10K', countInStock: 20, countInstalled: 10 },
    { sku: 'BAT-LI-15K', serialPrefix: 'BAT15K-PW-26A', qrPrefix: 'SP-BAT15K', countInStock: 15, countInstalled: 8 },
    { sku: 'BAT-TUB-200', serialPrefix: 'BAT200-EX-26A', qrPrefix: 'SP-EX200', countInStock: 25, countInstalled: 12 },
    { sku: 'CC-100A', serialPrefix: 'CC100A-VIC-26A', qrPrefix: 'SP-CC100', countInStock: 20, countInstalled: 10 },
    { sku: 'MTR-NET-3PH', serialPrefix: 'MTR3P-SEC-26A', qrPrefix: 'SP-MTR3P', countInStock: 25, countInstalled: 12 },
  ]

  let totalUnitsCreated = 0
  let totalWarrantiesCreated = 0
  const sampleTestQRs: Array<{ product: string; sku: string; serial: string; qrCode: string; status: string; warrantyMonths: number }> = []

  for (const item of serializedProducts) {
    const prod = productMap.get(item.sku) || (await db.product.findUnique({ where: { sku: item.sku } }))
    if (!prod) continue

    // A. Create IN_STOCK units (for testing picking, dispatch, warehouse)
    for (let i = 1; i <= item.countInStock; i++) {
      const serialNumber = `${item.serialPrefix}-${String(1000 + i)}`
      const qrCode = `${item.qrPrefix}-${String(1000 + i)}`

      const existing = await db.inventoryUnit.findUnique({
        where: { productId_serialNumber: { productId: prod.id, serialNumber } },
      })
      if (!existing) {
        await db.inventoryUnit.create({
          data: {
            productId: prod.id,
            serialNumber,
            qrCode,
            status: 'IN_STOCK',
            locationId: wh.id,
            unitCostPaise: prod.stdCostPaise,
          },
        })
        totalUnitsCreated++
      }

      // Collect first unit as sample test QR
      if (i === 1) {
        sampleTestQRs.push({
          product: prod.name,
          sku: prod.sku,
          serial: serialNumber,
          qrCode,
          status: 'IN_STOCK',
          warrantyMonths: prod.warrantyMonths,
        })
      }
    }

    // B. Create INSTALLED units with active Warranties (for testing QR scanning & warranty lookups)
    for (let i = 1; i <= item.countInstalled; i++) {
      const serialNumber = `${item.serialPrefix}-${String(5000 + i)}`
      const qrCode = `${item.qrPrefix}-${String(5000 + i)}`
      const inst = completedInstallations[(i - 1) % completedInstallations.length]

      const existing = await db.inventoryUnit.findUnique({
        where: { productId_serialNumber: { productId: prod.id, serialNumber } },
      })

      let unitId: string
      if (!existing) {
        const u = await db.inventoryUnit.create({
          data: {
            productId: prod.id,
            serialNumber,
            qrCode,
            status: 'INSTALLED',
            locationId: sites.id,
            customerId: inst?.order.customerId ?? null,
            orderId: inst?.orderId ?? null,
            installationId: inst?.id ?? null,
            deliveredOn: inst?.scheduledOn ?? '2026-03-15',
            unitCostPaise: prod.stdCostPaise,
          },
        })
        unitId = u.id
        totalUnitsCreated++
      } else {
        unitId = existing.id
      }

      // Create or ensure active Warranty
      if (inst) {
        const existingWarranty = await db.warranty.findFirst({
          where: { unitId },
        })
        if (!existingWarranty) {
          const startDate = inst.scheduledOn ?? '2026-03-15'
          const startDt = new Date(startDate)
          const endDt = new Date(startDt)
          endDt.setMonth(endDt.getMonth() + prod.warrantyMonths)

          await db.warranty.create({
            data: {
              unitId,
              productId: prod.id,
              installationId: inst.id,
              customerId: inst.order.customerId,
              coverage: 'EQUIPMENT',
              startDate,
              endDate: iso(endDt),
              months: prod.warrantyMonths,
              status: 'ACTIVE',
              source: 'DELIVERY',
            },
          })
          totalWarrantiesCreated++
        }
      }

      // Collect first installed unit as sample test QR
      if (i === 1) {
        sampleTestQRs.push({
          product: prod.name,
          sku: prod.sku,
          serial: serialNumber,
          qrCode,
          status: 'INSTALLED (Active Warranty)',
          warrantyMonths: prod.warrantyMonths,
        })
      }
    }

    console.log(`  ✓ [${item.sku}] +${item.countInStock} IN_STOCK units, +${item.countInstalled} INSTALLED units with active warranty`)
  }

  // 5. Final summary
  const totalUnits = await db.inventoryUnit.count()
  const inStockUnits = await db.inventoryUnit.count({ where: { status: 'IN_STOCK' } })
  const installedUnits = await db.inventoryUnit.count({ where: { status: 'INSTALLED' } })
  const totalProds = await db.product.count()
  const totalWarranties = await db.warranty.count()

  console.log('\n======================================================')
  console.log('🎉 SEEDING & EXPANSION COMPLETED SUCCESSFULLY!')
  console.log('======================================================')
  console.log(`Total Products in Catalog:  ${totalProds}`)
  console.log(`Total Serialized Units:     ${totalUnits}`)
  console.log(`Units IN_STOCK in WH1:      ${inStockUnits} (available for picking & testing)`)
  console.log(`Units INSTALLED:            ${installedUnits}`)
  console.log(`Total Active Warranties:    ${totalWarranties}`)
  console.log('======================================================\n')

  console.log('📋 SAMPLE TEST QR CODES & SERIALS READY FOR TESTING:')
  console.table(sampleTestQRs)
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Error during seeding:', e)
    process.exit(1)
  })
