import { logs, SeverityNumber } from '@opentelemetry/api'
import { NextResponse, type NextRequest } from 'next/server'

const APP_ORIGIN = (process.env.APP_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '')
const HTTPS = APP_ORIGIN.startsWith('https://')
const RAZORPAY = process.env.PAYMENT_PROVIDER === 'razorpay'
const DEV = process.env.NODE_ENV === 'development'

function contentSecurityPolicy(nonce: string): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // Only scripts carrying this response's nonce run; 'strict-dynamic' lets those load
    // their own dependencies (Next.js chunks, Razorpay's checkout script).
    'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(DEV ? ["'unsafe-eval'"] : [])],
    'style-src': ["'self'", `'nonce-${nonce}'`],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'", ...(RAZORPAY ? ['https://api.razorpay.com', 'https://lumberjack.razorpay.com'] : [])],
    'frame-src': RAZORPAY ? ['https://api.razorpay.com', 'https://checkout.razorpay.com'] : ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  }
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(' ')}`)
  if (HTTPS) parts.push('upgrade-insecure-requests')
  return parts.join('; ')
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Cross-site request forgery defence for the JSON API ("verify origin with standard
 * headers", OWASP). Browsers always send Origin and Sec-Fetch-Site on cross-origin
 * requests, so a forged request from another site is rejected here. Non-browser clients
 * send neither and cannot ride on a victim's cookies anyway. Payment webhooks are exempt:
 * they come from the provider's servers and are authenticated by signature instead.
 */
function crossSiteRejected(req: NextRequest): string | null {
  if (SAFE_METHODS.has(req.method) || req.nextUrl.pathname.startsWith('/api/webhooks/')) return null
  const origin = req.headers.get('origin')
  if (origin && origin !== APP_ORIGIN) return `origin ${origin}`
  const site = req.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') return `sec-fetch-site ${site}`
  return null
}

export function proxy(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith('/api/')) {
    const reason = crossSiteRejected(req)
    if (reason) {
      const message = `blocked cross-site ${req.method} ${req.nextUrl.pathname} (${reason})`
      const attributes = { 'event.name': 'request.cross_site_blocked', 'http.route': req.nextUrl.pathname }
      logs.getLogger('securecart.security').emit({ severityNumber: SeverityNumber.WARN, severityText: 'WARN', body: message, attributes })
      console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'WARN', message, ...attributes }))
      return NextResponse.json({ error: 'Cross-site request blocked.' }, { status: 403 })
    }
    const res = NextResponse.next()
    res.headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
    res.headers.set('Cache-Control', 'no-store')
    return res
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = contentSecurityPolicy(nonce)
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)
  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.headers.set('Content-Security-Policy', csp)
  return res
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.svg).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
