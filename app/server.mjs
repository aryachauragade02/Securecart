// Custom HTTP server around Next.js. Its one job: record the real TCP peer address in
// x-securecart-peer, overwriting any value a client sends. Next.js on its own keeps a
// client-supplied X-Forwarded-For as-is, which would let anyone pick their own IP and
// slip past per-IP rate limits. See lib/http.ts resolveClientIp().
import http from 'node:http'
import next from 'next'

const dev = process.env.NODE_ENV !== 'production'
const port = Number(process.env.PORT ?? 3000)
const app = next({ dev, hostname: '0.0.0.0', port })
const handle = app.getRequestHandler()

// On free hosting the TestPay sandbox sleeps when idle and takes a while to wake. When a
// visitor opens the store, ping it (at most every 5 minutes) so it is awake by checkout.
// Health checks are ignored, so an uptime monitor does not keep both services running.
const WAKE_URL = process.env.WAKE_TESTPAY === 'true' && process.env.TESTPAY_API_URL ? `${process.env.TESTPAY_API_URL.replace(/\/$/, '')}/health` : null
let lastWake = 0
function wakeTestPay(url) {
  if (!WAKE_URL || url === '/api/health' || url?.startsWith('/_next/') || Date.now() - lastWake < 5 * 60_000) return
  lastWake = Date.now()
  fetch(WAKE_URL, { signal: AbortSignal.timeout(90_000) }).catch(() => {})
}

await app.prepare()
http
  .createServer((req, res) => {
    req.headers['x-securecart-peer'] = req.socket.remoteAddress ?? ''
    wakeTestPay(req.url)
    handle(req, res)
  })
  .listen(port, '0.0.0.0', () => console.log(`SecureCart listening on http://localhost:${port} (${dev ? 'dev' : 'production'})`))
