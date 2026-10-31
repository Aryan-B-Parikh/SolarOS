import { PrismaClient } from '@prisma/client';

const candidates = [
  'postgresql://postgres:postgres@localhost:5432/solaros?schema=public',
  'postgresql://postgres:postgres@localhost:5432/postgres?schema=public',
  'postgresql://postgres:Mahi1206@localhost:5432/postgres?schema=public',
  'postgresql://postgres:Mahi1206@localhost:5432/solaros?schema=public',
  'postgresql://postgres:admin@localhost:5432/postgres?schema=public',
  'postgresql://postgres:root@localhost:5432/postgres?schema=public',
  'postgresql://postgres:1234@localhost:5432/postgres?schema=public',
  'postgresql://postgres:123456@localhost:5432/postgres?schema=public',
  'postgresql://postgres:solaros@localhost:5432/postgres?schema=public',
  'postgresql://solaros_user:solaros_password@localhost:5432/solaros?schema=public',
  'postgresql://solaros:solaros@localhost:5432/solaros?schema=public',
];

for (const url of candidates) {
  const p = new PrismaClient({ datasources: { db: { url } } });
  try {
    await p.$queryRawUnsafe('SELECT 1');
    console.log('SUCCESS with URL:', url);
    await p.$disconnect();
    process.exit(0);
  } catch (err) {
    console.log('FAILED with:', url, err.message?.split('\n')[0]);
    await p.$disconnect();
  }
}
console.log('None worked on port 5432.');
