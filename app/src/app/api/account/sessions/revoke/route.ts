import { z } from 'zod'
import { audit } from '@/lib/audit'
import { requireUser } from '@/lib/auth'
import { query } from '@/lib/db'
import { clientIp, json, readJson, route } from '@/lib/http'
import { securityEvent } from '@/lib/security-events'

export const POST = route(async (req) => {
  const { user, session } = await requireUser()
  const { target } = await readJson(req, z.object({ target: z.union([z.literal('others'), z.uuid()]) }))
  const rows = target === 'others'
    ? await query('DELETE FROM sessions WHERE user_id = $1 AND id_hash <> $2 RETURNING public_id', [user.id, session.id_hash])
    : await query('DELETE FROM sessions WHERE user_id = $1 AND public_id = $2 AND id_hash <> $3 RETURNING public_id', [user.id, target, session.id_hash])
  const ip = clientIp(req.headers)
  securityEvent('auth.session_revoked', `${rows.length} session(s) revoked by ${user.email}`, { 'user.name': user.email, 'client.address': ip })
  await audit({ action: 'auth.sessions_revoked', actor: user, target: `user:${user.id}`, ip, details: { count: rows.length } })
  return json({ ok: true, revoked: rows.length })
})
