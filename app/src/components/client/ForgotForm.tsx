'use client'
import { useState } from 'react'
import { api, errorMessage } from '@/lib/client-api'

export default function ForgotForm({ demo }: { demo: boolean }) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await api<{ message: string }>('/api/auth/forgot', 'POST', { email })
      setMessage(r.message)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  if (message) {
    return <div className="stack"><p className="notice notice-ok">{message}</p>{demo && <p className="small muted">In this demo, emails appear in the <a href="/dev/mailbox">demo mailbox</a>.</p>}</div>
  }
  return (
    <form onSubmit={submit} className="stack-lg" noValidate>
      <div className="stack">
        <h1 className="h1">Reset your password</h1>
        <p className="muted">Enter your account email and we will send a link to choose a new password.</p>
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
      </div>
      {error && <p className="notice notice-bad" role="alert">{error}</p>}
      <button className="btn btn-dark btn-block" disabled={busy || !email}>Send reset link</button>
    </form>
  )
}
