import { z } from 'zod'
import { requireUser } from '@/lib/auth'
import { env, requireSecret } from '@/lib/env'
import { HttpError, json, readJson, route } from '@/lib/http'
import { getOrderForUser } from '@/lib/orders'
import { firstTimeSeen, handlePaymentSucceeded } from '@/lib/payments/events'
import { verifyRazorpayPayment } from '@/lib/payments/signature'

/**
 * Called by the browser after Razorpay Checkout succeeds. The signature binds the payment
 * to the Razorpay order we created server-side for exactly this amount, so the browser
 * cannot claim a payment that did not happen or pay less than the total.
 */
export const POST = route(async (req) => {
  const { user } = await requireUser()
  const b = await readJson(req, z.object({
    orderId: z.uuid(), razorpay_order_id: z.string().max(64), razorpay_payment_id: z.string().max(64), razorpay_signature: z.string().max(128),
  }))
  const found = await getOrderForUser(b.orderId, user.id)
  if (!found || found.order.provider !== 'razorpay' || found.order.provider_ref !== b.razorpay_order_id) throw new HttpError(404, 'Order not found.')
  if (!verifyRazorpayPayment(b.razorpay_order_id, b.razorpay_payment_id, b.razorpay_signature, requireSecret(env.razorpay.keySecret, 'RAZORPAY_KEY_SECRET'))) {
    throw new HttpError(400, 'Payment could not be verified.', 'bad_signature')
  }
  if (!(await firstTimeSeen('razorpay', `checkout:${b.razorpay_payment_id}`, 'checkout.verified', found.order.id, b))) return json({ ok: true, duplicate: true })
  const result = await handlePaymentSucceeded(found.order, found.order.total_paise, found.order.currency, b.razorpay_payment_id)
  return json({ ok: result === 'paid' || result === 'already_paid', result })
})
