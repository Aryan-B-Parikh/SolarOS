import { listUnits } from '../src/services/inventory'

async function check() {
  const units = await listUnits({ q: 'BIFI' })
  console.log('Units matching BIFI:', units.length)
  if (units.length > 0) {
    console.log('Sample unit:', units[0].serialNumber, units[0].qrCode, units[0].status, units[0].product.name)
  }

  const inStock = await listUnits({ status: 'IN_STOCK', limit: 5 })
  console.log('Sample inStock units:', inStock.map(u => ({ sn: u.serialNumber, qr: u.qrCode, prod: u.product.name })))
}

check().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
