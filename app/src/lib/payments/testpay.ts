import { env, requireSecret } from '../env'
import type { Order } from '../orders'

/** Client for TestPay, the bundled sandbox payment provider (../testpay). */
async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${env.testpay.apiUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${requireSecret(env.testpay.secretKey, 'TESTPAY_SECRET_KEY')}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(Number(process.env.TESTPAY_TIMEOUT_MS ?? 8000)),
  })
  if (!res.ok) throw new Error(`TestPay ${method} ${path} failed with ${res.status}`)
  return res.json() as Promise<T>
}

export type TestPaySession = { id: string; url: string; status: 'open' | 'paid' | 'expired'; amount: number; currency: string }

export function createCheckoutSession(order: Order, customerEmail: string) {
  return call<TestPaySession>('POST', '/v1/checkout/sessions', {
    amount: order.total_paise,
    currency: order.currency,
    reference: order.id,
    description: `SecureCart order #${order.number}`,
    customer_email: customerEmail,
    success_url: `${env.appOrigin}/orders/${order.id}?from=payment`,
    cancel_url: `${env.appOrigin}/orders/${order.id}?from=cancel`,
  })
}

export function getCheckoutSession(id: string) {
  return call<TestPaySession>('GET', `/v1/checkout/sessions/${encodeURIComponent(id)}`)
}

export function expireCheckoutSession(id: string) {
  return call<TestPaySession>('POST', `/v1/checkout/sessions/${encodeURIComponent(id)}/expire`)
}
