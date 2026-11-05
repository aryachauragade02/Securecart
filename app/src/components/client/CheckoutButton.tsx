'use client'
import { useState } from 'react'
import { api, errorMessage } from '@/lib/client-api'

type CheckoutResponse =
  | { type: 'redirect'; orderId: string; url: string }
  | { type: 'razorpay'; orderId: string; keyId: string; razorpayOrderId: string; amount: number; currency: string; email: string; name: string }

declare global {
  interface Window { Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: unknown) => void) => void } }
}

function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Could not load Razorpay Checkout.'))
    document.head.appendChild(s)
  })
}

export default function CheckoutButton({ provider }: { provider: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await api<CheckoutResponse>('/api/checkout')
      if (r.type === 'redirect') {
        window.location.assign(r.url)
        return
      }
      await loadRazorpay()
      const rzp = new window.Razorpay!({
        key: r.keyId, order_id: r.razorpayOrderId, amount: r.amount, currency: r.currency,
        name: 'SecureCart', prefill: { email: r.email, name: r.name },
        handler: async (resp: Record<string, string>) => {
          await api('/api/payments/razorpay/verify', 'POST', { orderId: r.orderId, ...resp }).catch(() => {})
          window.location.assign(`/orders/${r.orderId}?from=payment`)
        },
        modal: { ondismiss: () => window.location.assign(`/orders/${r.orderId}?from=cancel`) },
      })
      rzp.open()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <button className="btn btn-primary btn-block" onClick={start} disabled={busy}>{busy ? 'Opening secure checkout' : 'Check out securely'}</button>
      {provider === 'testpay' && <p className="meta">You will be sent to the TestPay sandbox to pay.</p>}
      {error && <p className="notice notice-bad" role="alert">{error}</p>}
    </div>
  )
}
