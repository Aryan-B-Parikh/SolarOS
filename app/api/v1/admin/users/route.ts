import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '@/lib/handler';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { AppError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * FR-9.1 — user management (DIRECTOR only).
 * GET : list all users with role / email / phone / isActive / lastLogin.
 *       password_hash is NEVER selected or returned.
 * POST : create a user (name, email, phone?, role, password >= 8 chars),
 *       hashed via Argon2id, with an audit entry.
 */
const CreateUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Valid email address required').toLowerCase(),
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{9,14}$/, 'Valid phone number is required (e.g. +919876543210)')
    .optional()
    .or(z.literal('')),
  role: z.enum(['DIRECTOR', 'SALES', 'TECHNICIAN', 'WAREHOUSE', 'SUPPORT', 'ACCOUNTS']),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR'],
  },
  async () => {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        is_active: true,
        last_login_at: true,
        created_at: true,
      },
      orderBy: { created_at: 'asc' },
    });

    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        isActive: u.is_active,
        lastLoginAt: u.last_login_at ? u.last_login_at.toISOString() : null,
        createdAt: u.created_at.toISOString(),
      })),
    });
  }
);

export const POST = createApiHandler(
  {
    bodySchema: CreateUserSchema,
    allowedRoles: ['DIRECTOR'],
  },
  async ({ body, user }) => {
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      throw new AppError('CONFLICT', 'A user with this email already exists', 409);
    }

    const passwordHash = await hashPassword(body.password);

    const created = await prisma.user.create({
      data: {
        name: body.name.trim(),
        email: body.email,
        phone: body.phone ? body.phone : null,
        role: body.role,
        password_hash: passwordHash,
        is_active: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        is_active: true,
        created_at: true,
      },
    });

    await recordAudit({
      actorType: 'USER',
      actorId: user!.id,
      entityType: 'USER',
      entityId: created.id,
      action: 'USER_CREATED',
      after: {
        name: created.name,
        email: created.email,
        role: created.role,
        phone: created.phone,
        isActive: created.is_active,
      },
    });

    return NextResponse.json(
      {
        id: created.id,
        name: created.name,
        email: created.email,
        phone: created.phone,
        role: created.role,
        isActive: created.is_active,
        createdAt: created.created_at.toISOString(),
      },
      { status: 201 }
    );
  }
);
