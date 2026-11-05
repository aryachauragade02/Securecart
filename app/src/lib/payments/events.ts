import { audit } from '../audit'
import { one } from "../db"
import { LIMITS, hit } from '../rate-limit'
import { securityEvent } from '../security-events'
import { markPaid, recordDecline, type Order } from "../orders"
import { expireCheckoutSession } from './testpay'

/** Records a provider event once; returns false if this event ID was already processed (replay or retry). */
export async function firstTimeSeen(provider: string, eventId: string, type: string, orderId: string | null, data: unknown): Promise<boolean> {
  const row = await one(
    `INSERT INTO payment_events (provider, event_id, type, order_id, data) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (provider, event_id) DO NOTHING RETURNING id`,
    [provider, eventId, type, orderId, JSON.stringify(data)])
  return !!row
}

async function ownerEmail(order: Order): Promise<string | null> {
  return (await one<{ email: string }>('SELECT email FROM users WHERE id = $1', [order.user_id]))?.email ?? null
}

export async function handlePaymentSucceeded(order: Order, amountPaise: number, currency: string, providerPaymentId: string) {
  const { result, order: updated } = await markPaid(order.id, amountPaise, currency)
  const email = await ownerEmail(order)
  if (result === 'paid') {
    securityEvent('payment.succeeded', `order #${order.number} paid`, {
      'client.address': order.client_ip, 'user.name': email, 'payment.amount': amountPaise / 100, 'payment.provider': order.provider, 'order.number': order.number,
    })
    await audit({ action: 'payment.succeeded', target: `order:${order.id}`, details: { number: order.number, amount_paise: amountPaise, provider: order.provider, payment_id: providerPaymentId } })
  } else if (result === 'amount_mismatch') {
    securityEvent('payment.declined', `amount mismatch on order #${order.number}`, { 'client.address': order.client_ip, 'user.name': email, 'payment.decline_reason': 'amount_mismatch' }, 'ERROR')
    await audit({ action: 'payment.amount_mismatch', target: `order:${order.id}`, details: { expected: order.total_paise, received: amountPaise, currency } })
  } else if (result === 'not_payable') {
    // Money arrived for an order we had already cancelled: flag it for a refund.
    await audit({ action: 'payment.needs_refund', target: `order:${order.id}`, details: { status: updated?.status, amount_paise: amountPaise, payment_id: providerPaymentId } })
  }
  return result
}

/**
 * A declined payment. Each one is a security event (PulseOps counts them to spot card
 * testing). After repeated declines the order is cancelled and the checkout closed, and
 * further checkouts from the same account or address are refused for a while.
 */
export async function handlePaymentDeclined(order: Order, reason: string, amountPaise: number) {
  const email = await ownerEmail(order)
  securityEvent('payment.declined', `payment declined for order #${order.number}: ${reason}`, {
    'client.address': order.client_ip, 'user.name': email, 'payment.amount': amountPaise / 100, 'payment.decline_reason': reason, 'order.number': order.number,
  }, 'WARN')
  await Promise.all([
    hit(LIMITS.declinesPerUser, order.user_id),
    order.client_ip ? hit(LIMITS.declinesPerIp, order.client_ip) : Promise.resolve(),
  ])
  const { cancelled } = await recordDecline(order.id)
  if (cancelled) {
    if (order.provider === 'testpay' && order.provider_ref) await expireCheckoutSession(order.provider_ref).catch(() => {})
    securityEvent('fraud.checkout_blocked', `order #${order.number} closed after repeated declines`, { 'client.address': order.client_ip, 'user.name': email }, 'WARN')
    await audit({ action: 'payment.order_closed_after_declines', target: `order:${order.id}`, details: { number: order.number } })
  }
}

export async function findOrderByProviderRef(provider: string, ref: string): Promise<Order | null> {
  return one<Order>('SELECT * FROM orders WHERE provider = $1 AND provider_ref = $2', [provider, ref])
}


