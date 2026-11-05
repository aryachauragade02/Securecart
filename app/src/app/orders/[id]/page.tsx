import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import OrderStatus from '@/components/Status'
import OrderStatusWatcher from '@/components/client/OrderStatusWatcher'
import { getCurrentUser } from '@/lib/auth'
import { formatDate } from '@/lib/format'
import { formatPaise } from '@/lib/money'
import { getOrderForUser } from '@/lib/orders'

export const metadata: Metadata = { title: 'Order' }

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const user = await getCurrentUser()
  const { id } = await params
  if (!user) redirect(`/login?next=/orders/${encodeURIComponent(id)}`)
  const found = await getOrderForUser(id, user.id)
  if (!found) notFound()
  const { order, items } = found
  const { from } = await searchParams
  return (
    <div className="stack-lg">
      <p className="meta"><Link href="/orders">Orders</Link></p>
      <div className="spread">
        <h1 className="h1">Order #{order.number}</h1>
        <OrderStatus status={order.status} />
      </div>
      {order.status === 'pending_payment' && <OrderStatusWatcher orderId={order.id} from={from ?? null} />}
      {order.status === 'paid' && from === 'payment' && <p className="notice notice-ok">Payment confirmed. Thank you for your order.</p>}
      {order.status === 'cancelled' && <p className="notice notice-bad">This order was cancelled: {order.cancel_reason}. You have not been charged.</p>}
      <div className="summary">
        <div className="panel panel-tight table-wrap">
          <table className="table">
            <thead><tr><th>Item</th><th>Qty</th><th className="num">Price</th><th className="num">Subtotal</th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.product_id}><td>{i.name}</td><td>{i.quantity}</td><td className="num">{formatPaise(i.unit_price_paise)}</td><td className="num">{formatPaise(i.unit_price_paise * i.quantity)}</td></tr>
              ))}
              <tr><td colSpan={3}><strong>Total</strong></td><td className="num"><strong>{formatPaise(order.total_paise)}</strong></td></tr>
            </tbody>
          </table>
        </div>
        <aside className="panel">
          <dl className="kv">
            <dt>Placed</dt><dd>{formatDate(order.created_at)}</dd>
            {order.paid_at && <><dt>Paid</dt><dd>{formatDate(order.paid_at)}</dd></>}
            {order.shipped_at && <><dt>Shipped</dt><dd>{formatDate(order.shipped_at)}</dd></>}
            <dt>Payment</dt><dd>{order.provider === 'razorpay' ? 'Razorpay' : 'TestPay sandbox'}</dd>
            {order.declined_count > 0 && <><dt>Declined attempts</dt><dd>{order.declined_count}</dd></>}
          </dl>
        </aside>
      </div>
    </div>
  )
}
