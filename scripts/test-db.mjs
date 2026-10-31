import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  try {
    const userCount = await p.user.count();
    const productCount = await p.product.count();
    console.log('SUCCESS: DB is connected!');
    console.log('Users in DB:', userCount);
    console.log('Products in DB:', productCount);
  } catch (err) {
    console.error('ERROR connecting to DB:', err);
  } finally {
    await p.$disconnect();
  }
}
main();
