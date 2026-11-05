/** Role-based access control. Each role gets only the permissions it needs (least privilege). */
export type Role = 'customer' | 'support' | 'admin'

export type Permission =
  | 'admin:access'
  | 'orders:read'
  | 'orders:update'
  | 'products:write'
  | 'users:read'
  | 'users:write'
  | 'audit:read'

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  customer: [],
  support: ['admin:access', 'orders:read', 'orders:update', 'users:read'],
  admin: ['admin:access', 'orders:read', 'orders:update', 'products:write', 'users:read', 'users:write', 'audit:read'],
}

export const ROLES: Role[] = ['customer', 'support', 'admin']

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? []
}

/** Staff accounts get shorter idle sessions and must use MFA. */
export function isStaff(role: Role): boolean {
  return can(role, 'admin:access')
}
