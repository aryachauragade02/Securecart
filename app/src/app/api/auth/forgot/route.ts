import { z } from 'zod'
import { randomToken, sha256 } from '@/lib/crypto'
import { one } from '@/lib/db'
import { env } from '@/lib/env'
import { clientIp, json, readJson, route } from '@/lib/http'
import { sendMail } from '@/lib/mail'
import { LIMITS, hit } from '@/lib/rate-limit'
import { securityEvent } from '@/lib/security-events'
import { emailSchema } from '@/lib/validation'

const SAME_ANSWER = { ok: true, message: 'If an account exists for that email, we have sent a link to reset the password. It works for 30 minutes.' }

export const POST = route(async (req) => {
  const { email } = await readJson(req, z.object({ email: emailSchema }))
  const ip = clientIp(req.headers)
  // The response is identical whether or not the account exists, and limits stop the
  // form being used to flood someone's inbox.
  const [byIp, byEmail] = await Promise.all([hit(LIMITS.resetPerIp, ip), hit(LIMITS.resetPerEmail, email)])
  if (!byIp.allowed || !byEmail.allowed) return json(SAME_ANSWER)

  const user = await one<{ id: string; email: string }>('SELECT id, email FROM users WHERE email = $1 AND NOT disabled', [email])
  securityEvent('auth.password_reset_requested', `password reset requested for ${email}`, { 'user.name': email, 'client.address': ip, 'account.exists': !!user })
  if (!user) return json(SAME_ANSWER)

  const token = randomToken(32)
  await one(`INSERT INTO password_resets (token_hash, user_id, expires_at, ip) VALUES ($1,$2, now() + interval '30 minutes', $3)`, [sha256(token), user.id, ip])
  await sendMail(user.email, 'Reset your SecureCart password', [
    'Someone asked to reset the password for your SecureCart account.',
    '',
    `Open this link to choose a new password (it works once, for 30 minutes):`,
    `${env.appOrigin}/reset-password?token=${token}`,
    '',
    'If you did not ask for this, ignore this email. Your password has not changed.',
  ].join('\n'))
  return json(SAME_ANSWER)
})
