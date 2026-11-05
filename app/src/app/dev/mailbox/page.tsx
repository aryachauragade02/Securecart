import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { query } from '@/lib/db'
import { env } from '@/lib/env'
import { formatDate } from '@/lib/format'

export const metadata: Metadata = { title: 'Demo mailbox', robots: { index: false } }

const LINK = /(https?:\/\/[^\s]+)/g

/** Demo mode only: shows the emails the store would have sent. Disabled when DEMO_MODE is off. */
export default async function Mailbox() {
  if (!env.demoMode) notFound()
  const mails = await query<{ id: number; to_email: string; subject: string; body: string; created_at: Date }>(
    'SELECT * FROM mail_outbox ORDER BY id DESC LIMIT 30')
  return (
    <div className="stack-lg">
      <div className="stack">
        <h1 className="h1">Demo mailbox</h1>
        <p className="muted measure">This demo has no email server, so messages the store sends are shown here. A real deployment would send them by email and turn this page off.</p>
      </div>
      {mails.length === 0 && <p className="lede">No messages yet.</p>}
      {mails.map((m) => (
        <article key={m.id} className="panel stack">
          <div className="spread"><h2 className="h3">{m.subject}</h2><span className="meta">{formatDate(m.created_at)}</span></div>
          <p className="meta">To {m.to_email}</p>
          <div className="mail">{m.body.split(LINK).map((part, i) => (i % 2 ? <a key={i} href={part}>{part}</a> : part))}</div>
        </article>
      ))}
    </div>
  )
}
