// Seed data (Backend Schema 5.8): 1 director, 2 sales, 15 technicians,
// 1 warehouse, 1 support, 1 accounts; ~20 products with per-product warranty
// terms; 10 system templates + 5 panel sets + installation service; stock for
// 8 jobs with one product below reorder; ~30 orders Aug-Oct 2026 (one
// loss-making) plus the May 2025 (in warranty) and March 2023 (out of
// warranty) installations used in the service demo.

import { PrismaClient } from '@prisma/client'
import { scryptSync, randomBytes, createHash } from 'crypto'

const db = new PrismaClient()

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

const R = (rupees: number) => Math.round(rupees * 100) // rupees -> paise
const iso = (d: Date) => d.toISOString().slice(0, 10)
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000)
const PASSWORD = 'demo1234'

// counters for human-readable numbers
const seq: Record<string, number> = {}
function num(name: string, prefix: string): string {
  const year = 2026
  seq[name] = (seq[name] ?? 0) + 1
  return `${prefix}-${year}-${String(seq[name]).padStart(4, '0')}`
}

let unitCounter = 0
function nextQr(): string {
  return 'SP' + randomBytes(4).toString('hex').toUpperCase()
}

async function main() {
  console.log('Seeding SunPower Ops…')

  // ── wipe (FK-safe order) ────────────────────────────────────────
  const tables = [
    'ticketEvent', 'ticketPart', 'serviceTicket', 'maintenanceAlert', 'warranty',
    'timeLog', 'crewSuggestion', 'installationCrew', 'installation',
    'dispatchUnit', 'dispatchLine', 'dispatch',
    'stockAllocation', 'stockMovement', 'stockLevel', 'inventoryUnit',
    'purchaseReceiptLine', 'purchaseReceipt', 'purchaseOrderLine', 'purchaseOrder', 'supplier',
    'subsidyApplication', 'expense', 'invoiceLine', 'invoice', 'payment',
    'orderLine', 'order', 'quoteLine', 'quote',
    'siteAssessment', 'siteSurvey', 'leadDuplicateFlag', 'leadActivity', 'lead',
    'customerAccessLink', 'customer',
    'attachment', 'outbox', 'auditLog', 'shareLink', 'idempotencyKey',
    'faultCode', 'templateBomLine', 'systemTemplate', 'product',
    'technicianLeave', 'technician', 'session', 'user', 'setting', 'numberSequence', 'stockLocation',
  ]
  for (const t of tables) {
    await (db as any)[t[0].toLowerCase() + t.slice(1)].deleteMany()
  }

  // ── locations ───────────────────────────────────────────────────
  const wh = await db.stockLocation.create({ data: { code: 'WH1', name: 'Main warehouse (Vatva)', type: 'WAREHOUSE' } })
  const veh = await db.stockLocation.create({ data: { code: 'VEH1', name: 'Install vehicle', type: 'VEHICLE' } })
  const sites = await db.stockLocation.create({ data: { code: 'SITES', name: 'Customer sites', type: 'CUSTOMER_SITES' } })
  const rma = await db.stockLocation.create({ data: { code: 'RMA', name: 'RMA / faulty units', type: 'RMA' } })
  await db.stockLocation.create({ data: { code: 'SCRAP', name: 'Scrap', type: 'SCRAP' } })

  // ── users ───────────────────────────────────────────────────────
  const mkUser = (name: string, email: string, role: string) =>
    db.user.create({ data: { name, email, role, passwordHash: hashPassword(PASSWORD), isActive: true } })

  const director = await mkUser('Priya Deshmukh', 'director@sunpower.example', 'DIRECTOR')
  const sales1 = await mkUser('Rahul Mehta', 'rahul@sunpower.example', 'SALES')
  const sales2 = await mkUser('Anita Shah', 'anita@sunpower.example', 'SALES')
  const warehouseUser = await mkUser('Jignesh Patel', 'warehouse@sunpower.example', 'WAREHOUSE')
  const support = await mkUser('Meera Joshi', 'support@sunpower.example', 'SUPPORT')
  const accounts = await mkUser('Kaushik Bhatt', 'accounts@sunpower.example', 'ACCOUNTS')

  const techNames = [
    'Vikram Solanki', 'Dinesh Vaghela', 'Kiran Rana', 'Harshad Trivedi', 'Mehul Amin',
    'Sanjay Rathod', 'Alpesh Chauhan', 'Rakesh Jadhav', 'Nilesh Parmar', 'Bharat Modh',
    'Suresh Gohil', 'Kartik Bhoi', 'Jayesh Dhamecha', 'Manish Lad', 'Prakash Vyas',
  ]
  const crewLeadIdx = [0, 3, 5, 8]
  const batterySkillIdx = [1, 6, 11]
  const technicians: { id: string; userId: string; name: string }[] = []
  for (let i = 0; i < techNames.length; i++) {
    const skills = ['SURVEY', 'ONGRID']
    if (batterySkillIdx.includes(i)) skills.push('OFFGRID_BATTERY')
    if (crewLeadIdx.includes(i)) skills.push('ELECTRICAL_LEAD')
    const u = await mkUser(techNames[i], `tech${i + 1}@sunpower.example`, 'TECHNICIAN')
    const t = await db.technician.create({
      data: {
        userId: u.id,
        skills: skills.join(','),
        baseLat: 22.99 + i * 0.01,
        baseLng: 72.55 + (i % 5) * 0.01,
        hourlyCostPaise: R(200 + (i % 4) * 50),
        maxJobsPerDay: 2,
        isCrewLead: crewLeadIdx.includes(i),
      },
    })
    technicians.push({ id: t.id, userId: u.id, name: u.name })
  }
  const leads1873 = technicians[7] // surveyor for the demo lead later

  // ── settings ────────────────────────────────────────────────────
  await db.setting.create({
    data: {
      key: 'business',
      value: JSON.stringify({
      companyName: 'SunPower Solar Energy Pvt Ltd',
      gstin: '24ABCDE1234F1Z5',
      address: 'Plot 14, GIDC Estate, Phase II, Vatva, Ahmedabad, Gujarat 382445',
      phone: '+91 79 4000 1234',
      email: 'hello@sunpower.example',
      bankDetails: 'HDFC Bank A/C 50100234567891, IFSC HDFC0000123',
      advancePct: 30, targetMarginBp: 2000, salesDiscountLimitBp: 500,
      yieldKwhPerKwpPerDay: 4.5, roofAreaPerKwSqm: 10,
      shadingFactors: { NONE: 1.0, LOW: 0.95, MEDIUM: 0.85, HIGH: 0.7 },
      defaultTariffPaise: R(7), quoteValidityDays: 15,
      slaHoursByPriority: { LOW: 168, NORMAL: 72, HIGH: 24, URGENT: 4 },
      crewWeights: { skill: 0.4, proximity: 0.25, workload: 0.2, continuity: 0.15 },
      cleaningIntervalDays: 90, duplicateAddressThreshold: 0.72, warrantyReminderDays: 30,
      aiEnabled: true, photoAnalysisEnabled: true,
      }),
    },
  })

  // ── products ────────────────────────────────────────────────────
  interface PSeed { sku: string; name: string; category: string; brand?: string; model?: string; uom: string; serialized: boolean; warrantyMonths: number; basis?: string; ratedPowerW?: number; cost: number; price: number; reorder: number; taxBp: number; monitoringUrl?: string }
  const P: PSeed[] = [
    { sku: 'PNL-540', name: 'Solar panel 540 Wp mono PERC', category: 'PANEL', brand: 'Adani Solar', model: 'ASM-540', uom: 'NOS', serialized: true, warrantyMonths: 240, ratedPowerW: 540, cost: 12500, price: 15500, reorder: 24, taxBp: 1200 },
    { sku: 'INV-ONG-1K', name: 'On-grid inverter 1 kW', category: 'INVERTER', brand: 'Luminous', model: 'GTI-1K', uom: 'NOS', serialized: true, warrantyMonths: 24, cost: 14000, price: 18000, reorder: 4, taxBp: 1800, monitoringUrl: 'https://monitor.luminous.example/gti' },
    { sku: 'INV-ONG-2K', name: 'On-grid inverter 2 kW', category: 'INVERTER', brand: 'Luminous', model: 'GTI-2K', uom: 'NOS', serialized: true, warrantyMonths: 24, cost: 20000, price: 26000, reorder: 4, taxBp: 1800, monitoringUrl: 'https://monitor.luminous.example/gti' },
    { sku: 'INV-ONG-3K', name: 'On-grid inverter 3 kW', category: 'INVERTER', brand: 'Luminous', model: 'GTI-3K', uom: 'NOS', serialized: true, warrantyMonths: 24, cost: 27000, price: 35000, reorder: 5, taxBp: 1800, monitoringUrl: 'https://monitor.luminous.example/gti' },
    { sku: 'INV-ONG-4K', name: 'On-grid inverter 4 kW', category: 'INVERTER', brand: 'Luminous', model: 'GTI-4K', uom: 'NOS', serialized: true, warrantyMonths: 24, cost: 36000, price: 46000, reorder: 3, taxBp: 1800, monitoringUrl: 'https://monitor.luminous.example/gti' },
    { sku: 'INV-ONG-5K', name: 'On-grid inverter 5 kW', category: 'INVERTER', brand: 'Luminous', model: 'GTI-5K', uom: 'NOS', serialized: true, warrantyMonths: 24, cost: 42000, price: 54000, reorder: 3, taxBp: 1800, monitoringUrl: 'https://monitor.luminous.example/gti' },
    { sku: 'INV-OFF-2K', name: 'Off-grid inverter 2 kW', category: 'INVERTER', brand: 'Microtek', model: 'UPS-2K', uom: 'NOS', serialized: true, warrantyMonths: 24, cost: 24000, price: 31000, reorder: 3, taxBp: 1800 },
    { sku: 'INV-OFF-3K', name: 'Off-grid inverter 3 kW', category: 'INVERTER', brand: 'Microtek', model: 'UPS-3K', uom: 'NOS', serialized: true, warrantyMonths: 24, cost: 32000, price: 40000, reorder: 3, taxBp: 1800 },
    { sku: 'INV-OFF-5K', name: 'Off-grid inverter 5 kW', category: 'INVERTER', brand: 'Microtek', model: 'UPS-5K', uom: 'NOS', serialized: true, warrantyMonths: 24, cost: 48000, price: 60000, reorder: 2, taxBp: 1800 },
    { sku: 'BAT-LI-5K', name: 'Lithium battery 5 kWh', category: 'BATTERY', brand: 'Luminous', model: 'Li-5K', uom: 'NOS', serialized: true, warrantyMonths: 24, cost: 110000, price: 135000, reorder: 4, taxBp: 1800 },
    { sku: 'CC-60A', name: 'Battery charge controller 60 A', category: 'CHARGE_CONTROLLER', brand: 'Microtek', model: 'CC-60', uom: 'NOS', serialized: true, warrantyMonths: 24, cost: 7500, price: 10500, reorder: 6, taxBp: 1800 },
    { sku: 'MOUNT-SET', name: 'Mounting structure set (per panel)', category: 'MOUNTING', uom: 'SET', serialized: false, warrantyMonths: 120, cost: 2200, price: 3200, reorder: 20, taxBp: 1800 },
    { sku: 'DC-CBL-4', name: 'DC cable 4 sq mm (per metre)', category: 'CABLE', uom: 'MTR', serialized: false, warrantyMonths: 60, cost: 32, price: 55, reorder: 200, taxBp: 1800 },
    { sku: 'AC-CBL-4', name: 'AC cable 4 sq mm (per metre)', category: 'CABLE', uom: 'MTR', serialized: false, warrantyMonths: 60, cost: 28, price: 48, reorder: 150, taxBp: 1800 },
    { sku: 'ACDB', name: 'AC distribution box', category: 'ACDB', uom: 'NOS', serialized: false, warrantyMonths: 60, cost: 1800, price: 3200, reorder: 6, taxBp: 1800 },
    { sku: 'DCDB', name: 'DC distribution box', category: 'DCDB', uom: 'NOS', serialized: false, warrantyMonths: 60, cost: 1500, price: 2800, reorder: 6, taxBp: 1800 },
    { sku: 'EARTH-KIT', name: 'Earthing kit', category: 'EARTHING', uom: 'SET', serialized: false, warrantyMonths: 60, cost: 1200, price: 2200, reorder: 10, taxBp: 1800 },
    { sku: 'LA-32', name: 'Lightning arrester 32 kA', category: 'LIGHTNING_ARRESTER', uom: 'NOS', serialized: false, warrantyMonths: 60, cost: 1800, price: 3000, reorder: 10, taxBp: 1800 },
    { sku: 'MC4-PR', name: 'MC4 connector pair', category: 'CONNECTOR', uom: 'NOS', serialized: false, warrantyMonths: 24, cost: 90, price: 180, reorder: 30, taxBp: 1800 },
    { sku: 'INST-SVC', name: 'Installation and testing service', category: 'SERVICE', uom: 'SVC', serialized: false, warrantyMonths: 0, cost: 0, price: 15000, reorder: 0, taxBp: 1800 },
  ]
  const products: Record<string, string> = {}
  for (const p of P) {
    const row = await db.product.create({
      data: {
        sku: p.sku, name: p.name, category: p.category, brand: p.brand ?? null, model: p.model ?? null,
        uom: p.uom, isSerialized: p.serialized, warrantyMonths: p.warrantyMonths,
        warrantyStartBasis: p.basis ?? 'DELIVERY', ratedPowerW: p.ratedPowerW ?? null,
        hsnCode: p.category === 'PANEL' ? '85414300' : p.category === 'SERVICE' ? '998740' : '85044000',
        taxRateBp: p.taxBp, stdCostPaise: R(p.cost), salePricePaise: R(p.price),
        reorderLevel: p.reorder, monitoringUrl: p.monitoringUrl ?? null,
      },
    })
    products[p.sku] = row.id
  }

  // ── templates + BOM lines ──────────────────────────────────────
  async function mkTemplate(code: string, name: string, type: string, capacityKw: number, lines: { sku: string; rule: string; value: number; allowance?: number }[], labour: number, panelSku = 'PNL-540') {
    const t = await db.systemTemplate.create({
      data: {
        code, name, systemType: type, capacityKw,
        panelProductId: type !== 'SERVICE' ? products[panelSku] : null,
        defaultCableDistanceM: 20, labourAllowancePaise: R(labour),
      },
    })
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      await db.templateBomLine.create({
        data: { templateId: t.id, productId: products[l.sku], rule: l.rule, value: l.value, allowance: l.allowance ?? 0, sortOrder: i },
      })
    }
    return t
  }

  const onGridBom = (invSku: string, earthQty: number) => [
    { sku: 'PNL-540', rule: 'PANEL_COUNT', value: 1 },
    { sku: invSku, rule: 'FIXED', value: 1 },
    { sku: 'CC-60A', rule: 'FIXED', value: 1 },
    { sku: 'MOUNT-SET', rule: 'PER_PANEL', value: 1 },
    { sku: 'DC-CBL-4', rule: 'PER_CABLE_METER', value: 2, allowance: 5 },
    { sku: 'AC-CBL-4', rule: 'PER_CABLE_METER', value: 1, allowance: 5 },
    { sku: 'ACDB', rule: 'FIXED', value: 1 },
    { sku: 'DCDB', rule: 'FIXED', value: 1 },
    { sku: 'EARTH-KIT', rule: 'FIXED', value: earthQty },
    { sku: 'LA-32', rule: 'FIXED', value: 1 },
    { sku: 'MC4-PR', rule: 'FIXED', value: 4 },
    { sku: 'INST-SVC', rule: 'FIXED', value: 1 },
  ]
  const offGridBom = (invSku: string, batPerKw: number, earthQty: number) => [
    { sku: 'PNL-540', rule: 'PANEL_COUNT', value: 1 },
    { sku: invSku, rule: 'FIXED', value: 1 },
    { sku: 'BAT-LI-5K', rule: 'PER_KW', value: batPerKw },
    { sku: 'CC-60A', rule: 'FIXED', value: 1 },
    { sku: 'MOUNT-SET', rule: 'PER_PANEL', value: 1 },
    { sku: 'DC-CBL-4', rule: 'PER_CABLE_METER', value: 2, allowance: 5 },
    { sku: 'AC-CBL-4', rule: 'PER_CABLE_METER', value: 1, allowance: 5 },
    { sku: 'ACDB', rule: 'FIXED', value: 1 },
    { sku: 'DCDB', rule: 'FIXED', value: 1 },
    { sku: 'EARTH-KIT', rule: 'FIXED', value: earthQty },
    { sku: 'LA-32', rule: 'FIXED', value: 1 },
    { sku: 'MC4-PR', rule: 'FIXED', value: 4 },
    { sku: 'INST-SVC', rule: 'FIXED', value: 1 },
  ]
  await mkTemplate('ONG1KW', 'On-Grid 1 kW system', 'ON_GRID', 1, onGridBom('INV-ONG-1K', 2), 5000)
  await mkTemplate('ONG2KW', 'On-Grid 2 kW system', 'ON_GRID', 2, onGridBom('INV-ONG-2K', 2), 7000)
  await mkTemplate('ONG3KW', 'On-Grid 3 kW system', 'ON_GRID', 3, onGridBom('INV-ONG-3K', 3), 10000)
  await mkTemplate('ONG4KW', 'On-Grid 4 kW system', 'ON_GRID', 4, onGridBom('INV-ONG-4K', 3), 12000)
  await mkTemplate('ONG5KW', 'On-Grid 5 kW system', 'ON_GRID', 5, onGridBom('INV-ONG-5K', 3), 14000)
  await mkTemplate('OFFG2KW', 'Off-Grid 2 kW system', 'OFF_GRID', 2, offGridBom('INV-OFF-2K', 1, 2), 9000)
  await mkTemplate('OFFG3KW', 'Off-Grid 3 kW system', 'OFF_GRID', 3, offGridBom('INV-OFF-3K', 1, 3), 12000)
  await mkTemplate('OFFG5KW', 'Off-Grid 5 kW system', 'OFF_GRID', 5, offGridBom('INV-OFF-5K', 1, 3), 16000)
  for (const n of [2, 3, 4, 5, 6]) {
    await mkTemplate(`PNLSET${n}`, `Solar panel set — ${n} panels`, 'PANEL_SET', Math.round(n * 0.54 * 100) / 100, [
      { sku: 'PNL-540', rule: 'FIXED', value: n },
      { sku: 'MOUNT-SET', rule: 'PER_PANEL', value: 1 },
      { sku: 'MC4-PR', rule: 'FIXED', value: 4 },
      { sku: 'INST-SVC', rule: 'FIXED', value: 1 },
    ], 3000)
  }
  await mkTemplate('INSTSVC', 'Installation service only', 'SERVICE', 0, [
    { sku: 'INST-SVC', rule: 'FIXED', value: 1 },
  ], 0)

  // fault codes per inverter model
  const faultSeeds: [string, string, string, string][] = [
    ['GTI-3K', 'E01', 'DC input over-voltage', 'HIGH'],
    ['GTI-3K', 'E02', 'Grid connection lost', 'NORMAL'],
    ['GTI-3K', 'E03', 'Inverter over-temperature', 'NORMAL'],
    ['GTI-3K', 'E04', 'Isolation resistance low', 'HIGH'],
    ['GTI-3K', 'E05', 'Fan failure', 'NORMAL'],
    ['GTI-5K', 'E01', 'DC input over-voltage', 'HIGH'],
    ['GTI-5K', 'E02', 'Grid connection lost', 'NORMAL'],
    ['UPS-3K', 'B01', 'Battery low voltage cut-off', 'NORMAL'],
    ['UPS-3K', 'B02', 'Overload trip', 'NORMAL'],
    ['Li-5K', 'B11', 'Battery management system fault', 'URGENT'],
  ]
  for (const [model, code, description, priority] of faultSeeds) {
    await db.faultCode.create({ data: { code, productModel: model, description, defaultPriority: priority } })
  }

  // ── suppliers + open PO ─────────────────────────────────────────
  const sup1 = await db.supplier.create({ data: { name: 'Adani Solar Distribution', contact: 'Nirav Shah', phone: '+917940050001', email: 'sales@adanisolar.example', gstin: '24AACCA1234A1ZP' } })
  const sup2 = await db.supplier.create({ data: { name: 'Luminous Power Technologies', contact: 'Deepa Iyer', phone: '+917940050002', email: 'dealer@luminous.example', gstin: '07AAABD1234C1ZQ' } })

  // ── stock receipts (units + ledger + levels) ────────────────────
  interface ReceiptLine { sku: string; qty: number; serials?: string[]; cost: number }
  async function receive(supplierName: string, supplierId: string | null, lines: ReceiptLine[], on: string, ref?: string) {
    const receipt = await db.purchaseReceipt.create({
      data: {
        receiptNumber: num('GRN', 'GRN'), supplierName, supplierId,
        supplierInvoiceRef: ref ?? 'INV-' + Math.floor(1000 + Math.random() * 9000),
        receivedOn: on, locationId: wh.id,
        totalPaise: lines.reduce((s, l) => s + R(l.cost) * l.qty, 0),
      },
    })
    for (const l of lines) {
      const product = (await db.product.findUnique({ where: { sku: l.sku } }))!
      const rl = await db.purchaseReceiptLine.create({
        data: { receiptId: receipt.id, productId: product.id, qty: l.qty, unitCostPaise: R(l.cost) },
      })
      await db.stockMovement.create({
        data: { productId: product.id, qty: l.qty, toLocationId: wh.id, type: 'RECEIPT', unitCostPaise: R(l.cost), refType: 'purchase_receipt', refId: receipt.id, createdBy: warehouseUser.id },
      })
      const level = await db.stockLevel.findUnique({ where: { productId_locationId: { productId: product.id, locationId: wh.id } } })
      const onHand = level?.onHand ?? 0
      const avg = level?.avgCostPaise ?? 0
      const newAvg = onHand + l.qty > 0 ? Math.round((onHand * avg + l.qty * R(l.cost)) / (onHand + l.qty)) : R(l.cost)
      await db.stockLevel.upsert({
        where: { productId_locationId: { productId: product.id, locationId: wh.id } },
        create: { productId: product.id, locationId: wh.id, onHand: l.qty, reserved: 0, avgCostPaise: newAvg },
        update: { onHand: onHand + l.qty, avgCostPaise: newAvg },
      })
      if (l.serials) {
        for (const serial of l.serials) {
          await db.inventoryUnit.create({
            data: { productId: product.id, serialNumber: serial, qrCode: nextQr(), status: 'IN_STOCK', locationId: wh.id, unitCostPaise: R(l.cost), receiptLineId: rl.id },
          })
        }
      }
    }
    return receipt
  }

  const serial = (prefix: string, n: number, start: number) => Array.from({ length: n }, (_, i) => `${prefix}-${String(start + i).padStart(6, '0')}`)
  await receive('Adani Solar Distribution', sup1.id, [
    { sku: 'PNL-540', qty: 240, serials: serial('PNL540-26A', 240, 500), cost: 12500 },
  ], iso(daysAgo(120)), 'ADI-88121')
  await receive('Luminous Power Technologies', sup2.id, [
    { sku: 'INV-ONG-1K', qty: 10, serials: serial('INV1K-26A', 10, 300), cost: 14000 },
    { sku: 'INV-ONG-2K', qty: 10, serials: serial('INV2K-26A', 10, 300), cost: 20000 },
    { sku: 'INV-ONG-3K', qty: 20, serials: serial('INV3K-26A', 20, 300), cost: 27000 },
    { sku: 'INV-ONG-4K', qty: 12, serials: serial('INV4K-26A', 12, 300), cost: 36000 },
    { sku: 'INV-ONG-5K', qty: 12, serials: serial('INV5K-26A', 12, 300), cost: 42000 },
    { sku: 'BAT-LI-5K', qty: 30, serials: serial('BATLI-26A', 30, 300), cost: 110000 },
    { sku: 'CC-60A', qty: 45, serials: serial('CC60-26A', 45, 300), cost: 7500 },
  ], iso(daysAgo(118)), 'LUM-55102')
  await receive('Microtek regional depot', null, [
    { sku: 'INV-OFF-2K', qty: 8, serials: serial('INVO2-26A', 8, 300), cost: 24000 },
    { sku: 'INV-OFF-3K', qty: 8, serials: serial('INVO3-26A', 8, 300), cost: 32000 },
    { sku: 'INV-OFF-5K', qty: 10, serials: serial('INVO5-26A', 10, 300), cost: 48000 },
  ], iso(daysAgo(115)), 'MCT-22034')
  await receive('Bharat Electricals', null, [
    { sku: 'MOUNT-SET', qty: 320, cost: 2200 },
    { sku: 'DC-CBL-4', qty: 2600, cost: 32 },
    { sku: 'AC-CBL-4', qty: 1700, cost: 28 },
    { sku: 'ACDB', qty: 64, cost: 1800 },
    { sku: 'DCDB', qty: 64, cost: 1500 },
    { sku: 'EARTH-KIT', qty: 130, cost: 1200 },
    { sku: 'LA-32', qty: 37, cost: 1800 },
    { sku: 'MC4-PR', qty: 240, cost: 90 },
  ], iso(daysAgo(110)), 'BHE-7789')

  // open PO for the low-stock lightning arrester
  const po = await db.purchaseOrder.create({
    data: {
      poNumber: num('PO', 'PO'), supplierId: sup1.id, status: 'OPEN',
      orderedOn: iso(daysAgo(6)), expectedOn: iso(daysAgo(-4)), createdBy: director.id,
      totalPaise: R(1800) * 30,
      lines: { create: [{ productId: products['LA-32'], qtyOrdered: 30, unitCostPaise: R(1800) }] },
    },
  })

  console.log('  base data done')

  // ── helpers for historical order chains ─────────────────────────
  async function mkCustomer(i: number, name: string, phone: string, area: string, type = 'HOME') {
    return db.customer.create({
      data: {
        customerNumber: num('CUSTOMER', 'C'), name, phone,
        addressLine: `${12 + i} Shreeji Residency, ${area}`, addressNorm: `${12 + i} shreeji residency ${area} 3824${String(100 + i).slice(-3)}`.toLowerCase(),
        city: 'Ahmedabad', pincode: `3824${String(45 + (i % 10))}`, type,
        consentAt: daysAgo(100), consumerNo: 'DGVV' + (100000 + i), discom: 'DGVCL',
      },
    })
  }

  interface HistOrder {
    i: number
    name: string
    phone: string
    area: string
    templateCode: string
    capacityKw: number
    createdDaysAgo: number
    status: 'CLOSED' | 'INSTALLED' | 'PENDING_ADVANCE'
    discountRs?: number
    lossMaking?: boolean
    systemType?: string
  }

  async function completedChain(h: HistOrder) {
    const created = daysAgo(h.createdDaysAgo)
    const installed = daysAgo(h.createdDaysAgo - 6)
    const customer = await mkCustomer(h.i, h.name, h.phone, h.area)
    const sales = h.i % 2 === 0 ? sales1 : sales2
    const lead = await db.lead.create({
      data: {
        leadNumber: num('LEAD', 'L'), customerId: customer.id, source: (['WEB_FORM', 'WHATSAPP', 'PHONE', 'REFERRAL'] as const)[h.i % 4],
        status: 'WON', ownerId: sales.id, requestedCapacityKw: h.capacityKw,
        systemTypePref: h.systemType ?? 'ON_GRID', wantsSubsidy: h.i % 3 === 0,
        monthlyBillPaise: R(2500 + (h.i % 5) * 500), tariffPaise: R(7), roofAreaSqm: 40 + (h.i % 4) * 10,
        gridOk: true, sanctionedLoadKw: 5, firstContactedAt: created, slaDueAt: created, createdAt: created, updatedAt: created,
      },
    })
    await db.leadActivity.create({ data: { leadId: lead.id, type: 'SYSTEM', body: 'Enquiry received and assigned.', createdAt: created } })

    const template = (await db.systemTemplate.findUnique({ where: { code: h.templateCode }, include: { bomLines: { include: { product: true } }, panelProduct: true } }))!
    const panelWp = template.panelProduct?.ratedPowerW ?? 540
    const panelCount = Math.ceil((h.capacityKw * 1000) / panelWp)
    const cableM = 18 + (h.i % 12)
    const quoteLines = template.bomLines.map((bl) => {
      let qty = bl.value
      if (bl.rule === 'PANEL_COUNT') qty = panelCount
      else if (bl.rule === 'PER_PANEL') qty = bl.value * panelCount
      else if (bl.rule === 'PER_KW') qty = Math.ceil(bl.value * h.capacityKw)
      else if (bl.rule === 'PER_CABLE_METER') qty = Math.ceil(bl.value * cableM + (bl.allowance ?? 0))
      return { bl, qty }
    })
    const subtotal = quoteLines.reduce((s, { bl, qty }) => s + bl.product.salePricePaise * qty, 0)
    const tax = quoteLines.reduce((s, { bl, qty }) => s + Math.round((bl.product.salePricePaise * qty * bl.product.taxRateBp) / 10000), 0)
    const discount = R(h.discountRs ?? 0)
    const total = subtotal - discount + tax
    const quote = await db.quote.create({
      data: {
        quoteNumber: num('QUOTE', 'Q'), leadId: lead.id, customerId: customer.id, templateId: template.id,
        status: 'ACCEPTED', version: 1, capacityKw: h.capacityKw, systemType: template.systemType,
        cableDistanceM: cableM, subtotalPaise: subtotal, discountPaise: discount, taxPaise: tax,
        totalPaise: total, subsidyEstimatePaise: template.systemType === 'ON_GRID' ? R(78000) : 0,
        estimatedMarginBp: 2400, validUntil: iso(new Date(created.getTime() + 15 * 86400000)),
        sentAt: created, acceptedAt: new Date(created.getTime() + 86400000), acceptedName: h.name,
        createdAt: created,
        lines: { create: quoteLines.map(({ bl, qty }) => ({ productId: bl.productId, description: bl.product.name, qty, unitPricePaise: bl.product.salePricePaise, taxRateBp: bl.product.taxRateBp, lineTotalPaise: bl.product.salePricePaise * qty, rule: bl.rule })) },
      },
    })
    const order = await db.order.create({
      data: {
        orderNumber: num('ORDER', 'SO'), quoteId: quote.id, customerId: customer.id,
        status: h.status, capacityKw: h.capacityKw, systemType: template.systemType,
        siteSnapshot: JSON.stringify({ address: customer.addressLine, cableDistanceM: cableM }),
        subtotalPaise: subtotal, discountPaise: discount, taxPaise: tax, totalPaise: total,
        advanceRequiredPaise: Math.round(total * 0.3), paidPaise: total,
        confirmedAt: new Date(created.getTime() + 2 * 86400000), createdAt: created,
        lines: { create: quoteLines.map(({ bl, qty }) => ({ productId: bl.productId, description: bl.product.name, qty, unitPricePaise: bl.product.salePricePaise, taxRateBp: bl.product.taxRateBp, qtyReserved: qty, qtyDispatched: qty })) },
      },
    })
    await db.subsidyApplication.create({
      data: { orderId: order.id, status: h.i % 3 === 0 ? 'DISBURSED' : 'SUBMITTED', applicationRef: 'PM-SG-' + (2026000 + h.i), expectedPaise: R(78000), receivedPaise: h.i % 3 === 0 ? R(78000) : 0, submittedOn: iso(created) },
    })
    // payments: advance + final
    await db.payment.create({ data: { orderId: order.id, amountPaise: Math.round(total * 0.3), method: ['UPI', 'NEFT', 'CASH'][h.i % 3], kind: 'ADVANCE', reference: 'TX' + (700000 + h.i), receivedOn: iso(new Date(created.getTime() + 2 * 86400000)), recordedBy: accounts.id, createdAt: new Date(created.getTime() + 2 * 86400000) } })
    await db.payment.create({ data: { orderId: order.id, amountPaise: total - Math.round(total * 0.3), method: ['NEFT', 'UPI', 'CHEQUE'][h.i % 3], kind: 'FINAL', reference: 'TX' + (800000 + h.i), receivedOn: iso(new Date(installed.getTime() + 86400000)), recordedBy: accounts.id, createdAt: new Date(installed.getTime() + 86400000) } })
    await db.invoice.create({
      data: {
        invoiceNumber: num('INVOICE', 'INV'), customerId: customer.id, orderId: order.id, type: 'SALE',
        issueDate: iso(new Date(created.getTime() + 2 * 86400000)), subtotalPaise: subtotal - discount, taxPaise: tax, totalPaise: total, status: 'PAID',
        lines: { create: quoteLines.map(({ bl, qty }) => ({ productId: bl.productId, description: bl.product.name, qty, unitPricePaise: bl.product.salePricePaise, taxRateBp: bl.product.taxRateBp, lineTotalPaise: bl.product.salePricePaise * qty })) },
      },
    })

    // dispatch + units out of stock
    const dispatch = await db.dispatch.create({
      data: {
        dispatchNumber: num('DISPATCH', 'DSP'), orderId: order.id, status: 'DELIVERED',
        fromLocationId: wh.id, vehicleLocationId: veh.id, scheduledOn: iso(new Date(created.getTime() + 4 * 86400000)),
        packedBy: warehouseUser.id, departedAt: new Date(created.getTime() + 4 * 86400000), deliveredAt: new Date(created.getTime() + 4.5 * 86400000),
        createdAt: new Date(created.getTime() + 3 * 86400000),
      },
    })
    const installation = await db.installation.create({
      data: {
        orderId: order.id, status: 'COMPLETED', scheduledOn: iso(new Date(created.getTime() + 5 * 86400000)), slot: h.i % 2 ? 'AFTERNOON' : 'MORNING',
        crewLeadId: technicians[crewLeadIdx[h.i % 4]].userId,
        startedAt: new Date(installed.getTime() + 9 * 3600000), finishedAt: new Date(installed.getTime() + 16.5 * 3600000),
        installedCapacityKw: Math.round(panelCount * panelWp) / 1000, testReadingW: 2400 + (h.i % 6) * 150,
        checklist: JSON.stringify({ standsMounted: true, panelsLaid: true, wiringBoxes: true, earthingDone: true, powerTest: true }),
        signedName: h.name, signedAt: new Date(installed.getTime() + 16.5 * 3600000),
        signoffHash: createHash('sha256').update(order.id + h.name).digest('hex'),
        createdAt: new Date(created.getTime() + 3 * 86400000),
      },
    })
    const leadIdx = crewLeadIdx[h.i % 4]
    const crew = [technicians[leadIdx], technicians[(leadIdx + 2) % 15]]
    for (let ci = 0; ci < crew.length; ci++) {
      await db.installationCrew.create({ data: { installationId: installation.id, technicianId: crew[ci].id, role: ci === 0 ? 'LEAD' : 'MEMBER' } })
      await db.timeLog.create({
        data: { technicianId: crew[ci].id, installationId: installation.id, startedAt: new Date(installed.getTime() + 9 * 3600000), endedAt: new Date(installed.getTime() + (15 + ci * 0.5 + (h.lossMaking ? 3 : 0)) * 3600000), hourlyCostPaise: R(250) },
      })
    }
    // stock movements: serialized units + bulk
    const deliveredOn = iso(new Date(created.getTime() + 4.5 * 86400000))
    for (const { bl, qty } of quoteLines) {
      const p = bl.product
      if (p.isSerialized) {
        for (let u = 0; u < qty; u++) {
          const unit = await db.inventoryUnit.findFirst({ where: { productId: p.id, status: 'IN_STOCK', locationId: wh.id }, orderBy: { serialNumber: 'asc' } })
          if (!unit) break
          await db.inventoryUnit.update({
            where: { id: unit.id },
            data: { status: 'INSTALLED', locationId: sites.id, orderId: order.id, customerId: customer.id, installationId: installation.id, deliveredOn },
          })
          await db.stockMovement.create({ data: { productId: p.id, unitId: unit.id, qty: 1, fromLocationId: wh.id, toLocationId: veh.id, type: 'DISPATCH', unitCostPaise: unit.unitCostPaise, refType: 'dispatch', refId: dispatch.id, createdBy: warehouseUser.id, createdAt: new Date(created.getTime() + 4 * 86400000) } })
          await db.stockMovement.create({ data: { productId: p.id, unitId: unit.id, qty: 1, fromLocationId: veh.id, toLocationId: sites.id, type: 'DELIVERY', unitCostPaise: unit.unitCostPaise, refType: 'dispatch', refId: dispatch.id, createdBy: warehouseUser.id, createdAt: new Date(created.getTime() + 4.5 * 86400000) } })
          const level = await db.stockLevel.findUnique({ where: { productId_locationId: { productId: p.id, locationId: wh.id } } })
          if (level) {
            await db.stockLevel.update({ where: { productId_locationId: { productId: p.id, locationId: wh.id } }, data: { onHand: Math.max(0, level.onHand - 1), reserved: Math.max(0, level.reserved - 1) } })
          }
        }
        if (p.warrantyStartBasis === 'DELIVERY') {
          // warranty rows were created per unit above via helper below (kept simple: create here)
          const units = await db.inventoryUnit.findMany({ where: { installationId: installation.id, productId: p.id } })
          for (const unit of units) {
            const [y, m, d] = deliveredOn.split('-').map(Number)
            const end = new Date(Date.UTC(y, m - 1 + p.warrantyMonths, d - 1))
            await db.warranty.create({
              data: { unitId: unit.id, installationId: installation.id, customerId: customer.id, productId: p.id, coverage: 'EQUIPMENT', startDate: deliveredOn, endDate: iso(end), months: p.warrantyMonths, status: 'ACTIVE', source: 'DELIVERY' },
            })
          }
        }
      } else if (p.category !== 'SERVICE') {
        await db.stockMovement.create({ data: { productId: p.id, qty, fromLocationId: wh.id, toLocationId: veh.id, type: 'DISPATCH', unitCostPaise: p.stdCostPaise, refType: 'dispatch', refId: dispatch.id, createdBy: warehouseUser.id, createdAt: new Date(created.getTime() + 4 * 86400000) } })
        await db.stockMovement.create({ data: { productId: p.id, qty, fromLocationId: veh.id, toLocationId: sites.id, type: 'DELIVERY', unitCostPaise: p.stdCostPaise, refType: 'dispatch', refId: dispatch.id, createdBy: warehouseUser.id, createdAt: new Date(created.getTime() + 4.5 * 86400000) } })
        const level = await db.stockLevel.findUnique({ where: { productId_locationId: { productId: p.id, locationId: wh.id } } })
        if (level) {
          await db.stockLevel.update({ where: { productId_locationId: { productId: p.id, locationId: wh.id } }, data: { onHand: Math.max(0, level.onHand - qty), reserved: Math.max(0, level.reserved - qty) } })
        }
      }
    }
    // occasional project expense
    if (h.i % 3 === 1) {
      await db.expense.create({ data: { category: 'TRANSPORT', amountPaise: R(800 + (h.i % 4) * 250), incurredOn: iso(installed), orderId: order.id, description: 'Vehicle fuel and tolls', recordedBy: accounts.id } })
    }
    return { customer, order, installation }
  }

  // ── ~30 historical orders Aug–Oct 2026 ───────────────────────────
  const areas = ['Bopal', 'Satellite', 'Vastrapur', 'Maninagar', 'Chandkheda', 'Naroda', 'Gota', 'Ranip']
  const firstNames = ['Aarav', 'Diya', 'Ishaan', 'Kavya', 'Rohan', 'Sara', 'Arjun', 'Nisha', 'Dev', 'Anaya', 'Kabir', 'Riya', 'Vivaan', 'Meera', 'Advik', 'Tara', 'Reyansh', 'Zara', 'Aryan', 'Ira', 'Neev', 'Myra', 'Shaurya', 'Aleena', 'Atharv', 'Samaira', 'Veer', 'Kiara', 'Rudra', 'Pari']
  const lastNames = ['Patel', 'Shah', 'Mehta', 'Desai', 'Trivedi', 'Joshi', 'Bhatt', 'Solanki', 'Prajapati', 'Rathod']
  let idx = 0
  for (let d = 88; d >= 6; d -= 3) {
    const i = idx++
    const fn = firstNames[i % firstNames.length]
    const ln = lastNames[i % lastNames.length]
    const onGrid = i % 5 !== 4 // every 5th off-grid
    const capacity = [1, 2, 3, 3, 4, 5, 3, 2, 3, 5][i % 10]
    const templateCode = onGrid ? `ONG${capacity}KW` : (capacity <= 2 ? 'OFFG2KW' : capacity === 3 ? 'OFFG3KW' : 'OFFG5KW')
    const loss = i === 11
    await completedChain({
      i, name: `${fn} ${ln}`, phone: `+9190000${String(10000 + i * 7).slice(-5)}`, area: areas[i % areas.length],
      templateCode, capacityKw: onGrid ? capacity : Math.min(capacity, 5),
      createdDaysAgo: d, status: i % 7 === 6 ? 'INSTALLED' : 'CLOSED',
      discountRs: loss ? 48000 : i % 4 === 0 ? 3000 : 0, lossMaking: loss,
      systemType: onGrid ? 'ON_GRID' : 'OFF_GRID',
    })
  }
  console.log(`  ${idx} historical orders done`)

  // ── the two warranty-demo installations ─────────────────────────
  // May 2025 (IN warranty) — the spec's worked example: serial INV3K-24A-001873
  {
    const customer = await db.customer.create({
      data: {
        customerNumber: num('CUSTOMER', 'C'), name: 'Bhavesh Patel', phone: '+919000000021',
        addressLine: '41 Green Park Society, Nr Sun-n-Step Club', addressNorm: '41 green park society nr sun n step club 380015',
        city: 'Ahmedabad', pincode: '380015', type: 'HOME', consentAt: new Date('2025-04-20'), consumerNo: 'DGVV303045', discom: 'DGVCL',
      },
    })
    const created = new Date('2025-04-22')
    const lead = await db.lead.create({
      data: { leadNumber: 'L-2025-0031', customerId: customer.id, source: 'WHATSAPP', status: 'WON', ownerId: sales1.id, requestedCapacityKw: 3, systemTypePref: 'ON_GRID', wantsSubsidy: true, monthlyBillPaise: R(3200), tariffPaise: R(7), roofAreaSqm: 35, gridOk: true, sanctionedLoadKw: 5, firstContactedAt: created, slaDueAt: created, createdAt: created },
    })
    const template = (await db.systemTemplate.findUnique({ where: { code: 'ONG3KW' }, include: { bomLines: { include: { product: true } } } }))!
    const quote = await db.quote.create({
      data: {
        quoteNumber: 'Q-2025-0028', leadId: lead.id, customerId: customer.id, templateId: template.id, status: 'ACCEPTED',
        version: 1, capacityKw: 3, systemType: 'ON_GRID', cableDistanceM: 22, subtotalPaise: R(195000), discountPaise: 0,
        taxPaise: R(29500), totalPaise: R(224500), subsidyEstimatePaise: R(78000), validUntil: '2025-05-10',
        sentAt: created, acceptedAt: new Date('2025-04-28'), acceptedName: 'Bhavesh Patel', createdAt: created,
        lines: { create: template.bomLines.map((bl) => ({ productId: bl.productId, description: bl.product.name, qty: 1, unitPricePaise: bl.product.salePricePaise, taxRateBp: bl.product.taxRateBp, lineTotalPaise: bl.product.salePricePaise, rule: bl.rule })) },
      },
    })
    const order = await db.order.create({
      data: {
        orderNumber: 'SO-2025-0022', quoteId: quote.id, customerId: customer.id, status: 'CLOSED', capacityKw: 3, systemType: 'ON_GRID',
        subtotalPaise: R(195000), taxPaise: R(29500), totalPaise: R(224500), advanceRequiredPaise: R(67350), paidPaise: R(224500),
        confirmedAt: new Date('2025-04-29'), createdAt: created,
        lines: { create: template.bomLines.map((bl) => ({ productId: bl.productId, description: bl.product.name, qty: 1, unitPricePaise: bl.product.salePricePaise, taxRateBp: bl.product.taxRateBp, qtyReserved: 1, qtyDispatched: 1 })) },
      },
    })
    const installation = await db.installation.create({
      data: {
        orderId: order.id, status: 'COMPLETED', scheduledOn: '2025-05-04', slot: 'MORNING', crewLeadId: technicians[0].userId,
        startedAt: new Date('2025-05-05T03:30:00Z'), finishedAt: new Date('2025-05-05T11:00:00Z'),
        installedCapacityKw: 3.24, testReadingW: 2610,
        checklist: JSON.stringify({ standsMounted: true, panelsLaid: true, wiringBoxes: true, earthingDone: true, powerTest: true }),
        signedName: 'Bhavesh Patel', signedAt: new Date('2025-05-05T11:00:00Z'),
        signoffHash: createHash('sha256').update(order.id + 'Bhavesh').digest('hex'), createdAt: created,
      },
    })
    // units + warranties: delivered 5 May 2025 (in warranty until 4 May 2027)
    const deliveredOn = '2025-05-05'
    const mkUnit = async (sku: string, serial: string) => {
      const p = (await db.product.findUnique({ where: { sku } }))!
      const unit = await db.inventoryUnit.findFirst({ where: { productId: p.id, status: 'IN_STOCK', locationId: wh.id } })
      const data = { status: 'INSTALLED', locationId: sites.id, orderId: order.id, customerId: customer.id, installationId: installation.id, deliveredOn }
      let id: string
      if (unit) {
        await db.inventoryUnit.update({ where: { id: unit.id }, data: { ...data, serialNumber: serial, qrCode: nextQr() } })
        id = unit.id
        const level = await db.stockLevel.findUnique({ where: { productId_locationId: { productId: p.id, locationId: wh.id } } })
        if (level) await db.stockLevel.update({ where: { productId_locationId: { productId: p.id, locationId: wh.id } }, data: { onHand: Math.max(0, level.onHand - 1), reserved: Math.max(0, level.reserved - 1) } })
      } else {
        const created = await db.inventoryUnit.create({ data: { productId: p.id, serialNumber: serial, qrCode: nextQr(), unitCostPaise: p.stdCostPaise, ...data } })
        id = created.id
      }
      const end = new Date(Date.UTC(2025, 4 + p.warrantyMonths, 4))
      await db.warranty.create({ data: { unitId: id, installationId: installation.id, customerId: customer.id, productId: p.id, coverage: 'EQUIPMENT', startDate: deliveredOn, endDate: iso(end), months: p.warrantyMonths, status: 'ACTIVE', source: 'DELIVERY' } })
      return id
    }
    const invUnitId = await mkUnit('INV-ONG-3K', 'INV3K-24A-001873') // spec's example serial
    for (let pn = 1; pn <= 6; pn++) await mkUnit('PNL-540', `PNL540-24A-00${pn}42`)
    await mkUnit('CC-60A', 'CC60-24A-000731')
    await db.payment.create({ data: { orderId: order.id, amountPaise: R(67350), method: 'UPI', kind: 'ADVANCE', receivedOn: '2025-04-29', recordedBy: accounts.id } })
    await db.payment.create({ data: { orderId: order.id, amountPaise: R(224500) - R(67350), method: 'NEFT', kind: 'FINAL', receivedOn: '2025-05-06', recordedBy: accounts.id } })
    console.log('  May 2025 in-warranty install seeded')
    void invUnitId
  }

  // March 2023 (OUT of warranty on the inverter; panels still covered)
  {
    const customer = await db.customer.create({
      data: {
        customerNumber: num('CUSTOMER', 'C'), name: 'Ramesh Chauhan', phone: '+919000000014',
        addressLine: '8 Kalyan Flats, Krishnanagar', addressNorm: '8 kalyan flats krishnanagar 381110', city: 'Ahmedabad', pincode: '381110',
        type: 'SMALL_FACTORY', consentAt: new Date('2023-02-01'), consumerNo: 'DGVV111260', discom: 'DGVCL',
      },
    })
    const created = new Date('2023-02-05')
    const lead = await db.lead.create({
      data: { leadNumber: 'L-2023-0007', customerId: customer.id, source: 'PHONE', status: 'WON', ownerId: sales2.id, requestedCapacityKw: 3, systemTypePref: 'ON_GRID', wantsSubsidy: false, monthlyBillPaise: R(4500), tariffPaise: R(7.5), roofAreaSqm: 60, gridOk: true, sanctionedLoadKw: 8, firstContactedAt: created, slaDueAt: created, createdAt: created },
    })
    const template = (await db.systemTemplate.findUnique({ where: { code: 'ONG3KW' } }))!
    const quote = await db.quote.create({
      data: { quoteNumber: 'Q-2023-0005', leadId: lead.id, customerId: customer.id, templateId: template.id, status: 'ACCEPTED', version: 1, capacityKw: 3, systemType: 'ON_GRID', cableDistanceM: 30, subtotalPaise: R(210000), taxPaise: R(31800), totalPaise: R(241800), subsidyEstimatePaise: 0, validUntil: '2023-03-01', sentAt: created, acceptedAt: new Date('2023-02-15'), acceptedName: 'Ramesh Chauhan', createdAt: created, lines: { create: { productId: products['INV-ONG-3K'], description: '3 kW on-grid system', qty: 1, unitPricePaise: R(210000), taxRateBp: 1800, lineTotalPaise: R(210000) } } },
    })
    const order = await db.order.create({
      data: { orderNumber: 'SO-2023-0004', quoteId: quote.id, customerId: customer.id, status: 'CLOSED', capacityKw: 3, systemType: 'ON_GRID', subtotalPaise: R(210000), taxPaise: R(31800), totalPaise: R(241800), advanceRequiredPaise: R(72540), paidPaise: R(241800), confirmedAt: new Date('2023-02-16'), createdAt: created, lines: { create: { productId: products['INV-ONG-3K'], description: '3 kW on-grid system', qty: 1, unitPricePaise: R(210000), taxRateBp: 1800, qtyReserved: 1, qtyDispatched: 1 } } },
    })
    const installation = await db.installation.create({
      data: { orderId: order.id, status: 'COMPLETED', scheduledOn: '2023-03-08', slot: 'MORNING', crewLeadId: technicians[3].userId, startedAt: new Date('2023-03-10T03:30:00Z'), finishedAt: new Date('2023-03-10T11:30:00Z'), installedCapacityKw: 3.24, testReadingW: 2550, checklist: JSON.stringify({ standsMounted: true, panelsLaid: true, wiringBoxes: true, earthingDone: true, powerTest: true }), signedName: 'Ramesh Chauhan', signedAt: new Date('2023-03-10T11:30:00Z'), signoffHash: createHash('sha256').update(order.id + 'Ramesh').digest('hex'), createdAt: created },
    })
    const deliveredOn = '2023-03-10'
    const mkUnit23 = async (sku: string, serialNumber: string) => {
      const p = (await db.product.findUnique({ where: { sku } }))!
      const unit = await db.inventoryUnit.create({ data: { productId: p.id, serialNumber, qrCode: nextQr(), status: 'INSTALLED', locationId: sites.id, unitCostPaise: p.stdCostPaise, orderId: order.id, customerId: customer.id, installationId: installation.id, deliveredOn } })
      const end = new Date(Date.UTC(2023, 2 + p.warrantyMonths, 9))
      await db.warranty.create({ data: { unitId: unit.id, installationId: installation.id, customerId: customer.id, productId: p.id, coverage: 'EQUIPMENT', startDate: deliveredOn, endDate: iso(end), months: p.warrantyMonths, status: 'ACTIVE', source: 'DELIVERY' } })
    }
    await mkUnit23('INV-ONG-3K', 'INV3K-23A-000212') // out of warranty since 9 Mar 2025
    for (let pn = 1; pn <= 6; pn++) await mkUnit23('PNL-540', `PNL540-23A-00${pn}08`)
    await mkUnit23('CC-60A', 'CC60-23A-000119')
    await db.payment.create({ data: { orderId: order.id, amountPaise: R(72540), method: 'CASH', kind: 'ADVANCE', receivedOn: '2023-02-16', recordedBy: accounts.id } })
    await db.payment.create({ data: { orderId: order.id, amountPaise: R(241800) - R(72540), method: 'NEFT', kind: 'FINAL', receivedOn: '2023-03-13', recordedBy: accounts.id } })
    console.log('  March 2023 out-of-warranty install seeded')
  }

  // ── background pipeline leads (board + alerts) ──────────────────
  const bgLead = async (name: string, phone: string, status: string, daysBack: number, owner: string, extra: Record<string, unknown> = {}) => {
    const customer = await db.customer.create({
      data: { customerNumber: num('CUSTOMER', 'C'), name, phone, addressLine: `${Math.floor(Math.random() * 90) + 5} ${['Silver Oak', 'Palm Green', 'Shanti Villas'][Math.floor(Math.random() * 3)]}, Bopal`, addressNorm: 'bopal 380058', city: 'Ahmedabad', pincode: '380058', consentAt: daysAgo(daysBack) },
    })
    return db.lead.create({
      data: {
        leadNumber: num('LEAD', 'L'), customerId: customer.id, source: 'WEB_FORM', status, ownerId: owner,
        requestedCapacityKw: 3, systemTypePref: 'ON_GRID', wantsSubsidy: true, monthlyBillPaise: R(2800),
        tariffPaise: R(7), slaDueAt: daysAgo(daysBack - 0.5), createdAt: daysAgo(daysBack), updatedAt: daysAgo(daysBack), ...extra,
      },
    })
  }
  await bgLead('Nirali Kapadia', '+919812345601', 'NEW', 1.2, sales1.id) // SLA fine
  await bgLead('Sandeep Gupta', '+919812345602', 'NEW', 0.3, sales2.id)
  await bgLead('Farida Mistry', '+919812345603', 'CONTACTED', 3, sales1.id, { firstContactedAt: daysAgo(2.8) })
  await bgLead('Hitesh Dave', '+919812345604', 'QUALIFIED', 5, sales2.id, { firstContactedAt: daysAgo(4.8), roofAreaSqm: 42, gridOk: true, sanctionedLoadKw: 5 })

  // a PENDING_ADVANCE order awaiting a payment (step 5 pre-demo state option)
  {
    const customer = await mkCustomer(91, 'Jignesh Kansara', '+919812345678', 'Gota')
    const lead = await db.lead.create({
      data: { leadNumber: num('LEAD', 'L'), customerId: customer.id, source: 'REFERRAL', status: 'WON', ownerId: sales1.id, requestedCapacityKw: 5, systemTypePref: 'ON_GRID', wantsSubsidy: true, monthlyBillPaise: R(5200), tariffPaise: R(7), roofAreaSqm: 80, gridOk: true, sanctionedLoadKw: 8, firstContactedAt: daysAgo(12), slaDueAt: daysAgo(12), createdAt: daysAgo(12) },
    })
    const template = (await db.systemTemplate.findUnique({ where: { code: 'ONG5KW' }, include: { bomLines: { include: { product: true } }, panelProduct: true } }))!
    const panelCount = Math.ceil(5000 / (template.panelProduct?.ratedPowerW ?? 540))
    const cableM = 26
    const ql = template.bomLines.map((bl) => {
      let qty = bl.value
      if (bl.rule === 'PANEL_COUNT') qty = panelCount
      else if (bl.rule === 'PER_PANEL') qty = bl.value * panelCount
      else if (bl.rule === 'PER_KW') qty = Math.ceil(bl.value * 5)
      else if (bl.rule === 'PER_CABLE_METER') qty = Math.ceil(bl.value * cableM + (bl.allowance ?? 0))
      return { bl, qty }
    })
    const subtotal = ql.reduce((s, { bl, qty }) => s + bl.product.salePricePaise * qty, 0)
    const tax = ql.reduce((s, { bl, qty }) => s + Math.round((bl.product.salePricePaise * qty * bl.product.taxRateBp) / 10000), 0)
    const total = subtotal + tax
    const quote = await db.quote.create({
      data: { quoteNumber: num('QUOTE', 'Q'), leadId: lead.id, customerId: customer.id, templateId: template.id, status: 'ACCEPTED', version: 1, capacityKw: 5, systemType: 'ON_GRID', cableDistanceM: cableM, subtotalPaise: subtotal, taxPaise: tax, totalPaise: total, subsidyEstimatePaise: R(78000), validUntil: iso(daysAgo(-10)), sentAt: daysAgo(11), acceptedAt: daysAgo(10), acceptedName: 'Jignesh Kansara', createdAt: daysAgo(12), lines: { create: ql.map(({ bl, qty }) => ({ productId: bl.productId, description: bl.product.name, qty, unitPricePaise: bl.product.salePricePaise, taxRateBp: bl.product.taxRateBp, lineTotalPaise: bl.product.salePricePaise * qty, rule: bl.rule })) } },
    })
    await db.order.create({
      data: { orderNumber: num('ORDER', 'SO'), quoteId: quote.id, customerId: customer.id, status: 'PENDING_ADVANCE', capacityKw: 5, systemType: 'ON_GRID', subtotalPaise: subtotal, taxPaise: tax, totalPaise: total, advanceRequiredPaise: Math.round(total * 0.3), paidPaise: 0, createdAt: daysAgo(10), lines: { create: ql.map(({ bl, qty }) => ({ productId: bl.productId, description: bl.product.name, qty, unitPricePaise: bl.product.salePricePaise, taxRateBp: bl.product.taxRateBp })) } },
    })
  }

  // ── outbox history + number sequences ───────────────────────────
  await db.outbox.createMany({
    data: [
      { channel: 'SMS', recipient: '+91900XXXXXX21', template: 'PORTAL_LINK', payload: JSON.stringify({ name: 'Bhavesh Patel', link: '/p/demo' }), status: 'DELIVERED', attempts: 1, sentAt: daysAgo(40), deliveredAt: daysAgo(40), idempotencyKey: 'seed-1', providerMessageId: 'prov-seed-1' },
      { channel: 'EMAIL', recipient: 'warehouse@sunpower.example', template: 'ORDER_CONFIRMED_WAREHOUSE', payload: JSON.stringify({ orderNumber: 'SO-2026-0028' }), status: 'DELIVERED', attempts: 1, sentAt: daysAgo(12), deliveredAt: daysAgo(12), idempotencyKey: 'seed-2', providerMessageId: 'prov-seed-2' },
      { channel: 'SMS', recipient: '+91981XXXXXX04', template: 'TICKET_OPENED', payload: JSON.stringify({ name: 'Hitesh Dave', ticketNumber: 'T-2026-0001' }), status: 'SENT', attempts: 1, sentAt: daysAgo(2), idempotencyKey: 'seed-3' },
    ],
  })

  const setSeq = (name: string, used: number) => db.numberSequence.create({ data: { name, year: 2026, nextValue: used + 1 } })
  for (const [name, used] of Object.entries(seq)) await setSeq(name, used)
  // historical 2023/2025 sequences
  await db.numberSequence.create({ data: { name: 'CUSTOMER', year: 2025, nextValue: 40 } })
  await db.numberSequence.create({ data: { name: 'CUSTOMER', year: 2023, nextValue: 10 } })

  console.log('Seed complete ✓')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
