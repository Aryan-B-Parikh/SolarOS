import { PrismaClient, UserRole, CustomerType, LinkScope, LeadSource, LeadStatus, SystemType, ProductCategory, WarrantyStartBasis, BomRule, FaultPriority, OrderStatus, PaymentMethod, PaymentKind, LocationType, MovementType, POStatus, UnitStatus, ScanMethod, InstallationStatus, WarrantyCoverage, WarrantyStatus, WarrantySource } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

async function main() {
  console.log('--- Starting SunPower Ops Idempotent Seed ---');

  const defaultPasswordHash = await hashPassword('SunPower@2026');

  // 1. Settings (Key/Value)
  console.log('Seeding settings...');
  const settingsData = [
    { key: 'advance_threshold_percent', value: 30 },
    { key: 'target_margin_bp', value: 2000 }, // 20%
    { key: 'solar_yield_kwh_per_kwp', value: 4.5 },
    { key: 'roof_area_sqm_per_kw', value: 10 },
    { key: 'default_tariff_paise', value: 700 }, // Rs 7/unit
    {
      key: 'shading_factors',
      value: { NONE: 1.0, LOW: 0.95, MEDIUM: 0.85, HIGH: 0.7 },
    },
    {
      key: 'sla_hours_by_priority',
      value: { LOW: 168, NORMAL: 72, HIGH: 24, URGENT: 4 },
    },
    { key: 'duplicate_address_threshold', value: 0.75 },
    {
      key: 'company_branding',
      value: {
        companyName: 'SunPower Solar Energy Pvt Ltd',
        gstin: '24AAACS1429B1Z0',
        address: '402 Solar Tower, S.G. Highway, Ahmedabad, Gujarat 380054',
        phone: '+91 79 4000 1234',
        email: 'ops@sunpowersolar.in',
        bankDetails: 'HDFC Bank, S.G. Highway Branch, A/C: 50200012345678, IFSC: HDFC0001234',
      },
    },
  ];

  for (const s of settingsData) {
    await prisma.setting.upsert({
      where: { key: s.key },
      create: { key: s.key, value: s.value },
      update: { value: s.value },
    });
  }

  // 2. Staff Users
  console.log('Seeding staff users...');
  const staffMembers = [
    { name: 'Rajesh Shah (Director)', email: 'director@sunpower.ops', role: UserRole.DIRECTOR, phone: '+919825000001' },
    { name: 'Amit Verma (Sales)', email: 'sales1@sunpower.ops', role: UserRole.SALES, phone: '+919825000002' },
    { name: 'Pooja Patel (Sales)', email: 'sales2@sunpower.ops', role: UserRole.SALES, phone: '+919825000003' },
    { name: 'Ramesh Patel (Warehouse)', email: 'warehouse@sunpower.ops', role: UserRole.WAREHOUSE, phone: '+919825000004' },
    { name: 'Neha Joshi (Support)', email: 'support@sunpower.ops', role: UserRole.SUPPORT, phone: '+919825000005' },
    { name: 'Kiran Desai (Accounts)', email: 'accounts@sunpower.ops', role: UserRole.ACCOUNTS, phone: '+919825000006' },
  ];

  const userMap: Record<string, string> = {};
  for (const staff of staffMembers) {
    const user = await prisma.user.upsert({
      where: { email: staff.email },
      create: {
        name: staff.name,
        email: staff.email,
        phone: staff.phone,
        password_hash: defaultPasswordHash,
        role: staff.role,
        is_active: true,
      },
      update: { name: staff.name, role: staff.role, phone: staff.phone },
    });
    userMap[staff.email] = user.id;
  }

  // 3. Technicians (15 technicians: 4 crew leads, 3 with battery skill)
  console.log('Seeding 15 technicians...');
  const techData = [
    { name: 'Vijay Parmar (Lead 1)', email: 'tech1@sunpower.ops', skills: ['SURVEY', 'ONGRID', 'OFFGRID_BATTERY', 'ELECTRICAL_LEAD'], isLead: true, cost: 35000n },
    { name: 'Sanjay Rathod (Lead 2)', email: 'tech2@sunpower.ops', skills: ['SURVEY', 'ONGRID', 'OFFGRID_BATTERY'], isLead: true, cost: 32000n },
    { name: 'Dinesh Solanki (Lead 3)', email: 'tech3@sunpower.ops', skills: ['SURVEY', 'ONGRID'], isLead: true, cost: 30000n },
    { name: 'Manish Vaghela (Lead 4)', email: 'tech4@sunpower.ops', skills: ['SURVEY', 'ONGRID', 'OFFGRID_BATTERY'], isLead: true, cost: 32000n },
    { name: 'Anil Chavda', email: 'tech5@sunpower.ops', skills: ['ONGRID', 'ELECTRICAL_LEAD'], isLead: false, cost: 25000n },
    { name: 'Bharat Makwana', email: 'tech6@sunpower.ops', skills: ['ONGRID'], isLead: false, cost: 22000n },
    { name: 'Chetan Dabhi', email: 'tech7@sunpower.ops', skills: ['SURVEY', 'ONGRID'], isLead: false, cost: 24000n },
    { name: 'Deepak Chauhan', email: 'tech8@sunpower.ops', skills: ['ONGRID'], isLead: false, cost: 20000n },
    { name: 'Gautam Thakor', email: 'tech9@sunpower.ops', skills: ['ONGRID'], isLead: false, cost: 20000n },
    { name: 'Hardik Raval', email: 'tech10@sunpower.ops', skills: ['ONGRID', 'ELECTRICAL_LEAD'], isLead: false, cost: 25000n },
    { name: 'Ishwar Prajapati', email: 'tech11@sunpower.ops', skills: ['SURVEY', 'ONGRID'], isLead: false, cost: 22000n },
    { name: 'Jignesh Mewada', email: 'tech12@sunpower.ops', skills: ['ONGRID'], isLead: false, cost: 20000n },
    { name: 'Kamlesh Panchal', email: 'tech13@sunpower.ops', skills: ['ONGRID'], isLead: false, cost: 20000n },
    { name: 'Lalit Soni', email: 'tech14@sunpower.ops', skills: ['ONGRID'], isLead: false, cost: 20000n },
    { name: 'Mukesh Barot', email: 'tech15@sunpower.ops', skills: ['ONGRID'], isLead: false, cost: 20000n },
  ];

  for (let i = 0; i < techData.length; i++) {
    const t = techData[i];
    const techUser = await prisma.user.upsert({
      where: { email: t.email },
      create: {
        name: t.name,
        email: t.email,
        phone: `+9198251000${(i + 1).toString().padStart(2, '0')}`,
        password_hash: defaultPasswordHash,
        role: UserRole.TECHNICIAN,
        is_active: true,
      },
      update: { name: t.name, role: UserRole.TECHNICIAN },
    });

    await prisma.technician.upsert({
      where: { user_id: techUser.id },
      create: {
        user_id: techUser.id,
        skills: t.skills,
        base_lat: 23.0225,
        base_lng: 72.5714,
        hourly_cost_paise: t.cost, // e.g. Rs 350/hr
        max_jobs_per_day: 2,
        is_crew_lead: t.isLead,
      },
      update: {
        skills: t.skills,
        is_crew_lead: t.isLead,
        hourly_cost_paise: t.cost,
      },
    });
  }

  // 4. Stock Locations
  console.log('Seeding stock locations...');
  const locations = [
    { code: 'WH-MAIN', name: 'Main Warehouse - Ahmedabad', type: LocationType.WAREHOUSE },
    { code: 'VEH-01', name: 'Field Truck 01', type: LocationType.VEHICLE },
    { code: 'VEH-02', name: 'Field Truck 02', type: LocationType.VEHICLE },
    { code: 'CUST-SITES', name: 'Customer Sites', type: LocationType.CUSTOMER_SITES },
    { code: 'RMA-LOC', name: 'RMA Defective Goods', type: LocationType.RMA },
    { code: 'SCRAP-LOC', name: 'Scrap & Discarded', type: LocationType.SCRAP },
  ];

  const locMap: Record<string, string> = {};
  for (const loc of locations) {
    const record = await prisma.stockLocation.upsert({
      where: { code: loc.code },
      create: loc,
      update: { name: loc.name, type: loc.type },
    });
    locMap[loc.code] = record.id;
  }

  // 5. Suppliers
  console.log('Seeding suppliers...');
  const suppliers = [
    { name: 'Tata Power Solar Systems Ltd', contact: 'Manoj Kumar', phone: '+919909011111', email: 'sales@tatapower.com', gstin: '24AAACT1234F1Z1' },
    { name: 'Adani Solar Manufacturing Ltd', contact: 'Kavita Dave', phone: '+919909022222', email: 'sales@adanisolar.com', gstin: '24AAACA9876D1Z5' },
  ];

  const supplierMap: Record<string, string> = {};
  for (const sup of suppliers) {
    const s = await prisma.supplier.upsert({
      where: { name: sup.name },
      create: sup,
      update: sup,
    });
    supplierMap[sup.name] = s.id;
  }

  // 6. Products Catalogue (20 products)
  console.log('Seeding products catalogue...');
  const products = [
    // Panels
    { sku: 'PANEL-540W', name: 'Tata Solar Mono PERC Panel 540 Wp', category: ProductCategory.SOLAR_PANEL, brand: 'Tata Power', model: 'TP-540-PERC', uom: 'NOS', is_serialized: true, warranty_months: 240, warranty_start_basis: WarrantyStartBasis.DELIVERY, rated_power_w: 540, std_cost_paise: 1100000n, sale_price_paise: 1450000n, reorder_level: 20 },
    { sku: 'PANEL-440W', name: 'Adani Solar Mono Panel 440 Wp', category: ProductCategory.SOLAR_PANEL, brand: 'Adani Solar', model: 'AD-440-MONO', uom: 'NOS', is_serialized: true, warranty_months: 240, warranty_start_basis: WarrantyStartBasis.DELIVERY, rated_power_w: 440, std_cost_paise: 920000n, sale_price_paise: 1200000n, reorder_level: 20 },
    // On-Grid Inverters
    { sku: 'INV-ONG-1KW', name: 'Growatt 1 kW On-Grid Inverter Single Phase', category: ProductCategory.INVERTER, brand: 'Growatt', model: 'MIC-1000TL-X', uom: 'NOS', is_serialized: true, warranty_months: 24, warranty_start_basis: WarrantyStartBasis.DELIVERY, rated_power_w: 1000, std_cost_paise: 1600000n, sale_price_paise: 2200000n, reorder_level: 5 },
    { sku: 'INV-ONG-2KW', name: 'Growatt 2 kW On-Grid Inverter Single Phase', category: ProductCategory.INVERTER, brand: 'Growatt', model: 'MIC-2000TL-X', uom: 'NOS', is_serialized: true, warranty_months: 24, warranty_start_basis: WarrantyStartBasis.DELIVERY, rated_power_w: 2000, std_cost_paise: 2200000n, sale_price_paise: 3000000n, reorder_level: 5 },
    { sku: 'INV-ONG-3KW', name: 'Growatt 3 kW On-Grid Inverter Single Phase', category: ProductCategory.INVERTER, brand: 'Growatt', model: 'MIC-3000TL-X', uom: 'NOS', is_serialized: true, warranty_months: 24, warranty_start_basis: WarrantyStartBasis.DELIVERY, rated_power_w: 3000, std_cost_paise: 2800000n, sale_price_paise: 3800000n, reorder_level: 5, monitoring_url: 'https://server.growatt.com' },
    { sku: 'INV-ONG-4KW', name: 'Growatt 4 kW On-Grid Inverter Single Phase', category: ProductCategory.INVERTER, brand: 'Growatt', model: 'MIC-4000TL-X', uom: 'NOS', is_serialized: true, warranty_months: 24, warranty_start_basis: WarrantyStartBasis.DELIVERY, rated_power_w: 4000, std_cost_paise: 3400000n, sale_price_paise: 4600000n, reorder_level: 5 },
    { sku: 'INV-ONG-5KW', name: 'Growatt 5 kW On-Grid Inverter Three Phase', category: ProductCategory.INVERTER, brand: 'Growatt', model: 'MOD-5000TL3-X', uom: 'NOS', is_serialized: true, warranty_months: 24, warranty_start_basis: WarrantyStartBasis.DELIVERY, rated_power_w: 5000, std_cost_paise: 4200000n, sale_price_paise: 5800000n, reorder_level: 5 },
    // Off-Grid Inverters & Battery
    { sku: 'INV-OFFG-3KW', name: 'Luminous 3 kW Off-Grid Solar Hybrid Inverter', category: ProductCategory.INVERTER, brand: 'Luminous', model: 'SOLARVERTER-PRO-3K', uom: 'NOS', is_serialized: true, warranty_months: 24, warranty_start_basis: WarrantyStartBasis.DELIVERY, rated_power_w: 3000, std_cost_paise: 3800000n, sale_price_paise: 5000000n, reorder_level: 3 },
    { sku: 'INV-OFFG-5KW', name: 'Luminous 5 kW Off-Grid Solar Hybrid Inverter', category: ProductCategory.INVERTER, brand: 'Luminous', model: 'SOLARVERTER-PRO-5K', uom: 'NOS', is_serialized: true, warranty_months: 24, warranty_start_basis: WarrantyStartBasis.DELIVERY, rated_power_w: 5000, std_cost_paise: 5500000n, sale_price_paise: 7200000n, reorder_level: 3 },
    { sku: 'BAT-150AH', name: 'Exide Solar C10 Tubular Battery 150Ah', category: ProductCategory.BATTERY, brand: 'Exide', model: '6LMS150', uom: 'NOS', is_serialized: true, warranty_months: 24, warranty_start_basis: WarrantyStartBasis.DELIVERY, std_cost_paise: 1250000n, sale_price_paise: 1650000n, reorder_level: 8 },
    { sku: 'CHG-CTRL-48V', name: 'MPPT Solar Charge Controller 48V 60A', category: ProductCategory.CHARGE_CONTROLLER, brand: 'Victron', model: 'SMART-SOLAR-150-60', uom: 'NOS', is_serialized: true, warranty_months: 24, warranty_start_basis: WarrantyStartBasis.DELIVERY, std_cost_paise: 800000n, sale_price_paise: 1200000n, reorder_level: 5 },
    // Balance of System (BOS)
    { sku: 'STR-MOUNT-SET', name: 'HDGI Elevated Solar Module Mounting Structure Set', category: ProductCategory.STRUCTURE, brand: 'Pennar', model: 'STR-540-1P', uom: 'SET', is_serialized: false, std_cost_paise: 180000n, sale_price_paise: 260000n, reorder_level: 20 },
    { sku: 'CABLE-DC-4SQMM', name: 'Polycab 4 sq mm Single Core DC Solar Cable', category: ProductCategory.CABLE, brand: 'Polycab', model: 'SOL-DC-4', uom: 'METER', is_serialized: false, std_cost_paise: 4500n, sale_price_paise: 6500n, reorder_level: 200 },
    { sku: 'CABLE-AC-4SQMM', name: 'Polycab 4 Core 4 sq mm Copper AC Armoured Cable', category: ProductCategory.CABLE, brand: 'Polycab', model: 'SOL-AC-4C4', uom: 'METER', is_serialized: false, std_cost_paise: 9500n, sale_price_paise: 13500n, reorder_level: 100 },
    { sku: 'ACDB-1PH', name: 'Single Phase AC Distribution Box with SPD & MCB', category: ProductCategory.ACDB, brand: 'Havells', model: 'ACDB-1P-32A', uom: 'NOS', is_serialized: false, std_cost_paise: 220000n, sale_price_paise: 320000n, reorder_level: 10 },
    { sku: 'DCDB-1IN-1OUT', name: '1 In 1 Out DC Distribution Box with SPD & Fuse', category: ProductCategory.DCDB, brand: 'Havells', model: 'DCDB-1I1O-600V', uom: 'NOS', is_serialized: false, std_cost_paise: 240000n, sale_price_paise: 340000n, reorder_level: 10 },
    { sku: 'EARTH-KIT-CHEM', name: 'Chemical Earthing Kit with 3m Copper Coated Rod', category: ProductCategory.EARTHING, brand: 'TruePower', model: 'EARTH-CP-17MM', uom: 'SET', is_serialized: false, std_cost_paise: 160000n, sale_price_paise: 240000n, reorder_level: 15 },
    { sku: 'LA-CONV-COPPER', name: 'Conventional Copper Lightning Arrester with Base', category: ProductCategory.LIGHTNING_ARRESTER, brand: 'TruePower', model: 'LA-CU-1M', uom: 'NOS', is_serialized: false, std_cost_paise: 95000n, sale_price_paise: 150000n, reorder_level: 10 },
    // Below reorder level item to show low stock warning on dashboard!
    { sku: 'CONN-MC4-PAIR', name: 'MC4 Solar Connectors Male & Female Pair 1000V', category: ProductCategory.CONNECTOR, brand: 'Staubli', model: 'MC4-ORIGINAL', uom: 'SET', is_serialized: false, std_cost_paise: 12000n, sale_price_paise: 22000n, reorder_level: 100 },
    { sku: 'SRV-INSTALL-TEST', name: 'Standard Rooftop Solar Installation, Testing & Commissioning Service', category: ProductCategory.SERVICE, brand: 'SunPower', model: 'SRV-INSTALL-STD', uom: 'NOS', is_serialized: false, warranty_months: 12, warranty_start_basis: WarrantyStartBasis.INSTALLATION_SIGNOFF, std_cost_paise: 800000n, sale_price_paise: 1500000n, reorder_level: 0 },
  ];

  const productMap: Record<string, string> = {};
  for (const prod of products) {
    const p = await prisma.product.upsert({
      where: { sku: prod.sku },
      create: prod,
      update: prod,
    });
    productMap[prod.sku] = p.id;
  }

  // 7. System Templates (10 system templates: 1 to 5 kW On-Grid and Off-Grid)
  console.log('Seeding system templates and BOM rules...');
  const templates = [
    { code: 'ONG1KW', name: '1 kW Residential On-Grid Solar System', type: SystemType.ON_GRID, kw: 1.0, inverterSku: 'INV-ONG-1KW' },
    { code: 'ONG2KW', name: '2 kW Residential On-Grid Solar System', type: SystemType.ON_GRID, kw: 2.0, inverterSku: 'INV-ONG-2KW' },
    { code: 'ONG3KW', name: '3 kW Residential On-Grid Solar System (Gujarat PM Surya Ghar)', type: SystemType.ON_GRID, kw: 3.0, inverterSku: 'INV-ONG-3KW' },
    { code: 'ONG4KW', name: '4 kW Residential On-Grid Solar System', type: SystemType.ON_GRID, kw: 4.0, inverterSku: 'INV-ONG-4KW' },
    { code: 'ONG5KW', name: '5 kW Commercial On-Grid Solar System', type: SystemType.ON_GRID, kw: 5.0, inverterSku: 'INV-ONG-5KW' },
    { code: 'OFF1KW', name: '1 kW Off-Grid Solar System with Battery Backup', type: SystemType.OFF_GRID, kw: 1.0, inverterSku: 'INV-OFFG-3KW' },
    { code: 'OFF2KW', name: '2 kW Off-Grid Solar System with Battery Backup', type: SystemType.OFF_GRID, kw: 2.0, inverterSku: 'INV-OFFG-3KW' },
    { code: 'OFF3KW', name: '3 kW Off-Grid Solar System with Battery Backup', type: SystemType.OFF_GRID, kw: 3.0, inverterSku: 'INV-OFFG-3KW' },
    { code: 'OFF4KW', name: '4 kW Off-Grid Solar System with Battery Backup', type: SystemType.OFF_GRID, kw: 4.0, inverterSku: 'INV-OFFG-5KW' },
    { code: 'OFF5KW', name: '5 kW Off-Grid Solar System with Battery Backup', type: SystemType.OFF_GRID, kw: 5.0, inverterSku: 'INV-OFFG-5KW' },
  ];

  const panelId = productMap['PANEL-540W'];

  for (const t of templates) {
    const tmpl = await prisma.systemTemplate.upsert({
      where: { code: t.code },
      create: {
        code: t.code,
        name: t.name,
        system_type: t.type,
        capacity_kw: t.kw,
        panel_product_id: panelId,
        default_cable_distance_m: 25,
        labour_allowance_paise: 800000n, // Rs 8,000 labour allowance
        is_active: true,
      },
      update: {
        name: t.name,
        system_type: t.type,
        capacity_kw: t.kw,
        panel_product_id: panelId,
      },
    });

    // Populate BOM rules for 3 kW On-Grid (Spec TRD 2.4 table)
    if (t.code === 'ONG3KW') {
      const bomRules = [
        { product_id: productMap['PANEL-540W'], rule: BomRule.PANEL_COUNT, value: 1.0, allowance: 0 },
        { product_id: productMap[t.inverterSku], rule: BomRule.FIXED, value: 1.0, allowance: 0 },
        { product_id: productMap['CHG-CTRL-48V'], rule: BomRule.FIXED, value: 1.0, allowance: 0 }, // per PDF Q4
        { product_id: productMap['STR-MOUNT-SET'], rule: BomRule.PER_PANEL, value: 1.0, allowance: 0 },
        { product_id: productMap['CABLE-DC-4SQMM'], rule: BomRule.PER_CABLE_METER, value: 2.0, allowance: 5.0 }, // 2x + 5m
        { product_id: productMap['CABLE-AC-4SQMM'], rule: BomRule.PER_CABLE_METER, value: 1.0, allowance: 5.0 }, // 1x + 5m
        { product_id: productMap['ACDB-1PH'], rule: BomRule.FIXED, value: 1.0, allowance: 0 },
        { product_id: productMap['DCDB-1IN-1OUT'], rule: BomRule.FIXED, value: 1.0, allowance: 0 },
        { product_id: productMap['EARTH-KIT-CHEM'], rule: BomRule.FIXED, value: 3.0, allowance: 0 },
        { product_id: productMap['LA-CONV-COPPER'], rule: BomRule.FIXED, value: 1.0, allowance: 0 },
        { product_id: productMap['CONN-MC4-PAIR'], rule: BomRule.FIXED, value: 4.0, allowance: 0 },
        { product_id: productMap['SRV-INSTALL-TEST'], rule: BomRule.FIXED, value: 1.0, allowance: 0 },
      ];

      for (let s = 0; s < bomRules.length; s++) {
        const br = bomRules[s];
        await prisma.templateBomLine.upsert({
          where: {
            template_id_product_id: {
              template_id: tmpl.id,
              product_id: br.product_id,
            },
          },
          create: {
            template_id: tmpl.id,
            product_id: br.product_id,
            rule: br.rule,
            value: br.value,
            allowance: br.allowance,
            sort_order: s + 1,
          },
          update: {
            rule: br.rule,
            value: br.value,
            allowance: br.allowance,
            sort_order: s + 1,
          },
        });
      }
    }
  }

  // 8. Fault Codes per Model
  console.log('Seeding fault codes...');
  const faultCodes = [
    { code: 'E01', model: 'MIC-3000TL-X', description: 'Grid voltage out of range', priority: FaultPriority.HIGH },
    { code: 'E02', model: 'MIC-3000TL-X', description: 'PV Isolation low (insulation resistance fault)', priority: FaultPriority.URGENT },
    { code: 'E03', model: 'MIC-3000TL-X', description: 'Inverter internal over-temperature', priority: FaultPriority.NORMAL },
    { code: 'E04', model: 'MIC-3000TL-X', description: 'DC bus voltage high', priority: FaultPriority.HIGH },
  ];

  for (const fc of faultCodes) {
    await prisma.faultCode.upsert({
      where: {
        product_model_code: {
          product_model: fc.model,
          code: fc.code,
        },
      },
      create: {
        code: fc.code,
        product_model: fc.model,
        description: fc.description,
        default_priority: fc.priority,
      },
      update: {
        description: fc.description,
        default_priority: fc.priority,
      },
    });
  }

  // 9. Stock Levels in Main Warehouse (sufficient for 8+ typical jobs)
  console.log('Seeding warehouse inventory & stock levels...');
  const mainWhId = locMap['WH-MAIN'];
  const warehouseUserId = userMap['warehouse@sunpower.ops'];

  const stockQuantities: Record<string, { onHand: number; reserved: number; cost: bigint }> = {
    'PANEL-540W': { onHand: 80, reserved: 12, cost: 1100000n },
    'PANEL-440W': { onHand: 40, reserved: 0, cost: 920000n },
    'INV-ONG-1KW': { onHand: 6, reserved: 0, cost: 1600000n },
    'INV-ONG-2KW': { onHand: 8, reserved: 0, cost: 2200000n },
    'INV-ONG-3KW': { onHand: 15, reserved: 2, cost: 2800000n },
    'INV-ONG-4KW': { onHand: 6, reserved: 0, cost: 3400000n },
    'INV-ONG-5KW': { onHand: 10, reserved: 1, cost: 4200000n },
    'INV-OFFG-3KW': { onHand: 8, reserved: 0, cost: 3800000n },
    'INV-OFFG-5KW': { onHand: 5, reserved: 0, cost: 5500000n },
    'BAT-150AH': { onHand: 24, reserved: 0, cost: 1250000n },
    'CHG-CTRL-48V': { onHand: 12, reserved: 2, cost: 800000n },
    'STR-MOUNT-SET': { onHand: 100, reserved: 12, cost: 180000n },
    'CABLE-DC-4SQMM': { onHand: 1000, reserved: 110, cost: 4500n },
    'CABLE-AC-4SQMM': { onHand: 600, reserved: 60, cost: 9500n },
    'ACDB-1PH': { onHand: 20, reserved: 2, cost: 220000n },
    'DCDB-1IN-1OUT': { onHand: 20, reserved: 2, cost: 240000n },
    'EARTH-KIT-CHEM': { onHand: 35, reserved: 6, cost: 160000n },
    'LA-CONV-COPPER': { onHand: 15, reserved: 2, cost: 95000n },
    'CONN-MC4-PAIR': { onHand: 25, reserved: 8, cost: 12000n }, // Below reorder level (100) -> triggers low stock!
  };

  for (const [sku, s] of Object.entries(stockQuantities)) {
    const prodId = productMap[sku];
    await prisma.stockLevel.upsert({
      where: {
        product_id_location_id: {
          product_id: prodId,
          location_id: mainWhId,
        },
      },
      create: {
        product_id: prodId,
        location_id: mainWhId,
        on_hand: s.onHand,
        reserved: s.reserved,
        avg_cost_paise: s.cost,
      },
      update: {
        on_hand: s.onHand,
        reserved: s.reserved,
        avg_cost_paise: s.cost,
      },
    });
  }

  // 10. Demo Data for Warranties (May 2025 and March 2023 per Section 4.4 / Step 9 & 10)
  console.log('Seeding warranty demo customers and historical installations...');
  
  // A. May 2025 Customer (In Warranty: delivered 5 May 2025, 24 mo -> covers today Oct 2026, ends 4 May 2027)
  const mayCustomer = await prisma.customer.upsert({
    where: { phone: '+919000000021' },
    create: {
      customer_number: 'CUST-2025-0042',
      name: 'Pravinbhai Patel',
      phone: '+919000000021',
      email: 'pravin.patel@example.com',
      address: '14 Shantiniketan Society, Satellite Road',
      city: 'Ahmedabad',
      state: 'Gujarat',
      pincode: '380015',
    },
    update: { name: 'Pravinbhai Patel' },
  });

  const mayInvProduct = productMap['INV-ONG-3KW'];
  const mayInvSerial = 'INV3K-24A-001873';
  const mayUnit = await prisma.inventoryUnit.upsert({
    where: {
      product_id_serial_number: {
        product_id: mayInvProduct,
        serial_number: mayInvSerial,
      },
    },
    create: {
      product_id: mayInvProduct,
      serial_number: mayInvSerial,
      qr_code: 'SPU-7F3K9Q',
      status: UnitStatus.INSTALLED,
      location_id: locMap['CUST-SITES'],
      unit_cost_paise: 2800000n,
      customer_id: mayCustomer.id,
      delivered_on: new Date('2025-05-05'),
    },
    update: { status: UnitStatus.INSTALLED, customer_id: mayCustomer.id },
  });

  // Dummy past order and installation for May 2025
  const pastOrder1 = await prisma.order.upsert({
    where: { order_number: 'SO-2025-0042' },
    create: {
      order_number: 'SO-2025-0042',
      quote_id: crypto.randomUUID(), // placeholder unique
      customer_id: mayCustomer.id,
      status: OrderStatus.INSTALLED,
      capacity_kw: 3.0,
      system_type: SystemType.ON_GRID,
      site_snapshot: { address: mayCustomer.address },
      subtotal_paise: 18000000n,
      discount_paise: 0n,
      tax_paise: 2480000n,
      total_paise: 20480000n,
      advance_required_paise: 6144000n,
      paid_paise: 20480000n,
      confirmed_at: new Date('2025-04-20T10:00:00Z'),
    },
    update: { status: OrderStatus.INSTALLED },
  });

  const pastInstall1 = await prisma.installation.upsert({
    where: { order_id: pastOrder1.id },
    create: {
      order_id: pastOrder1.id,
      status: InstallationStatus.COMPLETED,
      scheduled_on: new Date('2025-05-05'),
      started_at: new Date('2025-05-05T04:30:00Z'),
      finished_at: new Date('2025-05-05T10:30:00Z'),
      installed_capacity_kw: 3.24,
      test_reading_w: 2850,
      signed_name: 'Pravin Patel',
    },
    update: { status: InstallationStatus.COMPLETED },
  });

  await prisma.warranty.create({
    data: {
      unit_id: mayUnit.id,
      installation_id: pastInstall1.id,
      customer_id: mayCustomer.id,
      product_id: mayInvProduct,
      coverage: WarrantyCoverage.EQUIPMENT,
      start_date: new Date('2025-05-05'),
      end_date: new Date('2027-05-04'), // 24 months - 1 day
      months: 24,
      status: WarrantyStatus.ACTIVE,
      source: WarrantySource.DELIVERY,
    },
  });

  // B. March 2023 Customer (Out of Warranty: delivered 10 March 2023, 24 mo -> ended 9 March 2025)
  const marchCustomer = await prisma.customer.upsert({
    where: { phone: '+919000000033' },
    create: {
      customer_number: 'CUST-2023-0012',
      name: 'Bhupendra Joshi',
      phone: '+919000000033',
      email: 'b.joshi@example.com',
      address: '22 Someshwar Enclave, Bodakdev',
      city: 'Ahmedabad',
      state: 'Gujarat',
      pincode: '380054',
    },
    update: { name: 'Bhupendra Joshi' },
  });

  const marchInvSerial = 'INV3K-22M-000412';
  const marchUnit = await prisma.inventoryUnit.upsert({
    where: {
      product_id_serial_number: {
        product_id: mayInvProduct,
        serial_number: marchInvSerial,
      },
    },
    create: {
      product_id: mayInvProduct,
      serial_number: marchInvSerial,
      qr_code: 'SPU-3M9J1X',
      status: UnitStatus.INSTALLED,
      location_id: locMap['CUST-SITES'],
      unit_cost_paise: 2600000n,
      customer_id: marchCustomer.id,
      delivered_on: new Date('2023-03-10'),
    },
    update: { status: UnitStatus.INSTALLED, customer_id: marchCustomer.id },
  });

  const pastOrder2 = await prisma.order.upsert({
    where: { order_number: 'SO-2023-0012' },
    create: {
      order_number: 'SO-2023-0012',
      quote_id: crypto.randomUUID(),
      customer_id: marchCustomer.id,
      status: OrderStatus.INSTALLED,
      capacity_kw: 3.0,
      system_type: SystemType.ON_GRID,
      site_snapshot: { address: marchCustomer.address },
      subtotal_paise: 17500000n,
      discount_paise: 0n,
      tax_paise: 2400000n,
      total_paise: 19900000n,
      advance_required_paise: 6000000n,
      paid_paise: 19900000n,
      confirmed_at: new Date('2023-03-01T10:00:00Z'),
    },
    update: { status: OrderStatus.INSTALLED },
  });

  const pastInstall2 = await prisma.installation.upsert({
    where: { order_id: pastOrder2.id },
    create: {
      order_id: pastOrder2.id,
      status: InstallationStatus.COMPLETED,
      scheduled_on: new Date('2023-03-10'),
      started_at: new Date('2023-03-10T04:30:00Z'),
      finished_at: new Date('2023-03-10T10:30:00Z'),
      installed_capacity_kw: 3.24,
      test_reading_w: 2800,
      signed_name: 'Bhupendra Joshi',
    },
    update: { status: InstallationStatus.COMPLETED },
  });

  await prisma.warranty.create({
    data: {
      unit_id: marchUnit.id,
      installation_id: pastInstall2.id,
      customer_id: marchCustomer.id,
      product_id: mayInvProduct,
      coverage: WarrantyCoverage.EQUIPMENT,
      start_date: new Date('2023-03-10'),
      end_date: new Date('2025-03-09'), // Ended in March 2025
      months: 24,
      status: WarrantyStatus.ACTIVE, // Status stays ACTIVE; covers_today is computed false
      source: WarrantySource.DELIVERY,
    },
  });

  console.log('--- SunPower Ops Seed Completed Successfully ---');
}

main()
  .catch((e) => {
    console.error('Seed script error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

