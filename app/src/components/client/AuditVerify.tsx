'use client'
import { useState } from 'react'
import { api, errorMessage } from '@/lib/client-api'

type Result = { ok: boolean; checked: number; firstBadId: number | null; reason: string | null }

export default function AuditVerify() {
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      setResult(await api<Result>('/api/admin/audit/verify'))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="stack">
      <div><button className="btn btn-dark" onClick={run} disabled={busy}>{busy ? 'Checking every entry' : 'Verify the hash chain'}</button></div>
      {result && (result.ok
        ? <p className="notice notice-ok">Chain intact: all {result.checked} entries match their hashes and link correctly.</p>
        : <p className="notice notice-bad">Tampering detected at entry #{result.firstBadId}: {result.reason}. {result.checked} entries before it are intact.</p>)}
      {error && <p className="notice notice-bad" role="alert">{error}</p>}
    </div>
  )
}
