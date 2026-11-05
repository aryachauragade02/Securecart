import { requirePermission } from '@/lib/auth'
import { query } from '@/lib/db'
import { json, route } from '@/lib/http'

export const GET = route(async () => {
  await requirePermission('orders:read', '/api/admin/orders')
  const orders = await query(
    `SELECT o.id, o.number, o.status, o.total_paise, o.created_at, o.paid_at, u.email
     FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.created_at DESC LIMIT 200`)
  return json({ orders })
})
