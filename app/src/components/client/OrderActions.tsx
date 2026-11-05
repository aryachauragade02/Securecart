'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { api, errorMessage } from '@/lib/client-api'

export default function OrderActions({ id, status }: { id: string; status: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const act = async (action: 'ship' | 'cancel') => {
    setBusy(true)
    setError(null)
    try {
      await api(`/api/admin/orders/${id}`, 'PATCH', { action })
      router.refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="row">
      {status === 'paid' && <button className="btn btn-sm" disabled={busy} onClick={() => act('ship')}>Mark shipped</button>}
      {status === 'pending_payment' && <button className="btn btn-sm btn-quiet" disabled={busy} onClick={() => act('cancel')}>Cancel</button>}
      {error && <span className="small" role="alert">{error}</span>}
    </span>
  )
}
