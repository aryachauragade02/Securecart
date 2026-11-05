import { z } from 'zod'
import { audit } from '@/lib/audit'
import { env, requireSecret } from '@/lib/env'
import { HttpError, clientIp, json, route } from '@/lib/http'
import { findOrderByProviderRef, firstTimeSeen, handlePaymentDeclined, handlePaymentSucceeded } from '@/lib/payments/events'
import { verifyTimestampedSignature } from '@/lib/payments/signature'
import { securityEvent } from '@/lib/security-events'

const Event = z.object({
  id: z.string().min(1).max(100),
  type: z.enum(['payment.succeeded', 'payment.failed']),
  data: z.object({
    session_id: z.string().max(100),
    reference: z.string().max(100),
    payment_id: z.string().max(100),
    amount: z.number().int().positive(),
    currency: z.string().length(3),
    decline_code: z.string().max(50).optional(),
  }),
})

/**
 * TestPay webhook. Trust comes only from the HMAC signature over the raw body (checked
 * before parsing anything), the timestamp window, and the event ID never having been
 * seen before. The amount is checked against our own order total.
 */
export const POST = route(async (req) => {
  const raw = await req.text()
  if (raw.length > 64 * 1024) throw new HttpError(413, 'too large')
  const check = verifyTimestampedSignature(raw, req.headers.get('testpay-signature'), requireSecret(env.testpay.webhookSecret, 'TESTPAY_WEBHOOK_SECRET'))
  if (!check.ok) {
    const ip = clientIp(req.headers)
    securityEvent('webhook.signature_invalid', `rejected TestPay webhook: ${check.reason}`, { 'client.address': ip, 'webhook.provider': 'testpay', 'webhook.reason': check.reason }, 'ERROR')
    await audit({ action: 'webhook.rejected', target: 'webhook:testpay', ip, details: { reason: check.reason } })
    throw new HttpError(400, 'invalid signature')
  }
  const parsed = Event.safeParse(JSON.parse(raw))
  if (!parsed.success) throw new HttpError(400, 'unexpected event shape')
  const event = parsed.data

  const order = await findOrderByProviderRef('testpay', event.data.session_id)
  if (!order || order.id !== event.data.reference) return json({ received: true, ignored: 'unknown order' })
  if (!(await firstTimeSeen('testpay', event.id, event.type, order.id, event.data))) return json({ received: true, duplicate: true })

  if (event.type === 'payment.succeeded') {
    const result = await handlePaymentSucceeded(order, event.data.amount, event.data.currency, event.data.payment_id)
    return json({ received: true, result })
  }
  await handlePaymentDeclined(order, event.data.decline_code ?? 'declined', event.data.amount)
  return json({ received: true })
})
