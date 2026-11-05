import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAuth } from './auth'
import { clientIp } from './http'
import { can, type Permission } from './rbac'
import { securityEvent } from './security-events'

/** Server-side guard for admin pages; mirrors requirePermission() used by the admin API. */
export async function adminGuard(permission: Permission, page: string) {
  const { user } = await getAuth()
  if (!user) redirect(`/login?next=${encodeURIComponent(page)}`)
  if (!can(user.role, permission)) {
    securityEvent('authz.denied', `${user.email} was denied ${permission} on ${page}`,
      { 'user.name': user.email, 'client.address': clientIp(await headers()), 'authz.permission': permission, 'http.route': page, 'user.role': user.role }, 'WARN')
    return { user, allowed: false as const, reason: 'permission' as const }
  }
  if (!user.mfa) return { user, allowed: false as const, reason: 'mfa' as const }
  return { user, allowed: true as const, reason: null }
}
