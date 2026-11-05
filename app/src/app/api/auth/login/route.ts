import { z } from 'zod'
import { audit } from '@/lib/audit'
import { one, query } from '@/lib/db'
import { HttpError, clientIp, json, readJson, route, userAgent } from '@/lib/http'
import { completeLogin, notifyUser } from '@/lib/login'
import { burnPasswordCheck, verifyPassword } from '@/lib/password'
import { LIMITS, hit } from '@/lib/rate-limit'
import { securityEvent } from '@/lib/security-events'
import { readSession, rotateSession } from '@/lib/session'
import { emailSchema, passwordInput } from '@/lib/validation'

const MAX_FAILURES = 10
const LOCK_MINUTES = 15
const GENERIC = 'Incorrect email or password.'

type UserRow = { id: string; email: string; role: string; password_hash: string; disabled: boolean; failed_logins: number; locked_until: Date | null; totp_enabled: boolean }

export const POST = route(async (req) => {
  const { email, password } = await readJson(req, z.object({ email: emailSchema, password: passwordInput }))
  const ip = clientIp(req.headers)
  const ua = userAgent(req.headers)

  const reject = (reason: string, status = 401, message = GENERIC, extra?: Record<string, unknown>): never => {
    securityEvent('auth.login_failed', `sign-in failed for ${email}: ${reason}`,
      { 'user.name': email, 'client.address': ip, 'auth.failure_reason': reason }, 'WARN')
    throw new HttpError(status, message, reason === 'rate_limited' ? 'rate_limited' : 'invalid_credentials', extra)
  }

  // Per-IP limit first, before any password work, so a flood is cheap to turn away.
  const limit = await hit(LIMITS.loginPerIp, ip)
  if (!limit.allowed) {
    reject('rate_limited', 429, 'Too many sign-in attempts from your network. Wait a few minutes and try again.', { retryAfter: limit.retryAfterSeconds })
  }

  const user = await one<UserRow>('SELECT id, email, role, password_hash, disabled, failed_logins, locked_until, totp_enabled FROM users WHERE email = $1', [email])
  if (!user) {
    await burnPasswordCheck(password) // same timing as a real account
    reject('unknown_user')
  }
  const u = user!
  // A locked account answers exactly like a wrong password (no account enumeration);
  // the owner was emailed when the lock started and can still use a passkey.
  if (u.locked_until && new Date(u.locked_until) > new Date()) {
    await burnPasswordCheck(password)
    reject('locked')
  }
  if (!(await verifyPassword(u.password_hash, password))) {
    const updated = await one<{ failed_logins: number }>('UPDATE users SET failed_logins = failed_logins + 1 WHERE id = $1 RETURNING failed_logins', [u.id])
    if ((updated?.failed_logins ?? 0) >= MAX_FAILURES) {
      await query(`UPDATE users SET failed_logins = 0, locked_until = now() + make_interval(mins => $2) WHERE id = $1`, [u.id, LOCK_MINUTES])
      securityEvent('auth.account_locked', `password sign-in locked for ${LOCK_MINUTES} minutes for ${u.email}`, { 'user.name': u.email, 'client.address': ip }, 'WARN')
      await audit({ action: 'auth.account_locked', target: `user:${u.id}`, ip, details: { minutes: LOCK_MINUTES, failures: MAX_FAILURES } })
      await notifyUser(u.email, 'Password sign-in paused on your account', [
        `There were ${MAX_FAILURES} failed password attempts on your SecureCart account, so password sign-in is paused for ${LOCK_MINUTES} minutes.`,
        'You can still sign in with a passkey, or reset your password.',
      ])
    }
    reject('bad_password')
  }
  if (u.disabled) reject('disabled')

  const previous = await readSession()
  if (u.totp_enabled) {
    await rotateSession(previous, { userId: u.id, stage: 'mfa_pending', authMethod: 'password', ip, userAgent: ua })
    return json({ mfaRequired: true })
  }
  await completeLogin(previous, u, 'password', false, ip, ua)
  return json({ ok: true })
})
