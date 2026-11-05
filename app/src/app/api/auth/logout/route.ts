import { audit } from '@/lib/audit'
import { getAuth } from '@/lib/auth'
import { clientIp, json, route } from '@/lib/http'
import { clearSessionCookie, deleteSession } from '@/lib/session'

export const POST = route(async (req) => {
  const { session, user } = await getAuth()
  if (session) await deleteSession(session.id_hash)
  await clearSessionCookie()
  if (user) await audit({ action: 'auth.logout', actor: user, target: `user:${user.id}`, ip: clientIp(req.headers) })
  return json({ ok: true })
})
