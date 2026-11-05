import type { Metadata } from 'next'
import { one, query } from '@/lib/db'
import { formatDate } from '@/lib/format'
import { formatPaise } from '@/lib/money'

export const metadata: Metadata = { title: 'Admin' }

export default async function AdminHome() {
  const stats = await one<{ paid_today: number; revenue_today: number; pending: number; customers: number; locked: number }>(`
    SELECT (SELECT count(*)::int FROM orders WHERE status IN ('paid','shipped') AND paid_at > now() - interval '24 hours') AS paid_today,
           (SELECT coalesce(sum(total_paise),0)::int FROM orders WHERE status IN ('paid','shipped') AND paid_at > now() - interval '24 hours') AS revenue_today,
           (SELECT count(*)::int FROM orders WHERE status = 'pending_payment') AS pending,
           (SELECT count(*)::int FROM users WHERE role = 'customer') AS customers,
           (SELECT count(*)::int FROM users WHERE locked_until > now()) AS locked`)
  const events = await query<{ ts: Date; action: string; actor_email: string | null; target: string | null; ip: string | null }>(
    `SELECT ts, action, actor_email, target, ip FROM audit_log
     WHERE action IN ('auth.account_locked','payment.order_closed_after_declines','webhook.rejected','payment.amount_mismatch','payment.needs_refund','user.role_changed','user.disabled','auth.mfa_disabled')
     ORDER BY id DESC LIMIT 12`)
  return (
    <div className="stack-lg">
      <h1 className="h1">Overview</h1>
      <div className="stat-row">
        <div className="stat"><div className="meta">Paid orders, 24 h</div><div className="stat-value">{stats?.paid_today}</div></div>
        <div className="stat"><div className="meta">Revenue, 24 h</div><div className="stat-value">{formatPaise(stats?.revenue_today ?? 0)}</div></div>
        <div className="stat"><div className="meta">Awaiting payment</div><div className="stat-value">{stats?.pending}</div></div>
        <div className="stat"><div className="meta">Accounts paused</div><div className="stat-value">{stats?.locked}</div></div>
      </div>
      <section className="panel panel-tight">
        <div className="panel-head"><h2 className="h2">Security-relevant events</h2><p className="small muted">From the audit log. Live attack detection runs in PulseOps.</p></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>When</th><th>Event</th><th>By</th><th>Target</th><th>From</th></tr></thead>
            <tbody>
              {events.length === 0 && <tr><td colSpan={5} className="muted">Nothing yet.</td></tr>}
              {events.map((e, i) => <tr key={i}><td>{formatDate(e.ts)}</td><td>{e.action}</td><td>{e.actor_email ?? 'system'}</td><td className="code small">{e.target}</td><td>{e.ip}</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
