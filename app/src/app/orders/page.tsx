import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import OrderStatus from '@/components/Status'
import { getCurrentUser } from '@/lib/auth'
import { formatDate } from '@/lib/format'
import { formatPaise } from '@/lib/money'
import { listOrdersForUser } from '@/lib/orders'

export const metadata: Metadata = { title: 'Orders' }

export default async function OrdersPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=/orders')
  const orders = await listOrdersForUser(user.id)
  return (
    <div className="stack-lg">
      <h1 className="h1">Your orders</h1>
      {orders.length === 0 ? (
        <p className="lede">No orders yet. <Link href="/">Visit the shop</Link>.</p>
      ) : (
        <div className="panel panel-tight table-wrap">
          <table className="table">
            <thead><tr><th>Order</th><th>Placed</th><th>Items</th><th>Status</th><th className="num">Total</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td><Link href={`/orders/${o.id}`}>#{o.number}</Link></td>
                  <td>{formatDate(o.created_at)}</td>
                  <td>{o.item_count}</td>
                  <td><OrderStatus status={o.status} /></td>
                  <td className="num">{formatPaise(o.total_paise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
