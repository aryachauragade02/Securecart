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

await app.prepare()
http
  .createServer((req, res) => {
    req.headers['x-securecart-peer'] = req.socket.remoteAddress ?? ''
    handle(req, res)
  })
  .listen(port, '0.0.0.0', () => console.log(`SecureCart listening on http://localhost:${port} (${dev ? 'dev' : 'production'})`))
