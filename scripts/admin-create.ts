import { PrismaClient, UserRole } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

async function createAdmin() {
  const args = process.argv.slice(2);
  const emailArg = args.find((a) => a.startsWith('--email='))?.split('=')[1] || 'director@sunpower.ops';
  const nameArg = args.find((a) => a.startsWith('--name='))?.split('=')[1] || 'Rajesh Shah (Director)';
  const passArg = args.find((a) => a.startsWith('--password='))?.split('=')[1] || 'SunPower@2026';

  const passwordHash = await hashPassword(passArg);

  const user = await prisma.user.upsert({
    where: { email: emailArg },
    create: {
      name: nameArg,
      email: emailArg,
      password_hash: passwordHash,
      role: UserRole.DIRECTOR,
      is_active: true,
    },
    update: {
      name: nameArg,
      password_hash: passwordHash,
      role: UserRole.DIRECTOR,
      is_active: true,
    },
  });

  console.log(`Director account successfully created/updated: ${user.email} (ID: ${user.id})`);
}

createAdmin()
  .catch((e) => {
    console.error('Error creating admin:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

