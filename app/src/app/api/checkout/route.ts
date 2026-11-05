import { audit } from '@/lib/audit'
import { cartOwner, getAuth } from '@/lib/auth'
import { env } from '@/lib/env'
import { HttpError, clientIp, json, route } from '@/lib/http'
import { cancelOrder, createOrderFromCart, expireStaleOrders, setProviderRef } from '@/lib/orders'
import { createRazorpayOrder } from '@/lib/payments/razorpay'
import { createCheckoutSession } from '@/lib/payments/testpay'
import { LIMITS, hit, peek } from '@/lib/rate-limit'
import { securityEvent } from '@/lib/security-events'

export const POST = route(async (req) => {
  const auth = await getAuth()
  if (!auth.user) throw new HttpError(401, 'Sign in to check out.', 'unauthenticated')
  const user = auth.user
  const ip = clientIp(req.headers)
  await expireStaleOrders()

  // Card-testing defence: after several declined payments from one account or address,
  // stop creating new checkouts for a while. Refusals count as declines too, so the
  // pattern stays visible to monitoring.
  const [userDeclines, ipDeclines] = await Promise.all([peek(LIMITS.declinesPerUser, user.id), peek(LIMITS.declinesPerIp, ip)])
  if (userDeclines >= LIMITS.declinesPerUser.limit || ipDeclines >= LIMITS.declinesPerIp.limit) {
    securityEvent('payment.declined', `checkout refused for ${user.email}: too many recent declines`, {
      'client.address': ip, 'user.name': user.email, 'payment.decline_reason': 'velocity_limit',
    }, 'WARN')
    securityEvent('fraud.checkout_blocked', `checkout blocked for ${user.email} from ${ip}`, { 'client.address': ip, 'user.name': user.email }, 'WARN')
    throw new HttpError(429, 'Too many declined payments recently. Wait a while before trying again, or contact support.', 'checkout_blocked')
  }
  const limit = await hit(LIMITS.checkoutPerUser, user.id)
  if (!limit.allowed) throw new HttpError(429, 'Too many checkouts in a short time. Try again in a few minutes.', 'rate_limited', { retryAfter: limit.retryAfterSeconds })

  const order = await createOrderFromCart(user.id, cartOwner(auth)!, ip, env.paymentProvider)
  await audit({ action: 'order.created', actor: user, target: `order:${order.id}`, ip, details: { number: order.number, total_paise: order.total_paise, provider: order.provider } })

  try {
    if (env.paymentProvider === 'razorpay') {
      const rp = await createRazorpayOrder(order)
      await setProviderRef(order.id, rp.id)
      return json({ type: 'razorpay', orderId: order.id, keyId: env.razorpay.keyId, razorpayOrderId: rp.id, amount: rp.amount, currency: rp.currency, email: user.email, name: user.name })
    }
    const session = await createCheckoutSession(order, user.email)
    await setProviderRef(order.id, session.id)
    return json({ type: 'redirect', orderId: order.id, url: session.url })
  } catch (err) {
    console.error(err)
    await cancelOrder(order.id, 'payment provider unavailable')
    throw new HttpError(502, 'The payment provider is not responding. Your cart was not charged; please try again shortly.', 'provider_unavailable')
  }
})
