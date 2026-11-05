import type { Metadata } from 'next'
import Denied from '@/components/Denied'
import UserActions from '@/components/client/UserActions'
import { adminGuard } from '@/lib/admin-page'
import { query } from '@/lib/db'
import { formatDay } from '@/lib/format'
import { can } from '@/lib/rbac'

export const metadata: Metadata = { title: 'Users · Admin' }

export default async function AdminUsers() {
  const g = await adminGuard('users:read', '/admin/users')
  if (!g.allowed) return <Denied reason={g.reason} />
  const users = await query<{ id: string; email: string; name: string; role: string; disabled: boolean; totp_enabled: boolean; locked: boolean; passkeys: number; created_at: Date }>(
    `SELECT id, email, name, role, disabled, totp_enabled, coalesce(locked_until > now(), false) AS locked, created_at,
            (SELECT count(*)::int FROM passkeys p WHERE p.user_id = users.id) AS passkeys
     FROM users ORDER BY (role <> 'customer') DESC, created_at DESC LIMIT 500`)
  const canWrite = can(g.user.role, 'users:write')
  return (
    <div className="stack-lg">
      <h1 className="h1">Users</h1>
      <p className="muted measure">Changing a role or disabling an account signs that person out everywhere. You cannot change your own role.</p>
      <div className="panel panel-tight table-wrap">
        <table className="table">
          <thead><tr><th>User</th><th>Role</th><th>Second factor</th><th>State</th><th>Joined</th>{canWrite && <th></th>}</tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}<div className="meta">{u.email}</div></td>
                <td>{u.role}</td>
                <td>{[u.passkeys ? `${u.passkeys} passkey${u.passkeys > 1 ? 's' : ''}` : null, u.totp_enabled ? 'code app' : null].filter(Boolean).join(', ') || <span className="muted">none</span>}</td>
                <td>{u.disabled ? <span className="pill pill-stop">disabled</span> : u.locked ? <span className="pill pill-stop">paused</span> : <span className="pill pill-go">active</span>}</td>
                <td>{formatDay(u.created_at)}</td>
                {canWrite && <td className="num">{u.id !== g.user.id && <UserActions id={u.id} role={u.role} disabled={u.disabled} locked={u.locked} />}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
