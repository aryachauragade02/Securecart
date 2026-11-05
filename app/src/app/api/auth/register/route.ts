import { z } from 'zod'
import { audit } from '@/lib/audit'
import { one } from '@/lib/db'
import { HttpError, clientIp, json, readJson, route, userAgent } from '@/lib/http'
import { completeLogin } from '@/lib/login'
import { hashPassword, passwordProblems } from '@/lib/password'
import { LIMITS, hit } from '@/lib/rate-limit'
import { securityEvent } from '@/lib/security-events'
import { readSession } from '@/lib/session'
import { emailSchema, nameSchema, passwordInput } from '@/lib/validation'

export const POST = route(async (req) => {
  const body = await readJson(req, z.object({ name: nameSchema, email: emailSchema, password: passwordInput }))
  const ip = clientIp(req.headers)
  const limit = await hit(LIMITS.registerPerIp, ip)
  if (!limit.allowed) throw new HttpError(429, 'Too many new accounts from your network. Try again later.', 'rate_limited', { retryAfter: limit.retryAfterSeconds })
  const problems = passwordProblems(body.password, body.email)
  if (problems.length) throw new HttpError(400, problems.join(' '), 'weak_password', { problems })

  const user = await one<{ id: string; email: string; role: string }>(
    `INSERT INTO users (email, name, password_hash) VALUES ($1,$2,$3) ON CONFLICT (email) DO NOTHING RETURNING id, email, role`,
    [body.email, body.name, await hashPassword(body.password)])
  if (!user) throw new HttpError(409, 'An account with this email already exists. Sign in or reset your password.', 'email_taken')

  securityEvent('auth.registered', `new account ${user.email}`, { 'user.name': user.email, 'client.address': ip })
  await audit({ action: 'auth.register', actor: user, target: `user:${user.id}`, ip })
  await completeLogin(await readSession(), user, 'password', false, ip, userAgent(req.headers))
  return json({ ok: true }, 201)
})
