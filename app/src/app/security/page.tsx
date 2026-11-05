import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'How we protect you' }

const CONTROLS: [string, string][] = [
  ['Passkeys', 'Sign in with your device or a hardware key using WebAuthn. The passkey is bound to this site, so a look-alike phishing page cannot use it.'],
  ['Two-step verification', 'Codes from an authenticator app, checked so that each code works only once, plus ten single-use recovery codes stored only as hashes.'],
  ['Password storage', 'Passwords are hashed with argon2id (19 MiB memory cost). We reject short and very common passwords.'],
  ['Brute-force protection', 'Sign-in attempts are rate-limited per network address. Ten wrong passwords pause password sign-in on that account for 15 minutes and email the owner; passkeys still work.'],
  ['Sessions', 'Session cookies are HttpOnly and SameSite, a new session ID is issued at every sign-in, and you can see and end every signed-in device. Staff sessions expire after 30 idle minutes.'],
  ['Payments', 'You pay on the payment provider’s hosted page, so your card number never reaches our servers. Orders are marked paid only from signed provider webhooks, never from the browser.'],
  ['Card-testing defence', 'Repeated declined payments close the checkout and pause new ones from that account and address.'],
  ['Staff access', 'Staff roles get only the permissions they need, and staff tools require a second factor.'],
  ['Audit log', 'Sign-ins, payments and staff actions go to an append-only log in which every entry is chained to the previous one by a SHA-256 hash.'],
  ['Browser protections', 'A strict Content-Security-Policy with per-request nonces, HSTS, framing blocked, and cross-site form posts rejected.'],
  ['Monitoring', 'Traces and security events go to PulseOps, which alerts on spikes in failed sign-ins, declined payments and forbidden requests.'],
]

export default function SecurityPage() {
  return (
    <div className="stack-lg">
      <div className="stack">
        <h1 className="display">How we protect you</h1>
        <p className="lede">Every control below is implemented in this store’s code. Found a problem? See our <a href="/.well-known/security.txt">security.txt</a>.</p>
      </div>
      <div className="controls">
        {CONTROLS.map(([title, text]) => (
          <section key={title} className="panel">
            <h2 className="h3">{title}</h2>
            <p className="muted">{text}</p>
          </section>
        ))}
      </div>
      <p><Link className="btn btn-primary" href="/account/security">Review your account security</Link></p>
    </div>
  )
}
