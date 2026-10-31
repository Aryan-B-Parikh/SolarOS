import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '@/lib/handler';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { AppError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * FR-9.1 — update a user (DIRECTOR only).
 * PATCH accepts any combination of:
 *  - isActive (toggle; deactivation, NEVER deletion — history is preserved)
 *  - role (change)
 *  - password (reset; min 8 chars, re-hashed)
 * Every change is audited with before/after snapshots.
 */
const UpdateUserSchema = z
  .object({
    isActive: z.boolean().optional(),
    role: z.enum(['DIRECTOR', 'SALES', 'TECHNICIAN', 'WAREHOUSE', 'SUPPORT', 'ACCOUNTS']).optional(),
    password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  })
  .refine((data) => data.isActive !== undefined || data.role !== undefined || data.password !== undefined, {
    message: 'Provide at least one of isActive, role or password',
  });

export const PATCH = createApiHandler(
  {
    bodySchema: UpdateUserSchema,
    allowedRoles: ['DIRECTOR'],
  },
  async ({ body, params, user }) => {
    const userId = params.id;

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) {
      throw new AppError('NOT_FOUND', 'User not found', 404);
    }

    // Safety: a director cannot deactivate their own account.
    if (body.isActive === false && target.id === user!.id) {
      throw new AppError(
        'INVALID_STATE',
        'You cannot deactivate your own account while signed in',
        400
      );
    }

    const data: { is_active?: boolean; role?: any; password_hash?: string } = {};
    if (body.isActive !== undefined) data.is_active = body.isActive;
    if (body.role !== undefined) data.role = body.role;
    if (body.password !== undefined) data.password_hash = await hashPassword(body.password);

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        is_active: true,
        last_login_at: true,
      },
    });

    await recordAudit({
      actorType: 'USER',
      actorId: user!.id,
      entityType: 'USER',
      entityId: updated.id,
      action: body.password !== undefined ? 'USER_UPDATED_PASSWORD_RESET' : 'USER_UPDATED',
      before: {
        name: target.name,
        email: target.email,
        role: target.role,
        isActive: target.is_active,
      },
      after: {
        name: updated.name,
        email: updated.email,
        role: updated.role,
        isActive: updated.is_active,
        passwordReset: body.password !== undefined,
      },
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      phone: updated.phone,
      role: updated.role,
      isActive: updated.is_active,
      lastLoginAt: updated.last_login_at ? updated.last_login_at.toISOString() : null,
    });
  }
);
