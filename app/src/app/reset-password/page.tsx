import type { Metadata } from 'next'
import Link from 'next/link'
import ResetForm from '@/components/client/ResetForm'

export const metadata: Metadata = { title: 'Choose a new password', referrer: 'no-referrer' }

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  return (
    <div className="auth"><div className="panel">
      {token ? <ResetForm token={token} /> : <p>This link is incomplete. <Link href="/forgot-password">Ask for a new one</Link>.</p>}
    </div></div>
  )
}
