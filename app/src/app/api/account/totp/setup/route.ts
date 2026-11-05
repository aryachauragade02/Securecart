import QRCode from 'qrcode'
import { requireUser } from '@/lib/auth'
import { encrypt } from '@/lib/crypto'
import { query } from '@/lib/db'
import { HttpError, json, route } from '@/lib/http'
import { newTotpSecret, totpUri } from '@/lib/totp'

/** Step 1 of enrolment: a new secret, held (encrypted) on this session until a code proves the app has it. */
export const POST = route(async () => {
  const { user, session } = await requireUser()
  if (user.totpEnabled) throw new HttpError(409, 'Two-step verification is already on.')
  const secret = newTotpSecret()
  await query('UPDATE sessions SET pending_totp_secret_enc = $2 WHERE id_hash = $1', [session.id_hash, encrypt(secret)])
  const uri = totpUri(secret, user.email)
  return json({ secret, uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) })
})
