'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { api, errorMessage } from '@/lib/client-api'

export default function AddToCart({ productId, stock }: { productId: number; stock: number }) {
  const router = useRouter()
  const [qty, setQty] = useState(1)
  const [state, setState] = useState<'idle' | 'busy' | 'added'>('idle')
  const [error, setError] = useState<string | null>(null)
  const max = Math.min(10, stock)

  if (stock === 0) return <p className="notice notice-wait">Out of stock. Check back soon.</p>

  const add = async () => {
    setState('busy')
    setError(null)
    try {
      await api('/api/cart', 'PUT', { productId, quantity: qty })
      setState('added')
      router.refresh()
    } catch (err) {
      setError(errorMessage(err))
      setState('idle')
    }
  }

  return (
    <div className="stack">
      <div className="row">
        <div className="qty" role="group" aria-label="Quantity">
          <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="One fewer">−</button>
          <output aria-live="polite">{qty}</output>
          <button type="button" onClick={() => setQty((q) => Math.min(max, q + 1))} disabled={qty >= max} aria-label="One more">+</button>
        </div>
        <button className="btn btn-primary" onClick={add} disabled={state === 'busy'}>{state === 'busy' ? 'Adding' : 'Add to cart'}</button>
      </div>
      {state === 'added' && <p className="notice notice-ok">Added to your cart. <Link href="/cart">Go to cart</Link></p>}
      {error && <p className="notice notice-bad" role="alert">{error}</p>}
    </div>
  )
}
