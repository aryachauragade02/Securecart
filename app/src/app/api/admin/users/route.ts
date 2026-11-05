import { requirePermission } from '@/lib/auth'
import { query } from '@/lib/db'
import { json, route } from '@/lib/http'

export const GET = route(async () => {
  await requirePermission('users:read', '/api/admin/users')
  const users = await query(
    `SELECT id, email, name, role, disabled, totp_enabled, locked_until, created_at,
            (SELECT count(*)::int FROM passkeys p WHERE p.user_id = users.id) AS passkeys
     FROM users ORDER BY created_at DESC LIMIT 500`)
  return json({ users })
})
