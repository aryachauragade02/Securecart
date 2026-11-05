// Seeds the catalogue and the demo accounts. Idempotent: existing rows are left alone.
import crypto from 'node:crypto'
import { hash } from '@node-rs/argon2'
import pg from 'pg'

const url = process.env.DATABASE_URL ?? 'postgres://securecart:securecart@localhost:5432/securecart'
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 } // OWASP minimum for argon2id

const P = (rupees) => Math.round(rupees * 100)

const PRODUCTS = [
  {
    slug: 'security-key-usb-c', sku: 'SC-KEY-C1', art: 'key', category: 'Hardware keys',
    name: 'Security key, USB-C', price: P(2499), stock: 60,
    tagline: 'Phishing-resistant sign-in for your accounts.',
    description: 'A FIDO2 / WebAuthn hardware key. Plug it in and touch it to sign in: the key checks the website\'s address itself, so a look-alike phishing site gets nothing it can reuse. Works with passkey-enabled sites, including this store.',
    specs: [['Standards', 'FIDO2, WebAuthn, U2F'], ['Connector', 'USB-C'], ['Passkey slots', '100 resident credentials'], ['Body', 'Water-resistant, no battery']],
  },
  {
    slug: 'security-key-nfc', sku: 'SC-KEY-N2', art: 'key-nfc', category: 'Hardware keys',
    name: 'Security key, USB-A + NFC', price: P(2899), stock: 40,
    tagline: 'Tap it on your phone, plug it into your laptop.',
    description: 'The same phishing-resistant protection with NFC, so you can tap it against a phone to sign in. Register two keys on every account so losing one never locks you out.',
    specs: [['Standards', 'FIDO2, WebAuthn, U2F'], ['Connector', 'USB-A, NFC'], ['Passkey slots', '100 resident credentials'], ['Body', 'Water-resistant, no battery']],
  },
  {
    slug: 'webcam-shutter-3', sku: 'SC-PRV-W3', art: 'shutter', category: 'Privacy gear',
    name: 'Webcam shutter, pack of 3', price: P(299), stock: 300,
    tagline: 'A physical cover for laptop and monitor cameras.',
    description: 'Thin sliding shutters that close over a webcam. Software indicators can be bypassed; a piece of plastic cannot.',
    specs: [['Thickness', '0.7 mm'], ['Fits', 'Laptops, monitors, tablets'], ['Adhesive', 'Residue-free'], ['In the box', '3 shutters']],
  },
  {
    slug: 'faraday-sleeve', sku: 'SC-PRV-F1', art: 'sleeve', category: 'Privacy gear',
    name: 'Faraday sleeve for cards and key fobs', price: P(649), stock: 120,
    tagline: 'Blocks NFC and RFID while the card is inside.',
    description: 'A shielded sleeve that stops contactless cards and car key fobs from being read or relayed while they are inside it.',
    specs: [['Blocks', 'NFC, RFID 13.56 MHz and 125 kHz'], ['Holds', '2 cards or 1 key fob'], ['Material', 'Copper-nickel lined fabric']],
  },
  {
    slug: 'privacy-screen-14', sku: 'SC-PRV-S14', art: 'screen', category: 'Privacy gear',
    name: 'Privacy screen, 14-inch laptop', price: P(1799), stock: 45,
    tagline: 'Your screen is readable only from the front.',
    description: 'A filter that narrows the viewing angle so people beside you on a train or in a cafe see a dark screen.',
    specs: [['Size', '14 in, 16:9 and 16:10'], ['Viewing angle', '±30°'], ['Mount', 'Magnetic strips or adhesive tabs']],
  },
  {
    slug: 'pocket-network-lab', sku: 'SC-LAB-P1', art: 'lab', category: 'Lab kits',
    name: 'Pocket network lab', price: P(5999), stock: 25,
    tagline: 'A small isolated network to practise on safely.',
    description: 'A palm-sized router and two single-board targets on their own isolated network, preloaded with intentionally vulnerable services and a lab guide. Practise scanning, exploitation and detection on equipment you own.',
    specs: [['Includes', 'Travel router, 2 target boards, cables'], ['Lab guide', '24 exercises'], ['Isolation', 'No uplink by default']],
  },
  {
    slug: 'ctf-starter-pack', sku: 'SC-DIG-CTF', art: 'flag', category: 'Training',
    name: 'Capture-the-flag starter pack', price: P(499), stock: 9999,
    tagline: '40 beginner to intermediate challenges, with write-ups.',
    description: 'Downloadable challenges across web, crypto, forensics and reversing, each with a hint ladder and a full write-up for after you solve it.',
    specs: [['Format', 'Digital download'], ['Challenges', '40'], ['Categories', 'Web, crypto, forensics, reversing, OSINT']],
  },
  {
    slug: 'course-web-app-security', sku: 'SC-CRS-WEB', art: 'course', category: 'Training',
    name: 'Course: Web application security', price: P(3499), stock: 9999,
    tagline: 'The OWASP Top 10, attacked and then fixed.',
    description: 'Twelve modules that exploit each class of vulnerability in a practice app and then fix it in code: injection, broken access control, authentication failures, SSRF and more.',
    specs: [['Format', 'Video and labs, self-paced'], ['Length', 'About 18 hours'], ['Access', 'Lifetime']],
  },
  {
    slug: 'course-incident-response', sku: 'SC-CRS-IR', art: 'course-ir', category: 'Training',
    name: 'Course: Incident response fundamentals', price: P(2999), stock: 9999,
    tagline: 'From the first alert to the post-incident review.',
    description: 'Triage, containment, evidence collection and writing the timeline, practised on recorded incidents with real logs.',
    specs: [['Format', 'Video and labs, self-paced'], ['Length', 'About 12 hours'], ['Access', 'Lifetime']],
  },
  {
    slug: 'threat-modelling-guide', sku: 'SC-BK-TM', art: 'book', category: 'Books',
    name: 'Threat modelling field guide', price: P(899), stock: 80,
    tagline: 'STRIDE, data-flow diagrams and attack trees in practice.',
    description: 'A short paperback that walks through threat modelling three real systems, with templates you can copy.',
    specs: [['Pages', '212'], ['Format', 'Paperback'], ['Edition', '2nd']],
  },
  {
    slug: 'sticker-verify-signatures', sku: 'SC-MER-STK', art: 'sticker', category: 'Merch',
    name: 'Sticker: "I verify signatures"', price: P(5), stock: 5000,
    tagline: 'For the laptop lid.',
    description: 'A matte vinyl sticker, 7 cm wide.',
    specs: [['Size', '7 × 4 cm'], ['Finish', 'Matte vinyl']],
  },
]

const client = new pg.Client({ connectionString: url })
await client.connect()

for (const p of PRODUCTS) {
  await client.query(
    `INSERT INTO products (slug, sku, name, tagline, description, category, art, price_paise, stock, specs)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (slug) DO NOTHING`,
    [p.slug, p.sku, p.name, p.tagline, p.description, p.category, p.art, p.price, p.stock, JSON.stringify(p.specs)],
  )
}

// A public demo restarts often (free hosting sleeps when idle). Refill stock that visitors'
// test purchases used up, so the shop never runs out. Prices and other edits are left alone.
if (process.env.PUBLIC_DEMO === 'true') {
  for (const p of PRODUCTS) await client.query('UPDATE products SET stock = $2 WHERE slug = $1 AND stock < $2', [p.slug, p.stock])
}

async function ensureUser(email, name, role, password) {
  const exists = await client.query('SELECT 1 FROM users WHERE email = $1', [email])
  if (exists.rowCount) return false
  await client.query('INSERT INTO users (email, name, role, password_hash) VALUES ($1,$2,$3,$4)',
    [email, name, role, await hash(password, ARGON)])
  return true
}

const staffPassword = process.env.SEED_ADMIN_PASSWORD
if (staffPassword) {
  if (await ensureUser('admin@securecart.test', 'Store admin', 'admin', staffPassword)) console.log('created admin@securecart.test')
  if (await ensureUser('support@securecart.test', 'Support agent', 'support', staffPassword)) console.log('created support@securecart.test')
} else {
  console.log('SEED_ADMIN_PASSWORD not set: no staff accounts created')
}

if (process.env.SEED_DEMO_USERS === 'true') {
  await ensureUser('shopper@securecart.test', 'Demo shopper', 'customer', process.env.SEED_SHOPPER_PASSWORD ?? 'correct-horse-battery')
  // 40 ordinary customers with random passwords. Two of them reuse a password that
  // appears in the attack simulator's "leaked list", so a credential-stuffing run
  // finds a working pair, the way real attacks do.
  const REUSED = { 'customer07@securecart.test': 'Monsoon2019!', 'customer23@securecart.test': 'Monsoon2019!' }
  let created = 0
  for (let i = 1; i <= 40; i++) {
    const email = `customer${String(i).padStart(2, '0')}@securecart.test`
    const pw = REUSED[email] ?? crypto.randomBytes(18).toString('base64url')
    if (await ensureUser(email, `Customer ${i}`, 'customer', pw)) created++
  }
  if (created) console.log(`created ${created} demo customers`)
}

await client.end()
console.log('seed complete')
