import { z } from 'zod'
import { audit } from '@/lib/audit'
import { requireUser } from '@/lib/auth'
import { decrypt, encrypt } from '@/lib/crypto'
import { tx } from '@/lib/db'
import { HttpError, clientIp, json, readJson, route } from '@/lib/http'
import { notifyUser } from '@/lib/login'
import { LIMITS, hit } from '@/lib/rate-limit'
import { securityEvent } from '@/lib/security-events'
import { newRecoveryCodes, verifyTotp } from '@/lib/totp'

export const POST = route(async (req) => {
  const { user, session } = await requireUser()
  const { code } = await readJson(req, z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.') }))
  if (!session.pending_totp_secret_enc) throw new HttpError(400, 'Start the setup again.', 'no_pending_setup')
  if (!(await hit(LIMITS.mfaPerSession, session.public_id)).allowed) throw new HttpError(429, 'Too many attempts. Start the setup again in a few minutes.', 'rate_limited')
  const secret = decrypt(session.pending_totp_secret_enc)
  const step = verifyTotp(secret, code, null)
  if (step === null) throw new HttpError(400, 'That code is not right. Make sure your phone shows the time correctly and try the newest code.', 'bad_code')

  const { codes, hashes } = newRecoveryCodes()
  await tx(async (c) => {
    await c.query('UPDATE users SET totp_secret_enc = $2, totp_enabled = true, totp_last_step = $3 WHERE id = $1', [user.id, encrypt(secret), step])
    await c.query('DELETE FROM recovery_codes WHERE user_id = $1', [user.id])
    for (const h of hashes) await c.query('INSERT INTO recovery_codes (user_id, code_hash) VALUES ($1,$2)', [user.id, h])
    // The user just proved possession of the second factor, so this session now counts as MFA.
    await c.query(`UPDATE sessions SET pending_totp_secret_enc = NULL, mfa = true, auth_method = coalesce(auth_method, 'password') || '+totp' WHERE id_hash = $1`, [session.id_hash])
  })
  const ip = clientIp(req.headers)
  securityEvent('auth.mfa_enabled', `two-step verification turned on for ${user.email}`, { 'user.name': user.email, 'client.address': ip })
  await audit({ action: 'auth.mfa_enabled', actor: user, target: `user:${user.id}`, ip })
  await notifyUser(user.email, 'Two-step verification is on', ['Two-step verification was turned on for your account. Keep your recovery codes somewhere safe.'])
  return json({ ok: true, recoveryCodes: codes })
})
