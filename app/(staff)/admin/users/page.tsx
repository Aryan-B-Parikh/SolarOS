import React from 'react';
import { redirect } from 'next/navigation';
import { UserCog } from 'lucide-react';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import UsersClient from './UsersClient';

export const dynamic = 'force-dynamic';

/**
 * FR-9.1 — user management UI (DIRECTOR only).
 * The layout nav already links /admin/users; this page server-renders the
 * initial user list (never password_hash) and hands over to the client for
 * mutations through /api/v1/admin/users.
 */
export default async function AdminUsersPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'DIRECTOR') {
    return (
      <div className="max-w-xl mx-auto bg-white border border-red-200 rounded-xl p-8 text-center">
        <h1 className="text-lg font-bold text-red-700">Access Denied</h1>
        <p className="text-xs text-slate-500 mt-2">
          User management is restricted to DIRECTOR accounts (FR-9.1).
        </p>
      </div>
    );
  }

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

  const initialUsers = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role as string,
    isActive: u.is_active,
    lastLoginAt: u.last_login_at ? u.last_login_at.toISOString() : null,
    createdAt: u.created_at.toISOString(),
  }));

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <div className="pb-4 border-b border-slate-200">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
          <UserCog className="w-7 h-7 text-blue-600" />
          <span>Users &amp; Roles (FR-9.1)</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Create staff accounts, change roles and reset passwords. Deactivating a user preserves all
          history — accounts are never deleted.
        </p>
      </div>

      <UsersClient currentUserId={user.id} initialUsers={initialUsers} />
    </div>
  );
}
