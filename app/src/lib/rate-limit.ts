import { pool, type Db } from './db'

export type Limit = { name: string; limit: number; windowSeconds: number }

export const LIMITS = {
  loginPerIp: { name: 'login-ip', limit: 30, windowSeconds: 600 },
  mfaPerSession: { name: 'mfa', limit: 6, windowSeconds: 300 },
  registerPerIp: { name: 'register-ip', limit: 5, windowSeconds: 3600 },
  resetPerEmail: { name: 'reset-email', limit: 3, windowSeconds: 3600 },
  resetPerIp: { name: 'reset-ip', limit: 10, windowSeconds: 3600 },
  checkoutPerUser: { name: 'checkout-user', limit: 10, windowSeconds: 600 },
  declinesPerUser: { name: 'declines-user', limit: 5, windowSeconds: 1800 },
  declinesPerIp: { name: 'declines-ip', limit: 8, windowSeconds: 1800 },
} satisfies Record<string, Limit>

/**
 * Sliding-window estimate from two fixed windows (the approach used by many CDNs):
 *   estimate = previous_count * (portion of previous window still in range) + current_count
 * Pure so it can be unit tested.
 */
export function slidingEstimate(prev: number, curr: number, elapsedFraction: number): number {
  return prev * (1 - elapsedFraction) + curr
}

function windowInfo(l: Limit, nowMs: number) {
  const size = l.windowSeconds * 1000
  const index = Math.floor(nowMs / size)
  return { index, elapsed: (nowMs - index * size) / size, end: new Date((index + 2) * size) }
}

export type RateResult = { allowed: boolean; count: number; retryAfterSeconds: number }

/** Count one attempt and say whether it is within the limit. Stored in Postgres so limits survive restarts. */
export async function hit(l: Limit, subject: string, db: Db = pool, nowMs = Date.now()): Promise<RateResult> {
  const w = windowInfo(l, nowMs)
  const base = `${l.name}:${subject}:`
  const res = await db.query<{ count: number }>(
    `INSERT INTO rate_limits (key, count, expires_at) VALUES ($1, 1, $2)
     ON CONFLICT (key) DO UPDATE SET count = rate_limits.count + 1 RETURNING count`,
    [base + w.index, w.end],
  )
  const prev = await db.query<{ count: number }>('SELECT count FROM rate_limits WHERE key = $1', [base + (w.index - 1)])
  const estimate = slidingEstimate(prev.rows[0]?.count ?? 0, res.rows[0].count, w.elapsed)
  if (Math.random() < 0.02) db.query('DELETE FROM rate_limits WHERE expires_at < now()').catch(() => {})
  const allowed = estimate <= l.limit
  return { allowed, count: Math.ceil(estimate), retryAfterSeconds: allowed ? 0 : Math.ceil((1 - w.elapsed) * l.windowSeconds) }
}

/** Read the current estimate without counting an attempt. */
export async function peek(l: Limit, subject: string, db: Db = pool, nowMs = Date.now()): Promise<number> {
  const w = windowInfo(l, nowMs)
  const base = `${l.name}:${subject}:`
  const rows = await db.query<{ key: string; count: number }>('SELECT key, count FROM rate_limits WHERE key = ANY($1)', [[base + w.index, base + (w.index - 1)]])
  const get = (k: string) => rows.rows.find((r) => r.key === k)?.count ?? 0
  return Math.ceil(slidingEstimate(get(base + (w.index - 1)), get(base + w.index), w.elapsed))
}

export async function reset(l: Limit, subject: string, db: Db = pool): Promise<void> {
  await db.query('DELETE FROM rate_limits WHERE key LIKE $1', [`${l.name}:${subject}:%`])
}
