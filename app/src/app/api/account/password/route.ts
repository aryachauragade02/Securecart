import { z } from 'zod'
import { audit } from '@/lib/audit'
import { requireUser } from '@/lib/auth'
import { one, query } from '@/lib/db'
import { HttpError, clientIp, json, readJson, route } from '@/lib/http'
import { notifyUser } from '@/lib/login'
import { hashPassword, passwordProblems, verifyPassword } from '@/lib/password'
import { LIMITS, hit } from '@/lib/rate-limit'
import { securityEvent } from '@/lib/security-events'
import { revokeUserSessions } from '@/lib/session'
import { passwordInput } from '@/lib/validation'

export const POST = route(async (req) => {
  const { user, session } = await requireUser()
  const { current, next } = await readJson(req, z.object({ current: passwordInput, next: passwordInput }))
  const ip = clientIp(req.headers)
  if (!(await hit(LIMITS.loginPerIp, ip)).allowed) throw new HttpError(429, 'Too many attempts. Wait a few minutes.', 'rate_limited')
  const row = await one<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [user.id])
  // Re-authentication: a stolen, still-open session alone cannot change the password.
  if (!row || !(await verifyPassword(row.password_hash, current))) throw new HttpError(401, 'Your current password is not right.', 'bad_password')
  const problems = passwordProblems(next, user.email)
  if (problems.length) throw new HttpError(400, problems.join(' '), 'weak_password', { problems })
  if (await verifyPassword(row.password_hash, next)) throw new HttpError(400, 'Choose a password different from your current one.')

  await query('UPDATE users SET password_hash = $2, password_changed_at = now() WHERE id = $1', [user.id, await hashPassword(next)])
  await revokeUserSessions(user.id, session.id_hash)
  securityEvent('auth.password_changed', `password changed for ${user.email}`, { 'user.name': user.email, 'client.address': ip })
  await audit({ action: 'auth.password_changed', actor: user, target: `user:${user.id}`, ip, details: { other_sessions_revoked: true } })
  await notifyUser(user.email, 'Your SecureCart password was changed', ['Your password was changed and every other device was signed out.'])
  return json({ ok: true })
})
