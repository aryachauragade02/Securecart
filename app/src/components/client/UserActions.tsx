'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { api, errorMessage } from '@/lib/client-api'

export default function UserActions({ id, role, disabled, locked }: { id: string; role: string; disabled: boolean; locked: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const change = async (body: Record<string, unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await api(`/api/admin/users/${id}`, 'PATCH', body)
      router.refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="row">
      <label className="sr-only" htmlFor={`role-${id}`}>Role</label>
      <select id={`role-${id}`} className="input btn-sm" value={role} disabled={busy} onChange={(e) => change({ role: e.target.value })}>
        <option value="customer">customer</option><option value="support">support</option><option value="admin">admin</option>
      </select>
      {locked && <button className="btn btn-sm btn-quiet" disabled={busy} onClick={() => change({ unlock: true })}>Unpause</button>}
      <button className="btn btn-sm btn-quiet" disabled={busy} onClick={() => change({ disabled: !disabled })}>{disabled ? 'Enable' : 'Disable'}</button>
      {error && <span className="small" role="alert">{error}</span>}
    </span>
  )
}
