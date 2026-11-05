import { z } from 'zod'
import { audit } from '@/lib/audit'
import { requireUser } from '@/lib/auth'
import { one } from "@/lib/db"
import { HttpError, clientIp, json, readJson, route } from '@/lib/http'
import { notifyUser } from '@/lib/login'
import { verifyPassword } from '@/lib/password'
import { isStaff } from '@/lib/rbac'
import { securityEvent } from '@/lib/security-events'
import { passwordInput } from '@/lib/validation'

export const POST = route(async (req) => {
  const { user } = await requireUser()
  const { id, password } = await readJson(req, z.object({ id: z.string().min(1).max(1024), password: passwordInput }))
  const row = await one<{ password_hash: string; totp_enabled: boolean; passkeys: number }>(
    'SELECT password_hash, totp_enabled, (SELECT count(*)::int FROM passkeys WHERE user_id = users.id) AS passkeys FROM users WHERE id = $1', [user.id])
  if (!row || !(await verifyPassword(row.password_hash, password))) throw new HttpError(401, 'Your password is not right.', 'bad_password')
  if (isStaff(user.role) && !row.totp_enabled && row.passkeys <= 1) throw new HttpError(409, 'Staff accounts must keep a second factor. Turn on two-step verification first.', 'staff_mfa_required')
  const removed = await one<{ name: string }>('DELETE FROM passkeys WHERE id = $1 AND user_id = $2 RETURNING name', [id, user.id])
  if (!removed) throw new HttpError(404, 'Passkey not found.')
  const ip = clientIp(req.headers)
  securityEvent('auth.passkey_removed', `passkey removed for ${user.email}`, { 'user.name': user.email, 'client.address': ip }, 'WARN')
  await audit({ action: 'auth.passkey_removed', actor: user, target: `user:${user.id}`, ip, details: { name: removed.name } })
  await notifyUser(user.email, 'A passkey was removed from your account', [`The passkey "${removed.name}" was removed from your account.`])
  return json({ ok: true })
})
