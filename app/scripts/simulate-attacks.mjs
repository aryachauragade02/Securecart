// Attack simulator for demos: replays three common attacks against YOUR OWN local
// SecureCart so you can watch the store's defences respond and PulseOps raise incidents.
//
//   1. Credential stuffing  - email/password pairs from a fictional "leaked list", tried across the demo accounts
//   2. Card testing         - many small purchases with declined test cards, using an account taken over in step 1
//   3. Privilege probing    - a customer account calling admin-only API endpoints
//
// Safety: refuses any target that is not a local or Docker-internal hostname, uses only
// the seeded demo accounts and TestPay's documented test cards, and stops by itself.
//
//   node scripts/simulate-attacks.mjs                     # target http://localhost:3000
//   TARGET=http://app:3000 TESTPAY_URL=http://testpay:4000 node scripts/simulate-attacks.mjs   # inside Docker
const TARGET = (process.env.TARGET ?? 'http://localhost:3000').replace(/\/$/, '')
const TESTPAY_URL = process.env.TESTPAY_URL?.replace(/\/$/, '')
const PHASE_SECONDS = Number(process.env.PHASE_SECONDS ?? 75)
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'app', 'securecart', 'testpay', 'host.docker.internal'])

for (const u of [TARGET, TESTPAY_URL].filter(Boolean)) {
  if (!LOCAL_HOSTS.has(new URL(u).hostname)) {
    console.error(`Refusing to run against ${u}: this simulator only targets a local SecureCart you control.`)
    process.exit(1)
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (phase, msg) => console.log(`${new Date().toISOString().slice(11, 19)} [${phase}] ${msg}`)

class Client {
  cookie = ''
  async req(method, path, body, base = TARGET, form = false) {
    const res = await fetch(base + path, {
      method,
      redirect: 'manual',
      headers: {
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(body ? { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' } : {}),
        'User-Agent': 'python-requests/2.31.0', // what a cheap attack script typically sends
      },
      body: body ? (form ? new URLSearchParams(body).toString() : JSON.stringify(body)) : undefined,
    })
    const set = res.headers.getSetCookie?.() ?? []
    for (const c of set) if (/^(__Host-)?sc_session=/.test(c)) this.cookie = c.split(';')[0]
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch {}
    return { status: res.status, json, text }
  }
}

// ---------------------------------------------------------------- 1. stuffing
const LEAKED_PASSWORDS = ['Summer2023!', 'Password123!', 'Qwerty@2024', 'Welcome2024', 'Iloveyou@1', 'Monsoon2019!', 'Mumbai@1234', 'Cricket2022', 'Letmein!2023']

async function credentialStuffing() {
  log('stuffing', `trying leaked passwords against the demo accounts for ${PHASE_SECONDS}s`)
  const victims = []
  // The seed gives two accounts a password that appears in the list; real lists are
  // ordered by "hit rate", so those are tried early.
  const pairs = [['customer07@securecart.test', 'Monsoon2019!'], ['customer23@securecart.test', 'Monsoon2019!']]
  for (let i = 1; i <= 40; i++) for (const pw of LEAKED_PASSWORDS) pairs.push([`customer${String(i).padStart(2, '0')}@securecart.test`, pw])
  const end = Date.now() + PHASE_SECONDS * 1000
  let n = 0, blocked = 0
  for (const [email, password] of pairs) {
    if (Date.now() > end) break
    const c = new Client()
    const r = await c.req('POST', '/api/auth/login', { email, password })
    n++
    if (r.status === 200 && r.json?.ok) { victims.push({ email, client: c }); log('stuffing', `login worked for ${email} (password reused from another breach)`) }
    if (r.status === 429) blocked++
    if (n % 25 === 0) log('stuffing', `${n} attempts, ${blocked} rejected by the store's rate limit`)
    await sleep(450)
  }
  log('stuffing', `done: ${n} attempts, ${victims.length} accounts taken over, ${blocked} blocked by rate limiting`)
  return victims
}

// --------------------------------------------------------------- 2. card test
const DECLINE_CARDS = ['4000000000000002', '4000000000009995', '4000000000000069', '4000000000000127']

async function cardTesting(c) {
  log('cards', `testing "stolen" cards with small purchases for ${PHASE_SECONDS}s`)
  const end = Date.now() + PHASE_SECONDS * 1000
  let declines = 0, refused = 0, attempt = 0
  while (Date.now() < end) {
    await c.req('PUT', '/api/cart', { productId: 11, quantity: 1 }) // the ₹5 sticker
    const co = await c.req('POST', '/api/checkout')
    if (co.status !== 200) {
      refused++
      if (refused === 1) log('cards', `store refused checkout: ${co.json?.error}`)
      await sleep(1500)
      continue
    }
    let url = co.json.url
    if (TESTPAY_URL) url = url.replace(/^https?:\/\/[^/]+/, TESTPAY_URL)
    const u = new URL(url)
    for (let i = 0; i < 3 && Date.now() < end; i++) {
      const page = await c.req('GET', u.pathname, null, u.origin)
      const token = page.text.match(/name="form_token" value="([^"]+)"/)?.[1]
      if (!token) break // checkout closed by the store after repeated declines
      const card = DECLINE_CARDS[attempt++ % DECLINE_CARDS.length]
      await c.req('POST', u.pathname, { form_token: token, number: card, exp: '12/34', cvc: '123' }, u.origin, true)
      declines++
      await sleep(700)
    }
  }
  log('cards', `done: ${declines} declined card attempts, ${refused} checkouts refused by the store's card-testing defence`)
}

// --------------------------------------------------------------- 3. probing
async function privilegeProbing(c) {
  log('probe', `calling admin-only endpoints as a customer for ${PHASE_SECONDS}s`)
  const paths = ['/api/admin/orders', '/api/admin/users', '/api/admin/orders', '/api/admin/users']
  const end = Date.now() + PHASE_SECONDS * 1000
  let n = 0, denied = 0
  while (Date.now() < end) {
    const r = await c.req('GET', paths[n % paths.length])
    n++
    if (r.status === 403) denied++
    if (r.status === 200) log('probe', 'UNEXPECTED: admin data returned to a customer!')
    await sleep(800)
  }
  log('probe', `done: ${n} requests, ${denied} denied with 403`)
}

const health = await new Client().req('GET', '/api/health').catch(() => null)
if (!health || health.status !== 200) {
  console.error(`SecureCart is not reachable at ${TARGET}`)
  process.exit(1)
}
console.log(`Simulating attacks against ${TARGET}. Watch PulseOps (Incidents, Security) while this runs.\n`)
const victims = await credentialStuffing()
const foothold = victims[0]?.client
if (!foothold) {
  log('main', 'no account was taken over; skipping card testing and probing')
} else {
  log('main', `using ${victims[0].email} for the next two attacks`)
  await Promise.all([cardTesting(foothold), privilegeProbing(foothold)])
}
console.log('\nSimulation finished. In SecureCart, sign in as admin to see the audit log; in PulseOps, open the security incidents.')
