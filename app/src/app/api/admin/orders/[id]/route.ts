import { z } from 'zod'
import { audit } from '@/lib/audit'
import { requirePermission } from '@/lib/auth'
import { one } from '@/lib/db'
import { HttpError, clientIp, json, readJson, route } from '@/lib/http'
import { cancelOrder } from '@/lib/orders'
import { securityEvent } from '@/lib/security-events'

export const PATCH = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const { user } = await requirePermission('orders:update', '/api/admin/orders/[id]')
  const { id } = await ctx.params
  if (!z.uuid().safeParse(id).success) throw new HttpError(404, 'Order not found.')
  const { action } = await readJson(req, z.object({ action: z.enum(['ship', 'cancel']) }))
  let ok = false
  if (action === 'ship') {
    ok = !!(await one(`UPDATE orders SET status = 'shipped', shipped_at = now() WHERE id = $1 AND status = 'paid' RETURNING id`, [id]))
  } else {
    ok = await cancelOrder(id, `cancelled by ${user.email}`)
  }
  if (!ok) throw new HttpError(409, action === 'ship' ? 'Only paid orders can be shipped.' : 'Only orders waiting for payment can be cancelled here.')
  const ip = clientIp(req.headers)
  await audit({ action: `order.${action === 'ship' ? 'shipped' : 'cancelled'}`, actor: user, target: `order:${id}`, ip })
  securityEvent('admin.action', `${user.email} ${action === 'ship' ? 'shipped' : 'cancelled'} order ${id}`, { 'user.name': user.email, 'client.address': ip, 'admin.action': `order.${action}` })
  return json({ ok: true })
})
