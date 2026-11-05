import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=/account')
  return (
    <div className="two-col">
      <nav className="side-nav" aria-label="Account">
        <span className="meta">Account</span>
        <Link href="/account">Profile</Link>
        <Link href="/account/security">Security</Link>
        <Link href="/orders">Orders</Link>
      </nav>
      <div>{children}</div>
    </div>
  )
}
