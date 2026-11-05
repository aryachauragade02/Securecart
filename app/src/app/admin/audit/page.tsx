import type { Metadata } from 'next'
import Link from 'next/link'
import Denied from '@/components/Denied'
import AuditVerify from '@/components/client/AuditVerify'
import { adminGuard } from '@/lib/admin-page'
import { one, query } from '@/lib/db'
import { formatDate } from '@/lib/format'

export const metadata: Metadata = { title: 'Audit log · Admin' }

const PAGE = 50

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; before?: string }> }) {
  const g = await adminGuard('audit:read', '/admin/audit')
  if (!g.allowed) return <Denied reason={g.reason} />
  const { q, before } = await searchParams
  const filter = (q ?? '').trim().slice(0, 60)
  const beforeId = Number(before) || null
  const rows = await query<{ id: number; ts: Date; actor_email: string | null; action: string; target: string | null; ip: string | null; details: Record<string, unknown>; hash: string; prev_hash: string }>(
    `SELECT id, ts, actor_email, action, target, ip, details, hash, prev_hash FROM audit_log
     WHERE ($1 = '' OR action ILIKE '%' || $1 || '%' OR actor_email ILIKE '%' || $1 || '%' OR target ILIKE '%' || $1 || '%')
       AND ($2::bigint IS NULL OR id < $2)
     ORDER BY id DESC LIMIT ${PAGE}`, [filter, beforeId])
  const total = await one<{ n: number }>('SELECT count(*)::int AS n FROM audit_log')
  return (
    <div className="stack-lg">
      <h1 className="h1">Audit log</h1>
      <p className="muted measure">Append-only: the database rejects updates and deletes, and each entry stores a SHA-256 hash of the one before it, so any edit or removal breaks the chain from that point on. {total?.n ?? 0} entries.</p>
      <AuditVerify />
      <form className="row" role="search">
        <label className="sr-only" htmlFor="q">Filter</label>
        <input id="q" name="q" className="input" defaultValue={filter} placeholder="Filter by action, email or target" />
        <button className="btn">Filter</button>
      </form>
      <div className="panel panel-tight table-wrap">
        <table className="table">
          <thead><tr><th>#</th><th>When</th><th>Action</th><th>By</th><th>Target</th><th>From</th><th>Details</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td className="nowrap small">{formatDate(r.ts)}</td>
                <td><strong>{r.action}</strong><div className="chain" title={`hash ${r.hash}`}>{r.hash.slice(0, 16)}…</div></td>
                <td>{r.actor_email ?? 'system'}</td>
                <td className="code small clip" title={r.target ?? ''}>{r.target}</td>
                <td>{r.ip}</td>
                <td className="small clip details" title={JSON.stringify(r.details ?? {})}>{Object.entries(r.details ?? {}).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === PAGE && <p><Link href={`/admin/audit?${new URLSearchParams({ ...(filter ? { q: filter } : {}), before: String(rows[rows.length - 1].id) })}`}>Older entries</Link></p>}
    </div>
  )
}
