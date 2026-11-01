import { db } from '../src/lib/db'
import { randomBytes, createHash } from 'crypto'
import { issueLink } from '../src/lib/access-links'

const R = (rupees: number) => Math.round(rupees * 100) // rupees -> paise
const iso = (d: Date) => d.toISOString().slice(0, 10)

function nextQr(): string {
  return 'SP' + randomBytes(4).toString('hex').toUpperCase()
}

function randHex(bytes: number): string {
  return randomBytes(bytes).toString('hex').toUpperCase()
}

const CITIES = [
  { city: 'Ahmedabad', areas: ['Bopal', 'Satellite', 'Vastrapur', 'Maninagar', 'Chandkheda', 'Naroda', 'Gota', 'Ranip', 'Navrangpura', 'Bodakdev', 'Paldi', 'Thaltej', 'Prahlad Nagar'], pincodes: ['380015', '380054', '380058', '380008', '382424', '382330', '382481'], discom: 'UGVCL', prefix: 'UGV' },
  { city: 'Gandhinagar', areas: ['Sector 2', 'Sector 7', 'Sector 11', 'Sector 21', 'Kudasan', 'Infocity', 'Raysan', 'Sargasan'], pincodes: ['382007', '382010', '382016', '382021', '382421'], discom: 'UGVCL', prefix: 'GN' },
  { city: 'Vadodara', areas: ['Alkapuri', 'Gotri', 'Manjalpur', 'Karelibaug', 'Fatehgunj', 'Akota', 'Vasna Road', 'Gorwa'], pincodes: ['390007', '390021', '390011', '390018', '390002'], discom: 'MGVCL', prefix: 'MGV' },
  { city: 'Surat', areas: ['Adajan', 'Vesu', 'Piplod', 'Varachha', 'Katargam', 'City Light', 'Rander', 'Pal'], pincodes: ['395009', '395007', '395006', '395004', '395001'], discom: 'DGVCL', prefix: 'DGVV' },
  { city: 'Rajkot', areas: ['Kalawad Road', 'University Road', '150 Feet Ring Road', 'Yagnik Road', 'Nana Mava', 'Madhapar'], pincodes: ['360005', '360004', '360007', '360001', '360002'], discom: 'PGVCL', prefix: 'PGV' },
  { city: 'Anand', areas: ['Vallabh Vidyanagar', 'Gamdi', 'Bakrol', 'Boriavi', 'Town Center'], pincodes: ['388001', '388120', '388315'], discom: 'MGVCL', prefix: 'AND' },
  { city: 'Bhavnagar', areas: ['Kalanala', 'Vidhyanagar', 'Ghogha Circle', 'Subhashnagar'], pincodes: ['364001', '364002', '364003'], discom: 'PGVCL', prefix: 'BHV' },
  { city: 'Bharuch', areas: ['Zadeshwar', 'Bholav', 'GNFC Township', 'Link Road'], pincodes: ['392001', '392002', '392012'], discom: 'DGVCL', prefix: 'BRC' },
  { city: 'Mehsana', areas: ['Radhanpur Road', 'Nagalpur', 'Modhera Road', 'Dediyasan'], pincodes: ['384001', '384002'], discom: 'UGVCL', prefix: 'MSN' },
  { city: 'Navsari', areas: ['Lunsikui', 'Chhapra Road', 'Station Road', 'Vijalpor'], pincodes: ['396445', '396450'], discom: 'DGVCL', prefix: 'NAV' },
]

const FIRST_NAMES = [
  'Rajesh', 'Sanjay', 'Ananya', 'Pooja', 'Vikram', 'Sneha', 'Amit', 'Priya', 'Suresh', 'Neha',
  'Mehul', 'Bhavna', 'Kirit', 'Chetna', 'Manish', 'Hetal', 'Nitin', 'Darshana', 'Chirag', 'Komal',
  'Paresh', 'Rupal', 'Hasmukh', 'Hansa', 'Mayur', 'Shilpa', 'Hardik', 'Jagruti', 'Bhavesh', 'Shweta',
  'Tushar', 'Vandana', 'Jignesh', 'Tejal', 'Kalpesh', 'Kinjal', 'Nilesh', 'Geeta', 'Pratik', 'Dimple',
  'Ashok', 'Rekha', 'Mahesh', 'Varsha', 'Ketan', 'Urvashi', 'Girish', 'Bina', 'Bharat', 'Kavita',
]

const LAST_NAMES = [
  'Patel', 'Shah', 'Mehta', 'Desai', 'Trivedi', 'Joshi', 'Bhatt', 'Solanki', 'Prajapati', 'Rathod',
  'Vaghela', 'Chauhan', 'Parmar', 'Pandya', 'Dave', 'Shukla', 'Soni', 'Parekh', 'Zala', 'Modh',
  'Barot', 'Kothari', 'Raval', 'Makwana', 'Panchal',
]

async function seed200() {
  console.log('🚀 Starting seed of 200 customers with accepted orders across past 2 years…')

  // Load prerequisites from DB
  const salesUsers = await db.user.findMany({ where: { role: 'SALES' } })
  const accountsUser = await db.user.findFirst({ where: { role: 'ACCOUNTS' } })
  const warehouseUser = await db.user.findFirst({ where: { role: 'WAREHOUSE' } })
  const technicians = await db.technician.findMany({ include: { user: true } })
  const crewLeads = technicians.filter(t => t.isCrewLead)

  const wh = await db.stockLocation.findFirst({ where: { code: 'WH1' } })
  const veh = await db.stockLocation.findFirst({ where: { code: 'VEH1' } })
  const sites = await db.stockLocation.findFirst({ where: { code: 'SITES' } })

  if (!wh || !veh || !sites || !accountsUser || !warehouseUser || salesUsers.length === 0 || technicians.length === 0) {
    throw new Error('Base locations, users or technicians missing. Run base seed first.')
  }

  // Load products & system templates with BOM lines
  const allProducts = await db.product.findMany()
  const prodMap = new Map(allProducts.map(p => [p.sku, p]))
  const templates = await db.systemTemplate.findMany({
    include: {
      bomLines: { include: { product: true }, orderBy: { sortOrder: 'asc' } },
      panelProduct: true,
    },
  })
  const templateMap = new Map(templates.map(t => [t.code, t]))

  // Find max current sequence numbers to avoid unique constraint collisions
  const existingOrdersCount = await db.order.count()
  const existingCustomersCount = await db.customer.count()
  let seqOffset = Math.max(existingOrdersCount, existingCustomersCount, 100) + 10

  const now = Date.now() // current time (Nov 1, 2026)
  const TWO_YEARS_MS = 730 * 86400000

  // Clean up any previous partial 200-seed data (customer numbers ending in 0101+)
  const custs = await db.customer.findMany({
    where: {
      OR: [
        { customerNumber: { startsWith: 'C-2024-01' } },
        { customerNumber: { startsWith: 'C-2025-02' } },
        { customerNumber: { startsWith: 'C-2026-05' } },
      ],
    },
    select: { id: true },
  })
  if (custs.length > 0) {
    const ids = custs.map(c => c.id)
    await db.serviceTicket.deleteMany({ where: { customerId: { in: ids } } })
    await db.warranty.deleteMany({ where: { customerId: { in: ids } } })
    const units = await db.inventoryUnit.findMany({ where: { customerId: { in: ids } }, select: { id: true } })
    const unitIds = units.map(u => u.id)
    if (unitIds.length > 0) {
      await db.stockMovement.deleteMany({ where: { unitId: { in: unitIds } } })
    }
    await db.inventoryUnit.deleteMany({ where: { customerId: { in: ids } } })
    await db.installationCrew.deleteMany({ where: { installation: { order: { customerId: { in: ids } } } } })
    await db.timeLog.deleteMany({ where: { installation: { order: { customerId: { in: ids } } } } })
    await db.installation.deleteMany({ where: { order: { customerId: { in: ids } } } })
    await db.dispatchLine.deleteMany({ where: { dispatch: { order: { customerId: { in: ids } } } } })
    await db.dispatch.deleteMany({ where: { order: { customerId: { in: ids } } } })
    await db.subsidyApplication.deleteMany({ where: { order: { customerId: { in: ids } } } })
    await db.invoiceLine.deleteMany({ where: { invoice: { customerId: { in: ids } } } })
    await db.invoice.deleteMany({ where: { customerId: { in: ids } } })
    await db.payment.deleteMany({ where: { order: { customerId: { in: ids } } } })
    await db.orderLine.deleteMany({ where: { order: { customerId: { in: ids } } } })
    await db.order.deleteMany({ where: { customerId: { in: ids } } })
    await db.quoteLine.deleteMany({ where: { quote: { customerId: { in: ids } } } })
    await db.quote.deleteMany({ where: { customerId: { in: ids } } })
    await db.lead.deleteMany({ where: { customerId: { in: ids } } })
    await db.customerAccessLink.deleteMany({ where: { customerId: { in: ids } } })
    await db.customer.deleteMany({ where: { id: { in: ids } } })
  }

  const yearCounters: Record<string, number> = { '2024': 100, '2025': 200, '2026': 500 }
  let createdCount = 0

  // 200 distinct customer chains
  for (let i = 0; i < 200; i++) {
    const fn = FIRST_NAMES[i % FIRST_NAMES.length]
    const ln = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length]
    const fullName = `${fn} ${ln}`
    const cityObj = CITIES[i % CITIES.length]
    const area = cityObj.areas[i % cityObj.areas.length]
    const pincode = cityObj.pincodes[i % cityObj.pincodes.length]
    const phone = `+9198${String(10000000 + i * 4391 + 7).slice(-8)}`
    const email = `${fn.toLowerCase()}.${ln.toLowerCase()}.${100 + i}@gmail.com`
    const customerType = i % 10 === 0 ? 'COMMERCIAL' : i % 7 === 0 ? 'SMALL_FACTORY' : 'HOME'

    // Timeline distribution across past 2 years (from 725 days ago down to 3 days ago)
    const daysAgoCount = Math.round(725 - (i * 720 / 199))
    const createdDate = new Date(now - daysAgoCount * 86400000)
    const year = createdDate.getUTCFullYear()
    const yearCode = String(year).slice(-2) + String.fromCharCode(65 + (createdDate.getUTCMonth() % 26))

    const acceptedDate = new Date(createdDate.getTime() + (1 + (i % 3)) * 86400000)
    const confirmedDate = new Date(acceptedDate.getTime() + 86400000)
    const dispatchedDate = new Date(confirmedDate.getTime() + 2 * 86400000)
    const deliveredDate = new Date(dispatchedDate.getTime() + 0.5 * 86400000)
    const installedDate = new Date(deliveredDate.getTime() + 0.5 * 86400000)

    // Order status lifecycle based on age
    let orderStatus: 'CLOSED' | 'INSTALLED' | 'CONFIRMED' | 'PENDING_ADVANCE' = 'CLOSED'
    if (daysAgoCount < 10) {
      orderStatus = i % 2 === 0 ? 'PENDING_ADVANCE' : 'CONFIRMED'
    } else if (daysAgoCount < 35) {
      orderStatus = 'INSTALLED'
    } else {
      orderStatus = 'CLOSED'
    }

    // Capacity & Template selection
    const isOffGrid = i % 5 === 4 && customerType !== 'COMMERCIAL'
    const capacityKw = isOffGrid
      ? ([2, 3, 5][i % 3])
      : ([1, 2, 3, 3, 4, 5, 3, 5, 2, 3][i % 10])
    const templateCode = isOffGrid
      ? (capacityKw === 2 ? 'OFFG2KW' : capacityKw === 3 ? 'OFFG3KW' : 'OFFG5KW')
      : `ONG${capacityKw}KW`

    const template = templateMap.get(templateCode)!
    if (!template) continue

    const panelWp = template.panelProduct?.ratedPowerW ?? 540
    const panelCount = Math.ceil((capacityKw * 1000) / panelWp)
    const cableM = 16 + (i % 14)

    // Calculate BOM & Prices
    const quoteLines = template.bomLines.map(bl => {
      let qty = bl.value
      if (bl.rule === 'PANEL_COUNT') qty = panelCount
      else if (bl.rule === 'PER_PANEL') qty = bl.value * panelCount
      else if (bl.rule === 'PER_KW') qty = Math.ceil(bl.value * capacityKw)
      else if (bl.rule === 'PER_CABLE_METER') qty = Math.ceil(bl.value * cableM + (bl.allowance ?? 0))
      return { bl, qty }
    })

    const subtotalPaise = quoteLines.reduce((s, { bl, qty }) => s + bl.product.salePricePaise * qty, 0)
    const discountPaise = i % 6 === 0 ? R(3000 + (i % 5) * 1000) : 0
    const taxPaise = quoteLines.reduce((s, { bl, qty }) => s + Math.round((bl.product.salePricePaise * qty * bl.product.taxRateBp) / 10000), 0)
    const totalPaise = subtotalPaise - discountPaise + taxPaise
    const advanceRequiredPaise = Math.round(totalPaise * 0.3)
    const subsidyPaise = !isOffGrid && customerType === 'HOME'
      ? (capacityKw === 1 ? R(30000) : capacityKw === 2 ? R(60000) : R(78000))
      : 0

    const yearStr = String(year)
    yearCounters[yearStr] = (yearCounters[yearStr] ?? 100) + 1
    const currentSeq = yearCounters[yearStr]
    const customerNumber = `C-${year}-${String(currentSeq).padStart(4, '0')}`
    const leadNumber = `L-${year}-${String(currentSeq).padStart(4, '0')}`
    const quoteNumber = `Q-${year}-${String(currentSeq).padStart(4, '0')}`
    const orderNumber = `SO-${year}-${String(currentSeq).padStart(4, '0')}`
    const invoiceNumber = `INV-${year}-${String(currentSeq).padStart(4, '0')}`
    const dispatchNumber = `DSP-${year}-${String(currentSeq).padStart(4, '0')}`

    // 1. Customer
    const addressLine = `${14 + (i % 120)} ${['Shreeji Residency', 'Surya Enclave', 'Radhe Shyam Park', 'Green Acres', 'Vrindavan Heights', 'Omkar Villa', 'Silver Palm'][i % 7]}, ${area}`
    const customer = await db.customer.create({
      data: {
        customerNumber,
        name: fullName,
        phone,
        email,
        addressLine,
        addressNorm: addressLine.toLowerCase() + ' ' + pincode,
        city: cityObj.city,
        pincode,
        type: customerType,
        consentAt: createdDate,
        consumerNo: `${cityObj.prefix}${100000 + i}`,
        discom: cityObj.discom,
      },
    })

    // 2. Customer Access Link for Portal
    const { token } = await issueLink(customer.id, 'PORTAL', null, 90)

    // 3. Lead (WON)
    const sales = salesUsers[i % salesUsers.length]
    const lead = await db.lead.create({
      data: {
        leadNumber,
        customerId: customer.id,
        source: (['WEB_FORM', 'WHATSAPP', 'PHONE', 'REFERRAL', 'EXPO'] as const)[i % 5],
        status: 'WON',
        ownerId: sales.id,
        requestedCapacityKw: capacityKw,
        systemTypePref: isOffGrid ? 'OFF_GRID' : 'ON_GRID',
        wantsSubsidy: subsidyPaise > 0,
        monthlyBillPaise: R(2200 + capacityKw * 950),
        tariffPaise: R(7),
        roofAreaSqm: 30 + capacityKw * 14,
        gridOk: true,
        sanctionedLoadKw: Math.max(3, capacityKw + 2),
        firstContactedAt: createdDate,
        slaDueAt: createdDate,
        createdAt: createdDate,
        updatedAt: createdDate,
      },
    })

    // 4. Quote (ACCEPTED)
    const quote = await db.quote.create({
      data: {
        quoteNumber,
        leadId: lead.id,
        customerId: customer.id,
        templateId: template.id,
        status: 'ACCEPTED',
        version: 1,
        capacityKw,
        systemType: template.systemType,
        cableDistanceM: cableM,
        subtotalPaise,
        discountPaise,
        taxPaise,
        totalPaise,
        subsidyEstimatePaise: subsidyPaise,
        estimatedMarginBp: 2350,
        validUntil: iso(new Date(createdDate.getTime() + 15 * 86400000)),
        sentAt: createdDate,
        acceptedAt: acceptedDate,
        acceptedName: fullName,
        createdAt: createdDate,
        lines: {
          create: quoteLines.map(({ bl, qty }) => ({
            productId: bl.productId,
            description: bl.product.name,
            qty,
            unitPricePaise: bl.product.salePricePaise,
            taxRateBp: bl.product.taxRateBp,
            lineTotalPaise: bl.product.salePricePaise * qty,
            rule: bl.rule,
          })),
        },
      },
    })

    // 5. Order
    let paidPaise = 0
    if (orderStatus === 'CLOSED' || orderStatus === 'INSTALLED') {
      paidPaise = totalPaise
    } else if (orderStatus === 'CONFIRMED') {
      paidPaise = advanceRequiredPaise
    }

    const order = await db.order.create({
      data: {
        orderNumber,
        quoteId: quote.id,
        customerId: customer.id,
        status: orderStatus,
        capacityKw,
        systemType: template.systemType,
        siteSnapshot: JSON.stringify({ address: addressLine, cableDistanceM: cableM }),
        subtotalPaise,
        discountPaise,
        taxPaise,
        totalPaise,
        advanceRequiredPaise,
        paidPaise,
        confirmedAt: orderStatus !== 'PENDING_ADVANCE' ? confirmedDate : null,
        createdAt: createdDate,
        lines: {
          create: quoteLines.map(({ bl, qty }) => ({
            productId: bl.productId,
            description: bl.product.name,
            qty,
            unitPricePaise: bl.product.salePricePaise,
            taxRateBp: bl.product.taxRateBp,
            qtyReserved: orderStatus !== 'PENDING_ADVANCE' ? qty : 0,
            qtyDispatched: (orderStatus === 'CLOSED' || orderStatus === 'INSTALLED') ? qty : 0,
          })),
        },
      },
    })

    // 6. Payments (Advance & Final)
    const paymentMethods = ['UPI', 'NEFT', 'CASH', 'CHEQUE', 'ONLINE'] as const
    const pMethod1 = paymentMethods[i % paymentMethods.length]
    const pMethod2 = paymentMethods[(i + 2) % paymentMethods.length]

    if (paidPaise > 0) {
      const advAmount = orderStatus === 'CONFIRMED' ? paidPaise : advanceRequiredPaise
      await db.payment.create({
        data: {
          orderId: order.id,
          amountPaise: advAmount,
          method: pMethod1,
          kind: 'ADVANCE',
          reference: pMethod1 === 'CASH'
            ? `Cash - Field handover to tech`
            : pMethod1 === 'CHEQUE'
            ? `CHQ#${String(100400 + i)} - HDFC Bank`
            : pMethod1 === 'NEFT'
            ? `UTR-HDFC${randHex(4)}${1000 + i}`
            : `UPI-Ref-${430100000000 + i}`,
          receivedOn: iso(confirmedDate),
          recordedBy: accountsUser.id,
          createdAt: confirmedDate,
        },
      })

      if (paidPaise > advAmount) {
        const finalAmount = paidPaise - advAmount
        await db.payment.create({
          data: {
            orderId: order.id,
            amountPaise: finalAmount,
            method: pMethod2,
            kind: 'FINAL',
            reference: pMethod2 === 'CASH'
              ? `Cash - Final signoff collection`
              : pMethod2 === 'CHEQUE'
              ? `CHQ#${String(200500 + i)} - ICICI Bank`
              : pMethod2 === 'NEFT'
              ? `UTR-SBIN${randHex(4)}${5000 + i}`
              : `UPI-Ref-${430200000000 + i}`,
            receivedOn: iso(new Date(installedDate.getTime() + 86400000)),
            recordedBy: accountsUser.id,
            createdAt: new Date(installedDate.getTime() + 86400000),
          },
        })
      }
    }

    // 7. Invoice
    if (orderStatus !== 'PENDING_ADVANCE') {
      await db.invoice.create({
        data: {
          invoiceNumber,
          customerId: customer.id,
          orderId: order.id,
          type: 'SALE',
          issueDate: iso(confirmedDate),
          subtotalPaise: subtotalPaise - discountPaise,
          taxPaise,
          totalPaise,
          status: paidPaise >= totalPaise ? 'PAID' : 'ISSUED',
          lines: {
            create: quoteLines.map(({ bl, qty }) => ({
              productId: bl.productId,
              description: bl.product.name,
              qty,
              unitPricePaise: bl.product.salePricePaise,
              taxRateBp: bl.product.taxRateBp,
              lineTotalPaise: bl.product.salePricePaise * qty,
            })),
          },
        },
      })
    }

    // 8. Subsidy application (for on-grid systems)
    if (subsidyPaise > 0) {
      await db.subsidyApplication.create({
        data: {
          orderId: order.id,
          status: daysAgoCount > 90 ? 'DISBURSED' : daysAgoCount > 30 ? 'APPROVED' : 'SUBMITTED',
          applicationRef: `PM-SG-${year}${String(10000 + i).slice(-5)}`,
          expectedPaise: subsidyPaise,
          receivedPaise: daysAgoCount > 90 ? subsidyPaise : 0,
          submittedOn: iso(confirmedDate),
        },
      })
    }

    // 9. Dispatch & Delivery
    let dispatchId: string | null = null
    if (orderStatus === 'CLOSED' || orderStatus === 'INSTALLED') {
      const dispatch = await db.dispatch.create({
        data: {
          dispatchNumber,
          orderId: order.id,
          status: 'DELIVERED',
          fromLocationId: wh.id,
          vehicleLocationId: veh.id,
          scheduledOn: iso(dispatchedDate),
          packedBy: warehouseUser.id,
          departedAt: dispatchedDate,
          deliveredAt: deliveredDate,
          createdAt: confirmedDate,
        },
      })
      dispatchId = dispatch.id
    }

    // 10. Installation
    let installationId: string | null = null
    if (orderStatus === 'CLOSED' || orderStatus === 'INSTALLED') {
      const leadMember = crewLeads[i % crewLeads.length]
      const otherTechs = technicians.filter(t => t.id !== leadMember.id)
      const assistMember = otherTechs[i % otherTechs.length]

      const installation = await db.installation.create({
        data: {
          orderId: order.id,
          status: 'COMPLETED',
          scheduledOn: iso(installedDate),
          slot: i % 2 === 0 ? 'MORNING' : 'AFTERNOON',
          crewLeadId: leadMember.userId,
          startedAt: new Date(installedDate.getTime() + 9 * 3600000),
          finishedAt: new Date(installedDate.getTime() + 16.5 * 3600000),
          installedCapacityKw: Math.round(panelCount * panelWp) / 1000,
          testReadingW: Math.round(capacityKw * 850 + (i % 5) * 60),
          checklist: JSON.stringify({ standsMounted: true, panelsLaid: true, wiringBoxes: true, earthingDone: true, powerTest: true }),
          signedName: fullName,
          signedAt: new Date(installedDate.getTime() + 16.5 * 3600000),
          signoffHash: createHash('sha256').update(order.id + fullName).digest('hex'),
          createdAt: confirmedDate,
        },
      })
      installationId = installation.id

      // Installation crew & time logs
      await db.installationCrew.createMany({
        data: [
          { installationId: installation.id, technicianId: leadMember.id, role: 'LEAD' },
          { installationId: installation.id, technicianId: assistMember.id, role: 'MEMBER' },
        ],
        skipDuplicates: true,
      })
      await db.timeLog.createMany({
        data: [
          {
            technicianId: leadMember.id,
            installationId: installation.id,
            startedAt: new Date(installedDate.getTime() + 9 * 3600000),
            endedAt: new Date(installedDate.getTime() + 16.5 * 3600000),
            hourlyCostPaise: R(250),
          },
          {
            technicianId: assistMember.id,
            installationId: installation.id,
            startedAt: new Date(installedDate.getTime() + 9 * 3600000),
            endedAt: new Date(installedDate.getTime() + 16 * 3600000),
            hourlyCostPaise: R(200),
          },
        ],
      })
    }

    // 11. DEVICES & HARDWARE UNITS ("add other data for devices and all")
    if ((orderStatus === 'CLOSED' || orderStatus === 'INSTALLED') && installationId) {
      const deliveredOnStr = iso(deliveredDate)

      // A. Solar Panels (PNL-540)
      const panelProduct = prodMap.get('PNL-540')!
      for (let pIdx = 1; pIdx <= panelCount; pIdx++) {
        const serialNumber = `PNL540-${yearCode}-${String(100000 + i * 20 + pIdx).slice(-6)}`
        const qrCode = nextQr()

        const unit = await db.inventoryUnit.create({
          data: {
            productId: panelProduct.id,
            serialNumber,
            qrCode,
            status: 'INSTALLED',
            locationId: sites.id,
            orderId: order.id,
            customerId: customer.id,
            installationId,
            deliveredOn: deliveredOnStr,
            unitCostPaise: panelProduct.stdCostPaise,
          },
        })

        // Active 20-year warranty (240 months)
        const [y, m, d] = deliveredOnStr.split('-').map(Number)
        const end = new Date(Date.UTC(y, m - 1 + panelProduct.warrantyMonths, d - 1))
        await db.warranty.create({
          data: {
            unitId: unit.id,
            installationId,
            customerId: customer.id,
            productId: panelProduct.id,
            coverage: 'EQUIPMENT',
            startDate: deliveredOnStr,
            endDate: iso(end),
            months: panelProduct.warrantyMonths,
            status: 'ACTIVE',
            source: 'DELIVERY',
          },
        })

        if (dispatchId) {
          await db.stockMovement.createMany({
            data: [
              { productId: panelProduct.id, unitId: unit.id, qty: 1, fromLocationId: wh.id, toLocationId: veh.id, type: 'DISPATCH', unitCostPaise: panelProduct.stdCostPaise, refType: 'dispatch', refId: dispatchId, createdBy: warehouseUser.id, createdAt: dispatchedDate },
              { productId: panelProduct.id, unitId: unit.id, qty: 1, fromLocationId: veh.id, toLocationId: sites.id, type: 'DELIVERY', unitCostPaise: panelProduct.stdCostPaise, refType: 'dispatch', refId: dispatchId, createdBy: warehouseUser.id, createdAt: deliveredDate },
            ],
          })
        }
      }

      // B. Inverter (On-Grid or Off-Grid)
      const invSku = isOffGrid ? `INV-OFF-${capacityKw}K` : `INV-ONG-${capacityKw}K`
      const invProduct = prodMap.get(invSku) ?? prodMap.get('INV-ONG-3K')!
      const invSerial = isOffGrid
        ? `INVO${capacityKw}-${yearCode}-${String(300000 + i * 10).slice(-6)}`
        : `INV${capacityKw}K-${yearCode}-${String(400000 + i * 10).slice(-6)}`
      const invQr = nextQr()

      const invUnit = await db.inventoryUnit.create({
        data: {
          productId: invProduct.id,
          serialNumber: invSerial,
          qrCode: invQr,
          status: 'INSTALLED',
          locationId: sites.id,
          orderId: order.id,
          customerId: customer.id,
          installationId,
          deliveredOn: deliveredOnStr,
          unitCostPaise: invProduct.stdCostPaise,
        },
      })

      // Inverter warranty (24 months)
      const [iy, im, id] = deliveredOnStr.split('-').map(Number)
      const invEnd = new Date(Date.UTC(iy, im - 1 + invProduct.warrantyMonths, id - 1))
      const isInvExpired = invEnd.getTime() < now
      const invWarranty = await db.warranty.create({
        data: {
          unitId: invUnit.id,
          installationId,
          customerId: customer.id,
          productId: invProduct.id,
          coverage: 'EQUIPMENT',
          startDate: deliveredOnStr,
          endDate: iso(invEnd),
          months: invProduct.warrantyMonths,
          status: isInvExpired ? 'EXPIRED' : 'ACTIVE',
          source: 'DELIVERY',
        },
      })

      // C. Charge Controller (CC-60A)
      const ccProduct = prodMap.get('CC-60A')!
      const ccSerial = `CC60-${yearCode}-${String(500000 + i * 10).slice(-6)}`
      const ccUnit = await db.inventoryUnit.create({
        data: {
          productId: ccProduct.id,
          serialNumber: ccSerial,
          qrCode: nextQr(),
          status: 'INSTALLED',
          locationId: sites.id,
          orderId: order.id,
          customerId: customer.id,
          installationId,
          deliveredOn: deliveredOnStr,
          unitCostPaise: ccProduct.stdCostPaise,
        },
      })
      const ccEnd = new Date(Date.UTC(iy, im - 1 + ccProduct.warrantyMonths, id - 1))
      await db.warranty.create({
        data: {
          unitId: ccUnit.id,
          installationId,
          customerId: customer.id,
          productId: ccProduct.id,
          coverage: 'EQUIPMENT',
          startDate: deliveredOnStr,
          endDate: iso(ccEnd),
          months: ccProduct.warrantyMonths,
          status: ccEnd.getTime() < now ? 'EXPIRED' : 'ACTIVE',
          source: 'DELIVERY',
        },
      })

      // D. Battery Storage (for Off-Grid systems)
      if (isOffGrid) {
        const batProduct = prodMap.get('BAT-LI-5K')!
        const batSerial = `BATLI-${yearCode}-${String(600000 + i * 10).slice(-6)}`
        const batUnit = await db.inventoryUnit.create({
          data: {
            productId: batProduct.id,
            serialNumber: batSerial,
            qrCode: nextQr(),
            status: 'INSTALLED',
            locationId: sites.id,
            orderId: order.id,
            customerId: customer.id,
            installationId,
            deliveredOn: deliveredOnStr,
            unitCostPaise: batProduct.stdCostPaise,
          },
        })
        const batEnd = new Date(Date.UTC(iy, im - 1 + batProduct.warrantyMonths, id - 1))
        await db.warranty.create({
          data: {
            unitId: batUnit.id,
            installationId,
            customerId: customer.id,
            productId: batProduct.id,
            coverage: 'EQUIPMENT',
            startDate: deliveredOnStr,
            endDate: iso(batEnd),
            months: batProduct.warrantyMonths,
            status: batEnd.getTime() < now ? 'EXPIRED' : 'ACTIVE',
            source: 'DELIVERY',
          },
        })
      }

      // 12. Service tickets for ~25 realistic historical cases
      if (i % 8 === 3) {
        const ticketDate = new Date(installedDate.getTime() + (90 + (i % 120)) * 86400000)
        if (ticketDate.getTime() < now) {
          const isResolved = (now - ticketDate.getTime()) > 7 * 86400000
          const faultCategories = ['NO_POWER', 'GENERATION_LOW', 'INVERTER_FAULT', 'PHYSICAL_DAMAGE', 'MONITORING_OFFLINE'] as const
          const category = faultCategories[i % faultCategories.length]
          const assignedTech = technicians[(i + 4) % technicians.length]

          await db.serviceTicket.create({
            data: {
              ticketNumber: `T-${year}-${String(100 + i).slice(-4)}`,
              customerId: customer.id,
              unitId: invUnit.id,
              channel: (['PHONE', 'WHATSAPP', 'WEB', 'VISIT'] as const)[i % 4],
              category: (['NO_POWER', 'FAULT_CODE', 'LOW_GENERATION', 'DAMAGE', 'OTHER'] as const)[i % 5],
              priority: i % 4 === 0 ? 'HIGH' : 'NORMAL',
              status: isResolved ? 'RESOLVED' : 'ASSIGNED',
              description: `Customer reported ${i % 3 === 0 ? 'system tripped with grid fault code E02' : i % 3 === 1 ? 'generation lower than seasonal estimate' : 'inverter fan error'}`,
              assignedTo: assignedTech.userId,
              slaDueAt: new Date(ticketDate.getTime() + 48 * 3600000),
              warrantyVerdict: isInvExpired ? 'OUT_OF_WARRANTY' : 'IN_WARRANTY',
              billingMode: isInvExpired ? 'CHARGEABLE' : 'WARRANTY',
              resolvedAt: isResolved ? new Date(ticketDate.getTime() + 3 * 86400000) : null,
              resolutionNotes: isResolved ? 'Grid voltage surge resolved, terminal connections re-tightened and system generation verified.' : null,
              createdAt: ticketDate,
            },
          })
        }
      }
    }

    createdCount++
    if (createdCount % 20 === 0) {
      console.log(`  ✓ ${createdCount} / 200 customer chains seeded…`)
    }
  }

  console.log(`\n🎉 Successfully completed seeding ${createdCount} customers, orders, serialized devices, and warranties!`)
}

seed200()
  .catch((err) => {
    console.error('Seed script failed:', err)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
    process.exit(0)
  })
