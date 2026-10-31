import { NextRequest, NextResponse } from 'next/server';
import { extractToken, verifyJwt } from '@/lib/jwt';
import { getAllowedPermissions, getRoleDefaultRoute, ROLE_DISPLAY_NAMES } from '@/lib/rbac';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const cookieHeader = req.headers.get('cookie');
  const authHeader = req.headers.get('authorization');
  const token = extractToken(cookieHeader, authHeader);

  if (!token) {
    return NextResponse.json(
      { success: false, code: 'UNAUTHENTICATED', message: 'Not logged in' },
      { status: 401 }
    );
  }

  const payload = verifyJwt(token);
  if (!payload) {
    return NextResponse.json(
      { success: false, code: 'INVALID_TOKEN', message: 'Session expired or invalid' },
      { status: 401 }
    );
  }

  // Optionally verify active state from DB
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      is_active: true,
      phone: true,
      technician_profile: {
        select: {
          skills: true,
        },
      },
    },
  }).catch(() => null);

  if (user && !user.is_active) {
    return NextResponse.json(
      { success: false, code: 'ACCOUNT_DISABLED', message: 'User account deactivated' },
      { status: 403 }
    );
  }

  const role = (user?.role || payload.role) as any;
  const permissions = getAllowedPermissions(role);
  const defaultRoute = getRoleDefaultRoute(role);
  const roleTitle = ROLE_DISPLAY_NAMES[role as keyof typeof ROLE_DISPLAY_NAMES] || role;

  return NextResponse.json({
    success: true,
    user: {
      id: user?.id || payload.userId,
      name: user?.name || payload.name,
      email: user?.email || payload.email,
      role,
      roleTitle,
      phone: user?.phone,
      isFieldDevice: Boolean(payload.isFieldDevice),
      skills: user?.technician_profile?.skills || [],
      permissions,
      defaultRoute,
    },
  });
}

