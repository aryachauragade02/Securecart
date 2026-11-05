import { z } from 'zod'
import { audit } from '@/lib/audit'
import { requirePermission } from '@/lib/auth'
import { one, query } from '@/lib/db'
import { HttpError, clientIp, json, readJson, route } from '@/lib/http'
import { ROLES } from '@/lib/rbac'
import { securityEvent } from '@/lib/security-events'

export const PATCH = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const { user } = await requirePermission('users:write', '/api/admin/users/[id]')
  const { id } = await ctx.params
  if (!z.uuid().safeParse(id).success) throw new HttpError(404, 'User not found.')
  const change = await readJson(req, z.object({
    role: z.enum(ROLES as [string, ...string[]]).optional(),
    disabled: z.boolean().optional(),
    unlock: z.literal(true).optional(),
  }).refine((v) => Object.keys(v).length === 1, 'Send exactly one change.'))
  // Admins cannot demote or disable themselves (no accidental lock-out of the last admin).
  if (id === user.id && (change.role || change.disabled !== undefined)) throw new HttpError(409, 'You cannot change your own role or disable your own account.')
  const target = await one<{ id: string; email: string; role: string }>('SELECT id, email, role FROM users WHERE id = $1', [id])
  if (!target) throw new HttpError(404, 'User not found.')

  let action: string
  let details: Record<string, unknown>
  if (change.role) {
    await query('UPDATE users SET role = $2 WHERE id = $1', [id, change.role])
    await query('DELETE FROM sessions WHERE user_id = $1', [id]) // new privileges apply from a fresh sign-in
    action = 'user.role_changed'
    details = { from: target.role, to: change.role }
  } else if (change.disabled !== undefined) {
    await query('UPDATE users SET disabled = $2 WHERE id = $1', [id, change.disabled])
    if (change.disabled) await query('DELETE FROM sessions WHERE user_id = $1', [id])
    action = change.disabled ? 'user.disabled' : 'user.enabled'
    details = {}
  } else {
    await query('UPDATE users SET locked_until = NULL, failed_logins = 0 WHERE id = $1', [id])
    action = 'user.unlocked'
    details = {}
  }
  const ip = clientIp(req.headers)
  await audit({ action, actor: user, target: `user:${id}`, ip, details: { email: target.email, ...details } })
  securityEvent('admin.action', `${user.email}: ${action} ${target.email}`, { 'user.name': user.email, 'client.address': ip, 'admin.action': action, 'target.user': target.email }, 'WARN')
  return json({ ok: true })
})
