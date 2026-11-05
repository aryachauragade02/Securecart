'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { api, errorMessage } from '@/lib/client-api'

export default function CartLineControls({ productId, quantity, max }: { productId: number; quantity: number; max: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = async (q: number) => {
    setBusy(true)
    setError(null)
    try {
      await api('/api/cart', 'PUT', { productId, quantity: q })
      router.refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="stack">
      <div className="row">
        <div className="qty" role="group" aria-label="Quantity">
          <button onClick={() => set(quantity - 1)} disabled={busy || quantity <= 1} aria-label="One fewer">−</button>
          <output>{quantity}</output>
          <button onClick={() => set(quantity + 1)} disabled={busy || quantity >= max} aria-label="One more">+</button>
        </div>
        <button className="linklike small" onClick={() => set(0)} disabled={busy}>Remove</button>
      </div>
      {error && <span className="small" role="alert">{error}</span>}
    </div>
  )
}
