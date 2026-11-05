// TestPay: a sandbox payment provider for local development, modelled on hosted
// checkout pages like Stripe Checkout. No dependencies, no real money, no real cards.
//
//   POST /v1/checkout/sessions              (server-to-server, Bearer secret key) create a session
//   GET  /v1/checkout/sessions/:id          read a session
//   POST /v1/checkout/sessions/:id/expire   close a session (the store does this after repeated declines)
//   GET  /pay/:id                           hosted card page the shopper is redirected to
//   POST /pay/:id                           card form submit -> outcome -> signed webhook to the store
//
// Only the documented test card numbers are accepted, and card numbers are never stored
// or logged (only the last four digits of the test card).
import crypto from 'node:crypto'
import http from 'node:http'

const PORT = Number(process.env.PORT ?? 4000)
const PUBLIC_URL = (process.env.TESTPAY_PUBLIC_URL ?? `http://localhost:${PORT}`).replace(/\/$/, '')
const SECRET_KEY = process.env.TESTPAY_SECRET_KEY
const WEBHOOK_SECRET = process.env.TESTPAY_WEBHOOK_SECRET
const WEBHOOK_URL = process.env.STORE_WEBHOOK_URL
const STORE_ORIGIN = (process.env.STORE_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '')

if (!SECRET_KEY || !WEBHOOK_SECRET || !WEBHOOK_URL) {
  console.error('TESTPAY_SECRET_KEY, TESTPAY_WEBHOOK_SECRET and STORE_WEBHOOK_URL must be set')
  process.exit(1)
}

export const TEST_CARDS = {
  '4242424242424242': { outcome: 'succeeded', label: 'Payment succeeds' },
  '4000000000000002': { outcome: 'card_declined', label: 'Declined: generic decline' },
  '4000000000009995': { outcome: 'insufficient_funds', label: 'Declined: insufficient funds' },
  '4000000000000069': { outcome: 'expired_card', label: 'Declined: expired card' },
  '4000000000000127': { outcome: 'incorrect_cvc', label: 'Declined: incorrect CVC' },
}

const sessions = new Map()
const id = (prefix) => `${prefix}_${crypto.randomBytes(12).toString('hex')}`

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const money = (amount, currency) => new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount / 100)

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(data))
}

function readBody(req, limit = 32 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limit) { reject(new Error('body too large')); req.destroy() } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function authorized(req) {
  const h = req.headers.authorization ?? ''
  const given = Buffer.from(h.startsWith('Bearer ') ? h.slice(7) : '')
  const want = Buffer.from(SECRET_KEY)
  return given.length === want.length && crypto.timingSafeEqual(given, want)
}

function publicView(s) {
  return { id: s.id, url: `${PUBLIC_URL}/pay/${s.id}`, status: s.status, amount: s.amount, currency: s.currency, reference: s.reference, attempts: s.attempts.length }
}

function sign(body) {
  const t = Math.floor(Date.now() / 1000)
  const v1 = crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${body}`).digest('hex')
  return `t=${t},v1=${v1}`
}

/** Delivers a webhook; retries with backoff in the background if the store is unreachable. */
async function deliver(event, attempt = 1) {
  const body = JSON.stringify(event)
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'TestPay-Signature': sign(body), 'User-Agent': 'TestPay-Webhooks/1.0' },
      body,
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`store answered ${res.status}`)
    console.log(`webhook ${event.type} ${event.id} delivered`)
    return true
  } catch (err) {
    console.log(`webhook ${event.type} ${event.id} attempt ${attempt} failed: ${err.message}`)
    if (attempt < 5) setTimeout(() => deliver(event, attempt + 1), 2000 * attempt)
    return false
  }
}

function page(title, inner) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
:root{--ink:#1b1f24;--muted:#5f6670;--line:#d9dde3;--brand:#4b3fd6;--bad:#b42318;--ok:#13795b}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:#eef0f4}
.sandbox{background:#fff4c2;border-bottom:1px solid #e7d27a;padding:8px 16px;font-size:13px;text-align:center}
main{max-width:440px;margin:32px auto;padding:0 16px}.card{background:#fff;border:1px solid var(--line);border-radius:10px;padding:24px}
.brand{font-weight:700;color:var(--brand);letter-spacing:-.01em;margin-bottom:16px}.amount{font-size:28px;font-weight:650;margin:2px 0 4px}
.muted{color:var(--muted);font-size:13px}label{display:block;font-size:13px;color:var(--muted);margin:14px 0 4px}
input{width:100%;font:inherit;padding:9px 11px;border:1px solid var(--line);border-radius:6px}input:focus{outline:2px solid var(--brand);border-color:transparent}
.row{display:flex;gap:12px}.row>div{flex:1}button{width:100%;margin-top:20px;padding:11px;border:0;border-radius:6px;background:var(--brand);color:#fff;font:600 15px system-ui,sans-serif;cursor:pointer}
.err{background:#fdecea;color:var(--bad);padding:10px 12px;border-radius:6px;margin-top:14px;font-size:14px}a{color:var(--brand)}
table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}td{padding:4px 0;border-top:1px solid var(--line)}td.n{font-family:ui-monospace,monospace}
.cancel{display:block;text-align:center;margin-top:14px;font-size:14px}.cards{margin-top:16px}</style></head>
<body><div class="sandbox">TestPay sandbox. No real money moves and real cards are rejected. Use a test card below.</div><main>${inner}</main></body></html>`
}

function payPage(s, error) {
  const closed = s.status !== 'open'
  const rows = Object.entries(TEST_CARDS).map(([n, c]) => `<tr><td class="n">${n.replace(/(\d{4})/g, '$1 ').trim()}</td><td>${esc(c.label)}</td></tr>`).join('')
  return page('TestPay checkout', `<div class="card"><div class="brand">TestPay</div>
<div class="muted">${esc(s.description)}</div><div class="amount">${esc(money(s.amount, s.currency))}</div>
<div class="muted">Paying ${esc(new URL(s.success_url).host)}${s.customer_email ? ` as ${esc(s.customer_email)}` : ''}</div>
${closed ? `<div class="err">This checkout is ${s.status === 'paid' ? 'already paid' : 'closed'}. <a href="${esc(s.cancel_url)}">Return to the store</a></div>` : `
<form method="post" action="/pay/${esc(s.id)}" autocomplete="off">
<input type="hidden" name="form_token" value="${esc(s.form_token)}">
<label for="number">Card number</label><input id="number" name="number" inputmode="numeric" placeholder="4242 4242 4242 4242" required>
<div class="row"><div><label for="exp">Expiry</label><input id="exp" name="exp" placeholder="12 / 34" required></div>
<div><label for="cvc">CVC</label><input id="cvc" name="cvc" inputmode="numeric" placeholder="123" required></div></div>
${error ? `<div class="err">${esc(error)}</div>` : ''}
<button type="submit">Pay ${esc(money(s.amount, s.currency))}</button></form>
<a class="cancel" href="${esc(s.cancel_url)}">Cancel and return to the store</a>`}
</div><div class="card cards"><strong>Test cards</strong><div class="muted">Any future expiry date and any 3-digit CVC.</div><table>${rows}</table></div>`)
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
    // form-action also governs the redirect after a successful payment, so the store origin is allowed.
    'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${STORE_ORIGIN}; frame-ancestors 'none'; base-uri 'none'`,
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  })
  res.end(html)
}

const sameOrigin = (url, origin) => { try { return new URL(url).origin === origin } catch { return false } }

async function handle(req, res) {
  const url = new URL(req.url, PUBLIC_URL)
  const parts = url.pathname.split('/').filter(Boolean)

  if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { status: 'ok', sessions: sessions.size })

  if (parts[0] === 'v1' && parts[1] === 'checkout' && parts[2] === 'sessions') {
    if (!authorized(req)) return sendJson(res, 401, { error: 'invalid API key' })
    if (req.method === 'POST' && parts.length === 3) {
      let b
      try { b = JSON.parse(await readBody(req)) } catch { return sendJson(res, 400, { error: 'invalid JSON' }) }
      if (!Number.isInteger(b.amount) || b.amount <= 0) return sendJson(res, 400, { error: 'amount must be a positive integer in the smallest currency unit' })
      if (!sameOrigin(b.success_url, STORE_ORIGIN) || !sameOrigin(b.cancel_url, STORE_ORIGIN)) {
        return sendJson(res, 400, { error: 'success_url and cancel_url must be on the registered store origin' })
      }
      const s = {
        id: id('cs'), status: 'open', amount: b.amount, currency: String(b.currency ?? 'INR').toUpperCase(),
        reference: String(b.reference ?? ''), description: String(b.description ?? '').slice(0, 200),
        customer_email: String(b.customer_email ?? '').slice(0, 200), success_url: b.success_url, cancel_url: b.cancel_url,
        form_token: crypto.randomBytes(16).toString('hex'), attempts: [], created: Date.now(),
      }
      sessions.set(s.id, s)
      return sendJson(res, 200, publicView(s))
    }
    const s = sessions.get(parts[3])
    if (!s) return sendJson(res, 404, { error: 'no such session' })
    if (req.method === 'GET' && parts.length === 4) return sendJson(res, 200, publicView(s))
    if (req.method === 'POST' && parts[4] === 'expire') {
      if (s.status === 'open') s.status = 'expired'
      return sendJson(res, 200, publicView(s))
    }
    return sendJson(res, 404, { error: 'not found' })
  }

  if (parts[0] === 'pay' && parts[1]) {
    const s = sessions.get(parts[1])
    if (!s) return sendHtml(res, 404, page('Not found', '<div class="card">This checkout link is not valid.</div>'))
    if (req.method === 'GET') return sendHtml(res, 200, payPage(s))
    if (req.method !== 'POST') return sendHtml(res, 405, page('Error', '<div class="card">Method not allowed.</div>'))

    const form = new URLSearchParams(await readBody(req))
    const token = Buffer.from(form.get('form_token') ?? '')
    if (token.length !== s.form_token.length || !crypto.timingSafeEqual(token, Buffer.from(s.form_token))) {
      return sendHtml(res, 400, payPage(s, 'This form has expired. Reload the page and try again.'))
    }
    if (s.status !== 'open') return sendHtml(res, 409, payPage(s))
    const number = (form.get('number') ?? '').replace(/\D/g, '')
    const card = TEST_CARDS[number]
    if (!card) return sendHtml(res, 422, payPage(s, 'TestPay only accepts the test card numbers listed below. Never enter a real card here.'))
    if (!/^\d{3,4}$/.test((form.get('cvc') ?? '').trim())) return sendHtml(res, 422, payPage(s, 'Enter a 3-digit CVC.'))

    const paymentId = id('pay')
    const succeeded = card.outcome === 'succeeded'
    s.attempts.push({ id: paymentId, outcome: card.outcome, at: Date.now() })
    if (succeeded) s.status = 'paid'
    const event = {
      id: id('evt'), type: succeeded ? 'payment.succeeded' : 'payment.failed', created: Math.floor(Date.now() / 1000),
      data: {
        session_id: s.id, reference: s.reference, payment_id: paymentId, amount: s.amount, currency: s.currency,
        card_last4: number.slice(-4), ...(succeeded ? {} : { decline_code: card.outcome }),
      },
    }
    await deliver(event)
    if (succeeded) {
      res.writeHead(303, { Location: s.success_url })
      return res.end()
    }
    const reason = { card_declined: 'Your card was declined.', insufficient_funds: 'Your card has insufficient funds.', expired_card: 'Your card has expired.', incorrect_cvc: "Your card's security code is incorrect." }[card.outcome]
    return sendHtml(res, 402, payPage(sessions.get(s.id), reason))
  }

  sendJson(res, 404, { error: 'not found' })
}

http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err)
    if (!res.headersSent) sendJson(res, 500, { error: 'internal error' })
  })
}).listen(PORT, '0.0.0.0', () => console.log(`TestPay sandbox on ${PUBLIC_URL} (webhooks -> ${WEBHOOK_URL})`))

// Sessions older than a day are discarded; this is an in-memory sandbox.
setInterval(() => {
  for (const [k, s] of sessions) if (Date.now() - s.created > 86_400_000) sessions.delete(k)
}, 3_600_000).unref()
