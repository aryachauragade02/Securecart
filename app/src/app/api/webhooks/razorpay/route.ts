import { audit } from '@/lib/audit'
import { env, requireSecret } from '@/lib/env'
import { HttpError, clientIp, json, route } from '@/lib/http'
import { findOrderByProviderRef, firstTimeSeen, handlePaymentDeclined, handlePaymentSucceeded } from '@/lib/payments/events'
import { verifyRazorpayWebhook } from '@/lib/payments/signature'
import { securityEvent } from '@/lib/security-events'

type RazorpayPayment = { id: string; order_id: string; amount: number; currency: string; error_code?: string; error_reason?: string }

/** Razorpay webhook (needs a public URL, e.g. via a tunnel, when testing locally). */
export const POST = route(async (req) => {
  const raw = await req.text()
  if (raw.length > 256 * 1024) throw new HttpError(413, 'too large')
  if (!verifyRazorpayWebhook(raw, req.headers.get('x-razorpay-signature'), requireSecret(env.razorpay.webhookSecret, 'RAZORPAY_WEBHOOK_SECRET'))) {
    const ip = clientIp(req.headers)
    securityEvent('webhook.signature_invalid', 'rejected Razorpay webhook: signature mismatch', { 'client.address': ip, 'webhook.provider': 'razorpay' }, 'ERROR')
    await audit({ action: 'webhook.rejected', target: 'webhook:razorpay', ip, details: { reason: 'signature mismatch' } })
    throw new HttpError(400, 'invalid signature')
  }
  const body = JSON.parse(raw) as { event: string; payload?: { payment?: { entity?: RazorpayPayment } } }
  const payment = body.payload?.payment?.entity
  const eventId = req.headers.get('x-razorpay-event-id') ?? `${body.event}:${payment?.id}`
  if (!payment) return json({ received: true })
  const order = await findOrderByProviderRef('razorpay', payment.order_id)
  if (!order) return json({ received: true, ignored: 'unknown order' })
  if (!(await firstTimeSeen('razorpay', eventId, body.event, order.id, payment))) return json({ received: true, duplicate: true })
  if (body.event === 'payment.captured' || body.event === 'order.paid') {
    return json({ received: true, result: await handlePaymentSucceeded(order, payment.amount, payment.currency, payment.id) })
  }
  if (body.event === 'payment.failed') await handlePaymentDeclined(order, payment.error_reason ?? payment.error_code ?? 'declined', payment.amount)
  return json({ received: true })
})
