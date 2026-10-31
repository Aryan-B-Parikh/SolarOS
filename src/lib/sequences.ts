import { prisma } from './db.ts';

export async function getNextSequence(name: string, year = new Date().getFullYear(), tx?: any): Promise<string> {
  const db = tx || prisma;

  const seq = await db.numberSequence.upsert({
    where: {
      name_year: {
        name,
        year,
      },
    },
    update: {
      next_value: {
        increment: 1,
      },
    },
    create: {
      name,
      year,
      next_value: 2,
    },
  });

  const val = seq.next_value - 1;
  const padded = val.toString().padStart(4, '0');

  switch (name) {
    case 'customer':
      return `C-${year}-${padded}`;
    case 'lead':
      return `L-${year}-${padded}`;
    case 'quote':
      return `Q-${year}-${padded}`;
    case 'order':
      return `SO-${year}-${padded}`;
    case 'invoice':
      return `INV-${year}-${padded}`;
    case 'ticket':
      return `T-${year}-${padded}`;
    default:
      return `${name.toUpperCase()}-${year}-${padded}`;
  }
}

