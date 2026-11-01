// Users & roles admin (FR-9.1): list staff accounts and create new ones.
// Passwords use the same scrypt salt:hash scheme as the seed so logins work
// immediately. Users are never deleted — deactivation preserves all history.

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handler, handlerWithSchema } from '@/lib/api'
import { requireCapability, hashPassword } from '@/lib/auth'
import { db } from '@/lib/db'
import { AppError } from '@/lib/errors'
import { audit } from '@/lib/outbox'

export async function GET(req: NextRequest) {
  return handler(req, async () => {
    await requireCapability('users.manage')
    const users = await db.user.findMany({
      select: { id: true, name: true, email: true, phone: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
    })
    return { users }
  })
}

const schema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().max(120),
  phone: z.string().max(20).nullable().optional(),
  role: z.enum(['DIRECTOR', 'SALES', 'TECHNICIAN', 'WAREHOUSE', 'SUPPORT', 'ACCOUNTS']),
  password: z.string().min(8).max(72),
  isActive: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  return handlerWithSchema(req, schema, async ({ body }) => {
    const actor = await requireCapability('users.manage')
    const email = body.email.toLowerCase().trim()
    if (await db.user.findUnique({ where: { email } })) {
      throw new AppError('CONFLICT', 'A user with this email already exists.')
    }
    const user = await db.user.create({
      data: {
        name: body.name.trim(),
        email,
        phone: body.phone ?? null,
        role: body.role,
        passwordHash: hashPassword(body.password),
        isActive: body.isActive ?? true,
      },
    })
    await audit({
      actorType: 'USER', actorId: actor.id, entityType: 'user', entityId: user.id,
      action: 'USER_CREATE',
      after: { name: user.name, email: user.email, phone: user.phone, role: user.role, isActive: user.isActive },
    })
    return {
      user: {
        id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role,
        isActive: user.isActive, lastLoginAt: user.lastLoginAt, createdAt: user.createdAt,
      },
    }
  })
}
