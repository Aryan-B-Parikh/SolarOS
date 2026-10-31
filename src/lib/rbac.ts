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

