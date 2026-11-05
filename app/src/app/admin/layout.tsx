import Link from 'next/link'
import Denied from '@/components/Denied'
import { adminGuard } from '@/lib/admin-page'
import { can } from '@/lib/rbac'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const g = await adminGuard('admin:access', '/admin')
  if (!g.allowed) return <Denied reason={g.reason} />
  const r = g.user.role
  return (
    <div className="two-col">
      <nav className="side-nav" aria-label="Admin">
        <span className="meta">Admin, signed in as {r}</span>
        <Link href="/admin">Overview</Link>
        {can(r, 'orders:read') && <Link href="/admin/orders">Orders</Link>}
        {can(r, 'products:write') && <Link href="/admin/products">Products</Link>}
        {can(r, 'users:read') && <Link href="/admin/users">Users</Link>}
        {can(r, 'audit:read') && <Link href="/admin/audit">Audit log</Link>}
      </nav>
      <div>{children}</div>
    </div>
  )
}
