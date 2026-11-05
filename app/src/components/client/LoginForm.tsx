'use client'
import { startAuthentication } from '@simplewebauthn/browser'
import Link from 'next/link'
import { useState } from 'react'
import { api, errorMessage } from '@/lib/client-api'
import { safeNext } from '@/lib/safe-next'

export default function LoginForm({ next }: { next: string | null }) {
  const [step, setStep] = useState<'password' | 'mfa'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const done = () => window.location.assign(safeNext(next))

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault()
    run(async () => {
      const r = await api<{ mfaRequired?: boolean }>('/api/auth/login', 'POST', { email, password })
      if (r.mfaRequired) {
        setStep('mfa')
        setBusy(false)
      } else done()
    })
  }

  const submitCode = (e: React.FormEvent) => {
    e.preventDefault()
    run(async () => {
      await api('/api/auth/mfa', 'POST', { code })
      done()
    })
  }

  const passkey = () => run(async () => {
    const options = await api<Parameters<typeof startAuthentication>[0]['optionsJSON']>('/api/auth/passkey/options')
    const response = await startAuthentication({ optionsJSON: options })
    await api('/api/auth/passkey/verify', 'POST', { response })
    done()
  })

  if (step === 'mfa') {
    return (
      <form onSubmit={submitCode} className="stack-lg" noValidate>
        <div className="stack">
          <h1 className="h1">Two-step verification</h1>
          <p className="muted">Enter the 6-digit code from your authenticator app, or one of your recovery codes.</p>
        </div>
        <div className="field">
          <label htmlFor="code">Code</label>
          <input id="code" className="input code-input" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" inputMode="text" autoFocus required maxLength={20} />
        </div>
        {error && <p className="notice notice-bad" role="alert">{error}</p>}
        <button className="btn btn-dark btn-block" disabled={busy || code.trim().length < 6}>Verify and sign in</button>
      </form>
    )
  }

  return (
    <div className="stack-lg">
      <div className="stack">
        <h1 className="h1">Sign in</h1>
        <p className="muted">New to SecureCart? <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Create an account</Link></p>
      </div>
      <button className="btn btn-primary btn-block" onClick={passkey} disabled={busy}>Sign in with a passkey</button>
      <div className="or">or use your password</div>
      <form onSubmit={submitPassword} noValidate>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username webauthn" required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </div>
        {error && <p className="notice notice-bad" role="alert">{error}</p>}
        <div className="spread form-actions">
          <Link href="/forgot-password" className="small">Forgot your password?</Link>
          <button className="btn btn-dark" disabled={busy || !email || !password}>{busy ? 'Signing in' : 'Sign in'}</button>
        </div>
      </form>
    </div>
  )
}
