/**
 * SunPower Ops Role-Based Access Control (RBAC)
 * Roles and Permissions matrix enforced in backend service layer.
 */

export type Role = 'DIRECTOR' | 'SALES' | 'TECHNICIAN' | 'WAREHOUSE' | 'SUPPORT' | 'ACCOUNTS';

export type Permission =
  | 'LEADS_MANAGE'
  | 'QUOTES_CREATE'
  | 'QUOTES_APPROVE_DISCOUNT'
  | 'SURVEY_PERFORM'
  | 'SURVEY_APPROVE'
  | 'ORDERS_VIEW'
  | 'ORDERS_CONFIRM_OVERRIDE'
  | 'ORDERS_CANCEL'
  | 'PAYMENTS_RECORD'
  | 'INVENTORY_VIEW'
  | 'INVENTORY_MANAGE'
  | 'DISPATCH_PERFORM'
  | 'INSTALLATION_PERFORM'
  | 'TICKETS_MANAGE'
  | 'ANALYTICS_VIEW'
  | 'SETTINGS_MANAGE'
  | 'CUSTOMER_LINKS_MANAGE';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  DIRECTOR: [
    'LEADS_MANAGE',
    'QUOTES_CREATE',
    'QUOTES_APPROVE_DISCOUNT',
    'SURVEY_PERFORM',
    'SURVEY_APPROVE',
    'ORDERS_VIEW',
    'ORDERS_CONFIRM_OVERRIDE',
    'ORDERS_CANCEL',
    'PAYMENTS_RECORD',
    'INVENTORY_VIEW',
    'INVENTORY_MANAGE',
    'DISPATCH_PERFORM',
    'INSTALLATION_PERFORM',
    'TICKETS_MANAGE',
    'ANALYTICS_VIEW',
    'SETTINGS_MANAGE',
    'CUSTOMER_LINKS_MANAGE',
  ],
  SALES: [
    'LEADS_MANAGE',
    'QUOTES_CREATE',
    'SURVEY_APPROVE',
    'ORDERS_VIEW',
    'CUSTOMER_LINKS_MANAGE',
  ],
  TECHNICIAN: [
    'SURVEY_PERFORM',
    'INSTALLATION_PERFORM',
    'DISPATCH_PERFORM',
  ],
  WAREHOUSE: [
    'INVENTORY_VIEW',
    'INVENTORY_MANAGE',
    'DISPATCH_PERFORM',
    'ORDERS_VIEW',
  ],
  SUPPORT: [
    'TICKETS_MANAGE',
    'CUSTOMER_LINKS_MANAGE',
    'ORDERS_VIEW',
    'INVENTORY_VIEW',
  ],
  ACCOUNTS: [
    'ORDERS_VIEW',
    'PAYMENTS_RECORD',
    'ANALYTICS_VIEW',
  ],
};

/**
 * Checks whether a given role has a specific permission
 */
export function can(role: Role | string, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role as Role];
  if (!perms) return false;
  return perms.includes(permission);
}

/**
 * Guard that verifies role or throws FORBIDDEN error
 */
export function requireRole(userRole: Role | string, allowedRoles: Role[]): void {
  if (!allowedRoles.includes(userRole as Role)) {
    const error = new Error(`Access forbidden for role ${userRole}`);
    (error as any).code = 'FORBIDDEN';
    (error as any).statusCode = 403;
    throw error;
  }
}

/**
 * Default landing routes for each role upon successful login (Spec 2.6, PRD Part 1)
 */
export const ROLE_DEFAULT_ROUTES: Record<Role, string> = {
  DIRECTOR: '/dashboard',
  SALES: '/leads',
  TECHNICIAN: '/tech/today',
  WAREHOUSE: '/inventory',
  SUPPORT: '/service',
  ACCOUNTS: '/analytics',
};

/**
 * Human-readable display titles for each role
 */
export const ROLE_DISPLAY_NAMES: Record<Role, string> = {
  DIRECTOR: 'Director',
  SALES: 'Sales Representative',
  TECHNICIAN: 'Field Technician Lead',
  WAREHOUSE: 'Warehouse Operations',
  SUPPORT: 'Customer Support Lead',
  ACCOUNTS: 'Accounts & Finance Lead',
};

/**
 * Route prefixes allowed per role
 */
export const ROLE_ALLOWED_ROUTES: Record<Role, string[]> = {
  DIRECTOR: ['*'],
  SALES: ['/leads', '/quotes', '/orders', '/schedule', '/portal', '/certificate'],
  TECHNICIAN: ['/tech'],
  WAREHOUSE: ['/inventory', '/dispatch', '/orders', '/purchasing'],
  SUPPORT: ['/service', '/orders', '/inventory', '/portal', '/certificate'],
  ACCOUNTS: ['/analytics', '/orders', '/accounts'],
};

/**
 * Resolves the primary default landing route for a given role
 */
export function getRoleDefaultRoute(role: Role | string): string {
  return ROLE_DEFAULT_ROUTES[role as Role] || '/dashboard';
}

/**
 * Checks whether a given role is authorized to access a given URL pathname
 */
export function isRouteAllowedForRole(role: Role | string, pathname: string): boolean {
  if (!role) return false;
  const userRole = role as Role;

  // Director has unrestricted company-wide access
  if (userRole === 'DIRECTOR') return true;

  // Public / unauthenticated paths are allowed
  if (
    pathname === '/' ||
    pathname === '/login' ||
    pathname.startsWith('/portal') ||
    pathname.startsWith('/enquiry') ||
    pathname.startsWith('/certificate') ||
    pathname.startsWith('/q/') ||
    pathname.startsWith('/w/') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return true;
  }

  // Technician is strictly locked to field routes (/tech/*)
  if (userRole === 'TECHNICIAN') {
    return pathname.startsWith('/tech');
  }

  // Non-technicians cannot access technician-only field routes
  if (pathname.startsWith('/tech')) {
    return false;
  }

  const allowedPrefixes = ROLE_ALLOWED_ROUTES[userRole];
  if (!allowedPrefixes) return false;

  // Check prefix match
  return allowedPrefixes.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Returns list of all granted permissions for a given role
 */
export function getAllowedPermissions(role: Role | string): Permission[] {
  return ROLE_PERMISSIONS[role as Role] || [];
}


