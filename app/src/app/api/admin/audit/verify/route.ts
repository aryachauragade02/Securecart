import { audit, verifyChain } from '@/lib/audit'
import { requirePermission } from '@/lib/auth'
import { clientIp, json, route } from '@/lib/http'

export const POST = route(async (req) => {
  const { user } = await requirePermission('audit:read', '/api/admin/audit/verify')
  const result = await verifyChain()
  await audit({ action: 'audit.verified', actor: user, ip: clientIp(req.headers), details: { ok: result.ok, checked: result.checked, first_bad_id: result.firstBadId } })
  return json(result)
})
