import { env, requireSecret } from '../env'
import type { Order } from '../orders'

/**
 * Razorpay in test mode (optional, PAYMENT_PROVIDER=razorpay). The card form is
 * Razorpay's own Checkout, so card numbers never reach this server.
 */
export async function createRazorpayOrder(order: Order): Promise<{ id: string; amount: number; currency: string }> {
  const auth = Buffer.from(`${requireSecret(env.razorpay.keyId, 'RAZORPAY_KEY_ID')}:${requireSecret(env.razorpay.keySecret, 'RAZORPAY_KEY_SECRET')}`).toString('base64')
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: order.total_paise, currency: order.currency, receipt: order.id, notes: { order_number: String(order.number) } }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`Razorpay order creation failed with ${res.status}`)
  return res.json()
}
