/** Configuration, read once from environment variables. */
function bool(v: string | undefined) {
  return v === 'true' || v === '1'
}

const appOrigin = (process.env.APP_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '')

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://securecart:securecart@localhost:5432/securecart',
  appOrigin,
  rpID: new URL(appOrigin).hostname,
  secureCookies: appOrigin.startsWith('https://'),
  /** 32-byte key (base64) used to encrypt TOTP secrets at rest. */
  dataKey: process.env.DATA_ENCRYPTION_KEY,
  /** How many reverse proxies in front of the app add an X-Forwarded-For entry. 0 = none, use the socket address. */
  trustedProxyHops: Number(process.env.TRUSTED_PROXY_HOPS ?? 0),
  demoMode: bool(process.env.DEMO_MODE),

  paymentProvider: (process.env.PAYMENT_PROVIDER ?? 'testpay') as 'testpay' | 'razorpay',
  testpay: {
    apiUrl: (process.env.TESTPAY_API_URL ?? 'http://localhost:4000').replace(/\/$/, ''),
    secretKey: process.env.TESTPAY_SECRET_KEY ?? '',
    webhookSecret: process.env.TESTPAY_WEBHOOK_SECRET ?? '',
  },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID ?? '',
    keySecret: process.env.RAZORPAY_KEY_SECRET ?? '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
  },
}

export function requireSecret(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is not configured`)
  return value
}
