import { cookies } from 'next/headers'
import { pool, one, query, type Db } from './db'
import { randomToken, sha256 } from './crypto'
import { env } from './env'

/** `__Host-` cookies must be Secure, path=/ and have no Domain, so subdomains cannot overwrite them. */
export const SESSION_COOKIE = env.secureCookies ? '__Host-sc_session' : 'sc_session'

export const ABSOLUTE_LIFETIME_MS = 7 * 24 * 3600 * 1000
export const IDLE_CUSTOMER_MS = 24 * 3600 * 1000
export const IDLE_STAFF_MS = 30 * 60 * 1000
const ANONYMOUS_LIFETIME_MS = 3 * 24 * 3600 * 1000

export type Stage = 'anonymous' | 'mfa_pending' | 'full'

export type SessionRow = {
  id_hash: string
  public_id: string
  user_id: string | null
  stage: Stage
  auth_method: string | null
  mfa: boolean
  challenge: string | null
  challenge_expires_at: Date | null
  pending_totp_secret_enc: string | null
  ip: string | null
  user_agent: string | null
  created_at: Date
  last_seen_at: Date
  expires_at: Date
}

async function setCookie(token: string, expires: Date) {
  ;(await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, // not readable from JavaScript, so XSS cannot steal it
    secure: env.secureCookies,
    sameSite: 'lax', // not sent on cross-site POSTs (CSRF defence, alongside the Origin check)
    path: '/',
    expires,
  })
}

export async function clearSessionCookie() {
  ;(await cookies()).delete(SESSION_COOKIE)
}

export async function readSession(): Promise<SessionRow | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token || token.length > 100) return null
  return one<SessionRow>('SELECT * FROM sessions WHERE id_hash = $1 AND expires_at > now()', [sha256(token)])
}

export type NewSession = {
  userId: string | null
  stage: Stage
  authMethod?: string | null
  mfa?: boolean
  ip: string
  userAgent: string
}

export async function createSession(s: NewSession, db: Db = pool): Promise<SessionRow> {
  const token = randomToken(32)
  const lifetime = s.stage === 'anonymous' ? ANONYMOUS_LIFETIME_MS : s.stage === 'mfa_pending' ? 10 * 60 * 1000 : ABSOLUTE_LIFETIME_MS
  const expires = new Date(Date.now() + lifetime)
  const row = await one<SessionRow>(
    `INSERT INTO sessions (id_hash, user_id, stage, auth_method, mfa, ip, user_agent, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [sha256(token), s.userId, s.stage, s.authMethod ?? null, s.mfa ?? false, s.ip, s.userAgent, expires],
    db,
  )
  await setCookie(token, expires)
  return row!
}

/**
 * Replace the current session with a brand-new one (new random ID). Done on every change
 * of privilege (sign-in, MFA completed) to prevent session fixation. A guest cart follows
 * the shopper into their account.
 */
export async function rotateSession(previous: SessionRow | null, next: NewSession): Promise<SessionRow> {
  const created = await createSession(next)
  if (previous) {
    if (next.userId && !previous.user_id) {
      await mergeCart(`s:${previous.public_id}`, `u:${next.userId}`)
    }
    await query('DELETE FROM sessions WHERE id_hash = $1', [previous.id_hash])
  }
  return created
}

export async function mergeCart(from: string, to: string) {
  await query(
    `INSERT INTO cart_items (owner, product_id, quantity)
     SELECT $2, product_id, quantity FROM cart_items WHERE owner = $1
     ON CONFLICT (owner, product_id) DO UPDATE SET quantity = LEAST(10, cart_items.quantity + EXCLUDED.quantity)`,
    [from, to],
  )
  await query('DELETE FROM cart_items WHERE owner = $1', [from])
}

export async function touchSession(s: SessionRow) {
  if (Date.now() - new Date(s.last_seen_at).getTime() > 60_000) {
    await query('UPDATE sessions SET last_seen_at = now() WHERE id_hash = $1', [s.id_hash])
  }
}

export async function deleteSession(idHash: string) {
  await query('DELETE FROM sessions WHERE id_hash = $1', [idHash])
}

export async function revokeUserSessions(userId: string, exceptIdHash?: string) {
  await query('DELETE FROM sessions WHERE user_id = $1 AND id_hash <> $2', [userId, exceptIdHash ?? ''])
}

export async function setChallenge(s: SessionRow, challenge: string) {
  await query(`UPDATE sessions SET challenge = $2, challenge_expires_at = now() + interval '5 minutes' WHERE id_hash = $1`, [s.id_hash, challenge])
}

/** Read and clear the WebAuthn challenge, so each one can be used only once. */
export async function takeChallenge(s: SessionRow): Promise<string | null> {
  // RETURNING sees the updated row, so read the old values through a locked CTE.
  const row = await one<{ challenge: string | null }>(
    `WITH old AS (SELECT challenge, challenge_expires_at FROM sessions WHERE id_hash = $1 FOR UPDATE)
     UPDATE sessions s SET challenge = NULL, challenge_expires_at = NULL FROM old
     WHERE s.id_hash = $1 RETURNING (CASE WHEN old.challenge_expires_at > now() THEN old.challenge END) AS challenge`,
    [s.id_hash],
  )
  return row?.challenge ?? null
}
