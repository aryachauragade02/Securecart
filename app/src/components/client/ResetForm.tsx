'use client'
import Link from 'next/link'
import { useState } from 'react'
import { ApiError, api, errorMessage } from '@/lib/client-api'

export default function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/api/auth/reset', 'POST', { token, password })
      setDone(true)
    } catch (err) {
      setError(err instanceof ApiError && Array.isArray(err.data?.problems) ? (err.data.problems as string[]).join(' ') : errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  if (done) return <div className="stack"><p className="notice notice-ok">Your password was changed and every device was signed out.</p><Link className="btn btn-dark" href="/login">Sign in</Link></div>
  return (
    <form onSubmit={submit} className="stack-lg" noValidate>
      <h1 className="h1">Choose a new password</h1>
      <div className="field">
        <label htmlFor="password">New password</label>
        <input id="password" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={12} maxLength={128} required />
        <span className="hint">At least 12 characters.</span>
      </div>
      {error && <p className="notice notice-bad" role="alert">{error}</p>}
      <button className="btn btn-dark btn-block" disabled={busy || password.length < 12}>Save new password</button>
    </form>
  )
}
