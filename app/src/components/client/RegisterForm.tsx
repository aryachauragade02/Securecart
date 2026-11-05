'use client'
import Link from 'next/link'
import { useState } from 'react'
import { ApiError, api, errorMessage } from '@/lib/client-api'
import { safeNext } from '@/lib/safe-next'

export default function RegisterForm({ next }: { next: string | null }) {
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | string[] | null>(null)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/api/auth/register', 'POST', form)
      window.location.assign(safeNext(next, '/account/security?welcome=1'))
    } catch (err) {
      setError(err instanceof ApiError && Array.isArray(err.data?.problems) ? (err.data.problems as string[]) : errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="stack-lg" noValidate>
      <div className="stack">
        <h1 className="h1">Create an account</h1>
        <p className="muted">Already have one? <Link href="/login">Sign in</Link></p>
      </div>
      <div>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" className="input" value={form.name} onChange={set('name')} autoComplete="name" required maxLength={80} />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" className="input" type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" className="input" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required minLength={12} maxLength={128} aria-describedby="pw-hint" />
          <span className="hint" id="pw-hint">At least 12 characters. A short sentence you will remember works well. You can add a passkey after signing up.</span>
        </div>
      </div>
      {error && (
        <div className="notice notice-bad" role="alert">
          {Array.isArray(error) ? <ul>{error.map((p) => <li key={p}>{p}</li>)}</ul> : error}
        </div>
      )}
      <button className="btn btn-dark btn-block" disabled={busy}>{busy ? 'Creating account' : 'Create account'}</button>
    </form>
  )
}
