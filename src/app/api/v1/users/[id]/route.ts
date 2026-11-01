// User update (FR-9.1): rename, change role/phone, reset password, activate or
// deactivate. Deletion is deliberately not offered — deactivation keeps every
// order, ticket and audit row linked to the person.

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handlerWithSchema } from '@/lib/api'
import { requireCapability, hashPassword } from '@/lib/auth'
import { db } from '@/lib/db'
import { AppError } from '@/lib/errors'
import { audit } from '@/lib/outbox'

const schema = z.object({
  name: z.string().min(2).max(80).optional(),
  phone: z.string().max(20).nullable().optional(),
  role: z.enum(['DIRECTOR', 'SALES', 'TECHNICIAN', 'WAREHOUSE', 'SUPPORT', 'ACCOUNTS']).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).max(72).optional(),
})

const publicUser = (u: {
  id: string; name: string; email: string; phone: string | null; role: string
  isActive: boolean; lastLoginAt: Date | null; createdAt: Date
}) => ({
  id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role,
  isActive: u.isActive, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt,
})

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return handlerWithSchema(req, schema, async ({ body }) => {
    const actor = await requireCapability('users.manage')
    const existing = await db.user.findUnique({ where: { id } })
    if (!existing) throw new AppError('NOT_FOUND', 'User not found.')
    if (body.isActive === false && id === actor.id) {
      throw new AppError('VALIDATION_FAILED', 'You cannot deactivate your own account.')
    }

    const data: { name?: string; phone?: string | null; role?: string; isActive?: boolean; passwordHash?: string } = {}
    if (body.name !== undefined) data.name = body.name.trim()
    if (body.phone !== undefined) data.phone = body.phone
    if (body.role !== undefined) data.role = body.role
    if (body.isActive !== undefined) data.isActive = body.isActive
    if (body.password !== undefined) data.passwordHash = hashPassword(body.password)
    if (Object.keys(data).length === 0) throw new AppError('VALIDATION_FAILED', 'Nothing to update.')

    const updated = await db.user.update({ where: { id }, data })

    await audit({
      actorType: 'USER', actorId: actor.id, entityType: 'user', entityId: id,
      action: 'USER_UPDATE',
      before: { name: existing.name, phone: existing.phone, role: existing.role, isActive: existing.isActive },
      after: {
        name: updated.name, phone: updated.phone, role: updated.role, isActive: updated.isActive,
        ...(body.password !== undefined ? { passwordReset: true } : {}),
      },
    })

    return { user: publicUser(updated) }
  })
}
