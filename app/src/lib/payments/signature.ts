import { hmacSha256Hex, safeEqual } from '../crypto'

export const SIGNATURE_TOLERANCE_SECONDS = 300

/**
 * TestPay signs each webhook like Stripe does: header "t=<unix time>,v1=<hex HMAC-SHA256>"
 * over "<t>.<raw body>". Checking the timestamp stops an attacker who captured one
 * delivery from replaying it later. Pure function, unit tested.
 */
export function verifyTimestampedSignature(
  rawBody: string, header: string | null, secret: string, nowSeconds = Math.floor(Date.now() / 1000),
): { ok: true } | { ok: false; reason: string } {
  if (!header) return { ok: false, reason: 'missing signature header' }
  const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=', 2) as [string, string]))
  const t = Number(parts.t)
  if (!Number.isInteger(t) || !parts.v1) return { ok: false, reason: 'malformed signature header' }
  if (Math.abs(nowSeconds - t) > SIGNATURE_TOLERANCE_SECONDS) return { ok: false, reason: 'timestamp outside tolerance (possible replay)' }
  const expected = hmacSha256Hex(secret, `${t}.${rawBody}`)
  return safeEqual(expected, parts.v1) ? { ok: true } : { ok: false, reason: 'signature mismatch' }
}

export function signTimestamped(rawBody: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
  return `t=${nowSeconds},v1=${hmacSha256Hex(secret, `${nowSeconds}.${rawBody}`)}`
}

/** Razorpay Checkout callback: HMAC-SHA256(key_secret, "<order_id>|<payment_id>"). */
export function verifyRazorpayPayment(orderId: string, paymentId: string, signature: string, keySecret: string): boolean {
  return safeEqual(hmacSha256Hex(keySecret, `${orderId}|${paymentId}`), signature)
}

/** Razorpay webhooks: X-Razorpay-Signature = HMAC-SHA256(webhook_secret, raw body). */
export function verifyRazorpayWebhook(rawBody: string, signature: string | null, webhookSecret: string): boolean {
  return !!signature && safeEqual(hmacSha256Hex(webhookSecret, rawBody), signature)
}
