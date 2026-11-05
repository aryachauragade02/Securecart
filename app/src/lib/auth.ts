import { headers } from 'next/headers'
import { one } from './db'
import { HttpError, clientIp, userAgent } from './http'
import { can, isStaff, type Permission, type Role } from './rbac'
import { securityEvent } from './security-events'
import {
  IDLE_CUSTOMER_MS, IDLE_STAFF_MS, createSession, deleteSession, readSession, touchSession, type SessionRow,
} from './session'
import { setRequestAttributes } from './telemetry'

export type CurrentUser = {
  id: string
  email: string
  name: string
  role: Role
  totpEnabled: boolean
  mfa: boolean
  authMethod: string | null
}

type UserRow = { id: string; email: string; name: string; role: Role; totp_enabled: boolean; disabled: boolean }

export type Auth = { session: SessionRow | null; user: CurrentUser | null }

export async function getAuth(): Promise<Auth> {
  const session = await readSession()
  if (!session) return { session: null, user: null }
  if (session.stage !== 'full' || !session.user_id) return { session, user: null }
  const u = await one<UserRow>('SELECT id, email, name, role, totp_enabled, disabled FROM users WHERE id = $1', [session.user_id])
  if (!u || u.disabled) {
    await deleteSession(session.id_hash)
    return { session: null, user: null }
  }
  const idle = isStaff(u.role) ? IDLE_STAFF_MS : IDLE_CUSTOMER_MS
  if (Date.now() - new Date(session.last_seen_at).getTime() > idle) {
    await deleteSession(session.id_hash)
    return { session: null, user: null }
  }
  await touchSession(session)
  setRequestAttributes({ 'enduser.id': u.id, 'user.name': u.email })
  return {
    session,
    user: { id: u.id, email: u.email, name: u.name, role: u.role, totpEnabled: u.totp_enabled, mfa: session.mfa, authMethod: session.auth_method },
  }
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  return (await getAuth()).user
}

export async function requireUser(): Promise<{ user: CurrentUser; session: SessionRow }> {
  const { user, session } = await getAuth()
  if (!user || !session) throw new HttpError(401, 'Please sign in first.', 'unauthenticated')
  return { user, session }
}

/**
 * Checks a permission for the signed-in user. Staff permissions also require that this
 * session was established with MFA (TOTP or a passkey). Denials are recorded as security
 * events and answered with 403.
 */
export async function requirePermission(permission: Permission, routeName: string) {
  const ctx = await requireUser()
  const h = await headers()
  if (!can(ctx.user.role, permission)) {
    securityEvent('authz.denied', `${ctx.user.email} was denied ${permission} on ${routeName}`,
      { 'user.name': ctx.user.email, 'client.address': clientIp(h), 'authz.permission': permission, 'http.route': routeName, 'user.role': ctx.user.role }, 'WARN')
    throw new HttpError(403, 'You do not have permission to do that.', 'forbidden')
  }
  if (!ctx.user.mfa) {
    throw new HttpError(403, 'Staff access requires signing in with two-step verification or a passkey.', 'mfa_required')
  }
  return ctx
}

/** For routes that need a session even for guests (e.g. a cart). */
export async function ensureSession(): Promise<SessionRow> {
  const existing = await readSession()
  if (existing) return existing
  const h = await headers()
  return createSession({ userId: null, stage: 'anonymous', ip: clientIp(h), userAgent: userAgent(h) })
}

export function cartOwner(auth: Auth): string | null {
  if (auth.user) return `u:${auth.user.id}`
  if (auth.session) return `s:${auth.session.public_id}`
  return null
}
