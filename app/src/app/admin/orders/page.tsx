import type { Metadata } from 'next'
import Denied from '@/components/Denied'
import OrderStatus from '@/components/Status'
import OrderActions from '@/components/client/OrderActions'
import { adminGuard } from '@/lib/admin-page'
import { query } from '@/lib/db'
import { formatDate } from '@/lib/format'
import { formatPaise } from '@/lib/money'
import { can } from '@/lib/rbac'

export const metadata: Metadata = { title: 'Orders · Admin' }

export default async function AdminOrders() {
  const g = await adminGuard('orders:read', '/admin/orders')
  if (!g.allowed) return <Denied reason={g.reason} />
  const orders = await query<{ id: string; number: number; status: string; total_paise: number; created_at: Date; email: string; declined_count: number; client_ip: string | null }>(
    `SELECT o.id, o.number, o.status, o.total_paise, o.created_at, o.declined_count, o.client_ip, u.email
     FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.created_at DESC LIMIT 200`)
  const canUpdate = can(g.user.role, 'orders:update')
  return (
    <div className="stack-lg">
      <h1 className="h1">Orders</h1>
      <div className="panel panel-tight table-wrap">
        <table className="table">
          <thead><tr><th>Order</th><th>Customer</th><th>Placed</th><th>Status</th><th>Declines</th><th className="num">Total</th><th></th></tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>#{o.number}</td>
                <td>{o.email}<div className="meta">{o.client_ip}</div></td>
                <td>{formatDate(o.created_at)}</td>
                <td><OrderStatus status={o.status} /></td>
                <td>{o.declined_count || ''}</td>
                <td className="num">{formatPaise(o.total_paise)}</td>
                <td className="num">{canUpdate && <OrderActions id={o.id} status={o.status} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
