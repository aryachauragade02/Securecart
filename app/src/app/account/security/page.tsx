import type { Metadata } from 'next'
import ChangePassword from '@/components/client/ChangePassword'
import PasskeyPanel from '@/components/client/PasskeyPanel'
import SessionList from '@/components/client/SessionList'
import TotpPanel from '@/components/client/TotpPanel'
import { getAuth } from '@/lib/auth'
import { query } from '@/lib/db'
import { deviceLabel, formatDate, relative } from '@/lib/format'
import { listPasskeys } from '@/lib/passkeys'
import { isStaff } from '@/lib/rbac'

export const metadata: Metadata = { title: 'Security' }

const ACTIVITY: Record<string, string> = {
  'auth.login': 'Signed in', 'auth.logout': 'Signed out', 'auth.register': 'Account created', 'auth.password_changed': 'Password changed',
  'auth.password_reset': 'Password reset', 'auth.mfa_enabled': 'Two-step verification turned on', 'auth.mfa_disabled': 'Two-step verification turned off',
  'auth.passkey_added': 'Passkey added', 'auth.passkey_removed': 'Passkey removed', 'auth.sessions_revoked': 'Signed out other devices',
  'auth.recovery_code_used': 'Recovery code used', 'auth.account_locked': 'Password sign-in paused after failed attempts',
}

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { user, session } = await getAuth()
  const { welcome } = await searchParams
  const [passkeys, sessions, activity, codes] = await Promise.all([
    listPasskeys(user!.id),
    query<{ public_id: string; ip: string | null; user_agent: string | null; created_at: Date; last_seen_at: Date; auth_method: string | null; id_hash: string }>(
      `SELECT public_id, ip, user_agent, created_at, last_seen_at, auth_method, id_hash FROM sessions WHERE user_id = $1 AND stage = 'full' AND expires_at > now() ORDER BY last_seen_at DESC`, [user!.id]),
    query<{ ts: Date; action: string; ip: string | null; details: Record<string, unknown> }>(
      `SELECT ts, action, ip, details FROM audit_log WHERE target = $1 AND action LIKE 'auth.%' ORDER BY id DESC LIMIT 15`, [`user:${user!.id}`]),
    query<{ n: number }>('SELECT count(*)::int AS n FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL', [user!.id]),
  ])
  return (
    <div className="stack-lg">
      <h1 className="h1">Security</h1>
      {welcome && <p className="notice notice-info">Welcome to SecureCart. Add a passkey now: it is faster than a password and cannot be phished.</p>}
      {isStaff(user!.role) && !user!.mfa && (
        <p className="notice notice-wait">Staff tools need a second factor. Add a passkey or turn on two-step verification, then use it to sign in.</p>
      )}

      <section className="panel stack" aria-labelledby="pk">
        <h2 className="h2" id="pk">Passkeys</h2>
        <p className="muted measure">A passkey signs you in with your fingerprint, face or device PIN, or with a hardware security key. It only works on this website, so a fake look-alike site cannot capture it.</p>
        <PasskeyPanel passkeys={passkeys.map((p) => ({ id: p.id, name: p.name, created: formatDate(p.created_at), lastUsed: p.last_used_at ? relative(p.last_used_at) : 'never', synced: p.backed_up }))} />
      </section>

      <section className="panel stack" aria-labelledby="totp">
        <h2 className="h2" id="totp">Two-step verification</h2>
        <p className="muted measure">After your password, enter a 6-digit code from an authenticator app.</p>
        <TotpPanel enabled={user!.totpEnabled} recoveryLeft={codes[0]?.n ?? 0} />
      </section>

      <section className="panel stack" aria-labelledby="pw">
        <h2 className="h2" id="pw">Password</h2>
        <ChangePassword />
      </section>

      <section className="panel stack" aria-labelledby="dev">
        <h2 className="h2" id="dev">Signed-in devices</h2>
        <SessionList sessions={sessions.map((s) => ({
          id: s.public_id, current: s.id_hash === session!.id_hash, device: deviceLabel(s.user_agent), ip: s.ip ?? 'unknown',
          method: s.auth_method ?? 'password', since: formatDate(s.created_at), seen: relative(s.last_seen_at),
        }))} />
      </section>

      <section className="panel stack" aria-labelledby="act">
        <h2 className="h2" id="act">Recent security activity</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>When</th><th>What</th><th>From</th></tr></thead>
            <tbody>
              {activity.map((a, i) => (
                <tr key={i}><td>{formatDate(a.ts)}</td><td>{ACTIVITY[a.action] ?? a.action}{a.details?.method ? ` (${a.details.method})` : ''}</td><td>{a.ip ?? ''}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
