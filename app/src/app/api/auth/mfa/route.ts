import { z } from 'zod'
import { audit } from '@/lib/audit'
import { decrypt, sha256 } from '@/lib/crypto'
import { one, query } from '@/lib/db'
import { HttpError, clientIp, json, readJson, route, userAgent } from '@/lib/http'
import { completeLogin, notifyUser } from '@/lib/login'
import { LIMITS, hit } from '@/lib/rate-limit'
import { securityEvent } from '@/lib/security-events'
import { deleteSession, readSession } from '@/lib/session'
import { normalizeRecoveryCode, verifyTotp } from '@/lib/totp'
import { codeSchema } from '@/lib/validation'

export const POST = route(async (req) => {
  const { code } = await readJson(req, z.object({ code: codeSchema }))
  const ip = clientIp(req.headers)
  const session = await readSession()
  if (!session || session.stage !== 'mfa_pending' || !session.user_id) throw new HttpError(401, 'Your sign-in expired. Start again.', 'mfa_expired')
  const user = await one<{ id: string; email: string; role: string; totp_secret_enc: string | null; totp_last_step: number | null; disabled: boolean }>(
    'SELECT id, email, role, totp_secret_enc, totp_last_step, disabled FROM users WHERE id = $1', [session.user_id])
  if (!user || !user.totp_secret_enc || user.disabled) throw new HttpError(401, 'Your sign-in expired. Start again.', 'mfa_expired')

  const limit = await hit(LIMITS.mfaPerSession, session.public_id)
  if (!limit.allowed) {
    await deleteSession(session.id_hash)
    securityEvent('auth.login_failed', `too many verification codes for ${user.email}`, { 'user.name': user.email, 'client.address': ip, 'auth.failure_reason': 'mfa_rate_limited' }, 'WARN')
    throw new HttpError(429, 'Too many incorrect codes. Sign in again.', 'mfa_expired')
  }

  let method: string | null = null
  if (/^\d{6}$/.test(code)) {
    const step = verifyTotp(decrypt(user.totp_secret_enc), code, user.totp_last_step)
    if (step !== null) {
      await query('UPDATE users SET totp_last_step = $2 WHERE id = $1', [user.id, step])
      method = 'password+totp'
    }
  } else {
    const used = await one<{ id: number }>(
      'UPDATE recovery_codes SET used_at = now() WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL RETURNING id',
      [user.id, sha256(normalizeRecoveryCode(code))])
    if (used) method = 'password+recovery_code'
  }

  if (!method) {
    securityEvent('auth.mfa_failed', `wrong verification code for ${user.email}`, { 'user.name': user.email, 'client.address': ip }, 'WARN')
    securityEvent('auth.login_failed', `sign-in failed for ${user.email}: bad_mfa`, { 'user.name': user.email, 'client.address': ip, 'auth.failure_reason': 'bad_mfa' }, 'WARN')
    throw new HttpError(401, 'That code is not right. Check your authenticator app and try again.', 'bad_code')
  }

  await completeLogin(session, user, method, true, ip, userAgent(req.headers))
  if (method === 'password+recovery_code') {
    const left = await one<{ n: number }>('SELECT count(*)::int AS n FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL', [user.id])
    await audit({ action: 'auth.recovery_code_used', actor: user, target: `user:${user.id}`, ip, details: { remaining: left?.n ?? 0 } })
    await notifyUser(user.email, 'A recovery code was used to sign in', [`Someone signed in to your account with a recovery code. You have ${left?.n ?? 0} codes left.`])
  }
  return json({ ok: true })
})
