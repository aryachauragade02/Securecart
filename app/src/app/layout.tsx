import '@fontsource-variable/archivo/wdth.css'
import './globals.css'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { cartOwner, getAuth } from '@/lib/auth'
import { getCart } from '@/lib/cart'
import { env } from '@/lib/env'
import { clientIp } from '@/lib/http'
import { can } from '@/lib/rbac'
import { setRequestAttributes } from '@/lib/telemetry'
import LogoutButton from '@/components/client/LogoutButton'

export const metadata: Metadata = {
  title: { default: 'SecureCart', template: '%s · SecureCart' },
  description: 'Hardware security keys, privacy gear, lab kits and training for people who defend systems.',
  icons: { icon: '/favicon.svg' },
}

function Mark() {
  return (
    <svg className="wordmark-mark" viewBox="0 0 22 26" aria-hidden>
      <path d="M11 1.5 2 5v7c0 6 4 10.5 9 12.5 5-2 9-6.5 9-12.5V5z" fill="#ffc629" stroke="#16181a" strokeWidth="2" strokeLinejoin="round" />
      <path d="M7 13l3 3 5-6" fill="none" stroke="#16181a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  setRequestAttributes({ 'client.address': clientIp(await headers()) })
  const auth = await getAuth()
  const cart = await getCart(cartOwner(auth))
  const user = auth.user
  return (
    <html lang="en-IN">
      <body>
        {env.demoMode && (
          <div className="demo-strip">
            <div className="wrap">
              {env.publicDemo ? (
                <span>Live demo. Create an account and pay with test card 4242 4242 4242 4242; no real money is taken.</span>
              ) : (
                <>
                  <span>Demo store. Payments use the TestPay sandbox; no real money is taken.</span>
                  <span><Link href="/dev/mailbox">Demo mailbox</Link></span>
                </>
              )}
            </div>
          </div>
        )}
        <header className="site-header">
          <div className="wrap">
            <Link href="/" className="wordmark"><Mark />SecureCart</Link>
            <nav className="nav" aria-label="Main">
              <Link href="/">Shop</Link>
              {user && <Link href="/orders">Orders</Link>}
              <Link href="/security">How we protect you</Link>
              {user && can(user.role, 'admin:access') && <Link href="/admin">Admin</Link>}
            </nav>
            <div className="header-tools">
              {user ? (
                <>
                  <Link href="/account">{user.name.split(' ')[0]}</Link>
                  <LogoutButton />
                </>
              ) : (
                <Link href="/login">Sign in</Link>
              )}
              <Link href="/cart" className="cart-link">
                Cart <span className="cart-count" aria-label={`${cart.count} items`}>{cart.count}</span>
              </Link>
            </div>
          </div>
        </header>
        <main><div className="wrap">{children}</div></main>
        <footer className="site-footer">
          <div className="wrap">
            <span>SecureCart, a portfolio project. Product names are fictional.</span>
            <span className="row">
              <Link href="/security">Security</Link>
              <a href="/.well-known/security.txt">security.txt</a>
            </span>
          </div>
        </footer>
      </body>
    </html>
  )
}
