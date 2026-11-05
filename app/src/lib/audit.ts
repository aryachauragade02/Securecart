import crypto from 'node:crypto'
import { pool, query, tx, type Db } from './db'

export const GENESIS_HASH = '0'.repeat(64)

/** JSON with object keys sorted at every level, so the same data always hashes the same way. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const obj = value as Record<string, unknown>
  return `{${Object.keys(obj).filter((k) => obj[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`
}

export type AuditFields = {
  ts: string
  actor_id: string | null
  actor_email: string | null
  action: string
  target: string | null
  ip: string | null
  details: Record<string, unknown>
}

export function entryHash(prevHash: string, f: AuditFields): string {
  return crypto.createHash('sha256').update(prevHash + canonicalJson(f)).digest('hex')
}

export type AuditInput = {
  action: string
  actor?: { id: string; email: string } | null
  target?: string | null
  ip?: string | null
  details?: Record<string, unknown>
}

/** Append one entry. A transaction-scoped advisory lock serialises writers so the chain never forks. */
export async function audit(input: AuditInput): Promise<void> {
  await tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(4711)')
    const last = await c.query<{ hash: string }>('SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1')
    const prev = last.rows[0]?.hash ?? GENESIS_HASH
    const f: AuditFields = {
      ts: new Date().toISOString(),
      actor_id: input.actor?.id ?? null,
      actor_email: input.actor?.email ?? null,
      action: input.action,
      target: input.target ?? null,
      ip: input.ip ?? null,
      details: input.details ?? {},
    }
    await c.query(
      `INSERT INTO audit_log (ts, actor_id, actor_email, action, target, ip, details, prev_hash, hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [f.ts, f.actor_id, f.actor_email, f.action, f.target, f.ip, JSON.stringify(f.details), prev, entryHash(prev, f)],
    )
  })
}

type Row = AuditFields & { id: number; ts: Date; prev_hash: string; hash: string }

export type ChainCheck = { ok: boolean; checked: number; firstBadId: number | null; reason: string | null }

/** Pure verification over rows in id order (unit tested). */
export function verifyRows(rows: Array<Omit<Row, 'ts'> & { ts: Date | string }>): ChainCheck {
  let prev = GENESIS_HASH
  for (const r of rows) {
    const f: AuditFields = {
      ts: new Date(r.ts).toISOString(), actor_id: r.actor_id, actor_email: r.actor_email, action: r.action,
      target: r.target, ip: r.ip, details: r.details ?? {},
    }
    if (r.prev_hash !== prev) return { ok: false, checked: rows.indexOf(r), firstBadId: r.id, reason: 'link to previous entry is broken (an entry was removed or reordered)' }
    if (entryHash(prev, f) !== r.hash) return { ok: false, checked: rows.indexOf(r), firstBadId: r.id, reason: 'entry content does not match its hash (it was edited)' }
    prev = r.hash
  }
  return { ok: true, checked: rows.length, firstBadId: null, reason: null }
}

export async function verifyChain(db: Db = pool): Promise<ChainCheck> {
  const rows = await query<Row>('SELECT * FROM audit_log ORDER BY id', [], db)
  return verifyRows(rows)
}
