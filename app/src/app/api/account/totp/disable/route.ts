import { z } from 'zod'
import { audit } from '@/lib/audit'
import { requireUser } from '@/lib/auth'
import { decrypt } from '@/lib/crypto'
import { one, tx } from '@/lib/db'
import { HttpError, clientIp, json, readJson, route } from '@/lib/http'
import { notifyUser } from '@/lib/login'
import { verifyPassword } from '@/lib/password'
import { isStaff } from '@/lib/rbac'
import { securityEvent } from '@/lib/security-events'
import { verifyTotp } from '@/lib/totp'
import { passwordInput } from '@/lib/validation'

export const POST = route(async (req) => {
  const { user } = await requireUser()
  const { password, code } = await readJson(req, z.object({ password: passwordInput, code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.') }))
  const row = await one<{ password_hash: string; totp_secret_enc: string | null; totp_last_step: number | null; passkeys: number }>(
    'SELECT password_hash, totp_secret_enc, totp_last_step, (SELECT count(*)::int FROM passkeys WHERE user_id = users.id) AS passkeys FROM users WHERE id = $1', [user.id])
  if (!row?.totp_secret_enc) throw new HttpError(409, 'Two-step verification is not on.')
  // Turning off a protection needs both factors.
  if (!(await verifyPassword(row.password_hash, password))) throw new HttpError(401, 'Your password is not right.', 'bad_password')
  if (verifyTotp(decrypt(row.totp_secret_enc), code, row.totp_last_step) === null) throw new HttpError(401, 'That code is not right.', 'bad_code')
  if (isStaff(user.role) && row.passkeys === 0) throw new HttpError(409, 'Staff accounts must keep a second factor. Add a passkey before turning this off.', 'staff_mfa_required')

  await tx(async (c) => {
    await c.query('UPDATE users SET totp_enabled = false, totp_secret_enc = NULL, totp_last_step = NULL WHERE id = $1', [user.id])
    await c.query('DELETE FROM recovery_codes WHERE user_id = $1', [user.id])
  })
  const ip = clientIp(req.headers)
  securityEvent('auth.mfa_disabled', `two-step verification turned off for ${user.email}`, { 'user.name': user.email, 'client.address': ip }, 'WARN')
  await audit({ action: 'auth.mfa_disabled', actor: user, target: `user:${user.id}`, ip })
  await notifyUser(user.email, 'Two-step verification was turned off', ['Two-step verification was turned off for your account.'])
  return json({ ok: true })
})
