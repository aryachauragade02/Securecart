import type { Metadata } from 'next'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { one } from '@/lib/db'
import { formatDay } from '@/lib/format'

export const metadata: Metadata = { title: 'Account' }

export default async function AccountPage() {
  const user = (await getCurrentUser())!
  const info = await one<{ created_at: Date; passkeys: number }>(
    'SELECT created_at, (SELECT count(*)::int FROM passkeys WHERE user_id = users.id) AS passkeys FROM users WHERE id = $1', [user.id])
  const protectedWell = user.totpEnabled || (info?.passkeys ?? 0) > 0
  return (
    <div className="stack-lg">
      <h1 className="h1">Hello, {user.name}</h1>
      <div className="panel">
        <dl className="kv">
          <dt>Email</dt><dd>{user.email}</dd>
          <dt>Role</dt><dd>{user.role}</dd>
          <dt>Member since</dt><dd>{info ? formatDay(info.created_at) : ''}</dd>
          <dt>This sign-in</dt><dd>{user.authMethod ?? 'password'}{user.mfa ? ', with a second factor' : ''}</dd>
        </dl>
      </div>
      <p className={`notice ${protectedWell ? 'notice-ok' : 'notice-wait'}`}>
        {protectedWell
          ? 'Your account has a second factor. Review it any time on the security page.'
          : <>Your account is protected by a password only. <Link href="/account/security">Add a passkey or two-step verification</Link>.</>}
      </p>
    </div>
  )
}
