import type { RegistrationResponseJSON } from '@simplewebauthn/server'
import { z } from 'zod'
import { audit } from '@/lib/audit'
import { requireUser } from '@/lib/auth'
import { HttpError, clientIp, json, readJson, route } from '@/lib/http'
import { notifyUser } from '@/lib/login'
import { verifyRegistration } from '@/lib/passkeys'
import { securityEvent } from '@/lib/security-events'
import { takeChallenge } from '@/lib/session'

export const POST = route(async (req) => {
  const { user, session } = await requireUser()
  const { response, name } = await readJson(req, z.object({
    response: z.looseObject({ id: z.string().max(1024) }),
    name: z.string().trim().min(1).max(60).default('Passkey'),
  }))
  const challenge = await takeChallenge(session)
  if (!challenge) throw new HttpError(400, 'The request expired. Try adding the passkey again.', 'expired_challenge')
  let key
  try {
    key = await verifyRegistration(user.id, response as unknown as RegistrationResponseJSON, challenge, name)
  } catch (err) {
    if (String(err).includes('duplicate key')) throw new HttpError(409, 'This passkey is already registered.')
    key = null
  }
  if (!key) throw new HttpError(400, 'The passkey could not be verified.', 'invalid_attestation')
  const ip = clientIp(req.headers)
  securityEvent('auth.passkey_added', `passkey added for ${user.email}`, { 'user.name': user.email, 'client.address': ip })
  await audit({ action: 'auth.passkey_added', actor: user, target: `user:${user.id}`, ip, details: { name, device_type: key.device_type, backed_up: key.backed_up } })
  await notifyUser(user.email, 'A passkey was added to your account', [`A passkey named "${name}" was added to your account.`])
  return json({ ok: true, passkey: { id: key.id, name: key.name } }, 201)
})
