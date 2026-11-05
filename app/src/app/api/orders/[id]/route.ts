import { requireUser } from '@/lib/auth'
import { HttpError, json, route } from '@/lib/http'
import { getOrderForUser } from '@/lib/orders'
import { handlePaymentSucceeded } from '@/lib/payments/events'
import { getCheckoutSession } from '@/lib/payments/testpay'

/**
 * Order status, polled by the order page after the shopper returns from the payment page.
 * The redirect back proves nothing (anyone can open that URL), so status comes only from
 * our database. If a webhook is late, we reconcile by asking TestPay directly with our secret key.
 */
export const GET = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const { user } = await requireUser()
  const { id } = await ctx.params
  const found = await getOrderForUser(id, user.id)
  if (!found) throw new HttpError(404, 'Order not found.')
  let { order } = found
  if (order.status === 'pending_payment' && order.provider === 'testpay' && order.provider_ref && Date.now() - new Date(order.created_at).getTime() > 5000) {
    const session = await getCheckoutSession(order.provider_ref).catch(() => null)
    if (session?.status === 'paid') {
      await handlePaymentSucceeded(order, session.amount, session.currency, `reconciled:${session.id}`)
      order = (await getOrderForUser(id, user.id))!.order
    }
  }
  return json({ id: order.id, number: order.number, status: order.status, declined: order.declined_count, cancelReason: order.cancel_reason })
})
