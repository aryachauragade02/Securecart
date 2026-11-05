import type { AuthenticationResponseJSON } from '@simplewebauthn/server'
import { z } from 'zod'
import { one } from '@/lib/db'
import { HttpError, clientIp, json, readJson, route, userAgent } from '@/lib/http'
import { completeLogin } from '@/lib/login'
import { verifyAuthentication } from '@/lib/passkeys'
import { LIMITS, hit } from '@/lib/rate-limit'
import { securityEvent } from '@/lib/security-events'
import { readSession, takeChallenge } from '@/lib/session'

export const POST = route(async (req) => {
  const { response } = await readJson(req, z.object({ response: z.looseObject({ id: z.string().max(1024) }) }))
  const ip = clientIp(req.headers)
  const fail = (reason: string): never => {
    securityEvent('auth.login_failed', `passkey sign-in failed: ${reason}`, { 'client.address': ip, 'auth.failure_reason': reason, 'auth.method': 'passkey' }, 'WARN')
    throw new HttpError(401, 'That passkey could not be verified. Try again or use your password.', 'passkey_failed')
  }
  if (!(await hit(LIMITS.loginPerIp, ip)).allowed) throw new HttpError(429, 'Too many sign-in attempts from your network. Wait a few minutes and try again.', 'rate_limited')
  const session = await readSession()
  const challenge = session ? await takeChallenge(session) : null
  if (!session || !challenge) fail('missing_or_expired_challenge')

  let key
  try {
    key = await verifyAuthentication(response as unknown as AuthenticationResponseJSON, challenge!)
  } catch {
    key = null
  }
  if (!key) fail('invalid_assertion')
  const user = await one<{ id: string; email: string; role: string; disabled: boolean }>('SELECT id, email, role, disabled FROM users WHERE id = $1', [key!.user_id])
  if (!user || user.disabled) fail('disabled')
  // A passkey is phishing-resistant and includes user verification, so it counts as MFA.
  // It also works while password sign-in is locked: an attacker guessing passwords cannot lock the owner out.
  await completeLogin(session, user!, 'passkey', true, ip, userAgent(req.headers))
  return json({ ok: true })
})
