'use client'
import { useState } from 'react'
import { ApiError, api, errorMessage } from '@/lib/client-api'

export default function ChangePassword() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      await api('/api/account/password', 'POST', { current, next })
      setMsg({ ok: true, text: 'Password changed. Other devices were signed out.' })
      setCurrent('')
      setNext('')
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError && Array.isArray(err.data?.problems) ? (err.data.problems as string[]).join(' ') : errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="stack measure" noValidate>
      <div className="field"><label htmlFor="cur">Current password</label><input id="cur" className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></div>
      <div className="field"><label htmlFor="new">New password</label><input id="new" className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={12} /><span className="hint">At least 12 characters. Changing it signs out your other devices.</span></div>
      {msg && <p className={`notice ${msg.ok ? 'notice-ok' : 'notice-bad'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      <div><button className="btn" disabled={busy || !current || next.length < 12}>Change password</button></div>
    </form>
  )
}
