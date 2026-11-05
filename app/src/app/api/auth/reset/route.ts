import { z } from 'zod'
import { audit } from '@/lib/audit'
import { sha256 } from '@/lib/crypto'
import { one, tx } from '@/lib/db'
import { HttpError, clientIp, json, readJson, route } from '@/lib/http'
import { notifyUser } from '@/lib/login'
import { hashPassword, passwordProblems } from '@/lib/password'
import { securityEvent } from '@/lib/security-events'
import { passwordInput } from '@/lib/validation'

export const POST = route(async (req) => {
  const { token, password } = await readJson(req, z.object({ token: z.string().min(20).max(100), password: passwordInput }))
  const ip = clientIp(req.headers)
  const reset = await one<{ user_id: string; email: string }>(
    `SELECT r.user_id, u.email FROM password_resets r JOIN users u ON u.id = r.user_id
     WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > now()`, [sha256(token)])
  if (!reset) throw new HttpError(400, 'This reset link is invalid or has expired. Ask for a new one.', 'invalid_token')
  const problems = passwordProblems(password, reset.email)
  if (problems.length) throw new HttpError(400, problems.join(' '), 'weak_password', { problems })

  const hash = await hashPassword(password)
  await tx(async (c) => {
    await c.query(`UPDATE users SET password_hash = $2, password_changed_at = now(), failed_logins = 0, locked_until = NULL WHERE id = $1`, [reset.user_id, hash])
    // Single use: this and every other outstanding link for the account stop working.
    await c.query('UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [reset.user_id])
    // Whoever may have had the old password is signed out everywhere.
    await c.query('DELETE FROM sessions WHERE user_id = $1', [reset.user_id])
  })
  securityEvent('auth.password_reset_completed', `password reset for ${reset.email}`, { 'user.name': reset.email, 'client.address': ip })
  await audit({ action: 'auth.password_reset', actor: { id: reset.user_id, email: reset.email }, target: `user:${reset.user_id}`, ip })
  await notifyUser(reset.email, 'Your SecureCart password was changed', ['The password for your account was just reset, and every device was signed out.'])
  return json({ ok: true })
})
