'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { api } from '@/lib/client-api'

/** Polls the server for the payment result. The browser redirect alone never marks an order paid. */
export default function OrderStatusWatcher({ orderId, from }: { orderId: string; from: string | null }) {
  const router = useRouter()
  const [tries, setTries] = useState(0)
  useEffect(() => {
    if (from !== 'payment' || tries > 20) return
    const t = setTimeout(async () => {
      const r = await api<{ status: string }>(`/api/orders/${orderId}`, 'GET').catch(() => null)
      if (r && r.status !== 'pending_payment') router.refresh()
      else setTries((n) => n + 1)
    }, 1500)
    return () => clearTimeout(t)
  }, [tries, from, orderId, router])

  if (from === 'payment') {
    return <p className="notice notice-wait" role="status">{tries > 20 ? 'We have not received confirmation from the payment provider yet. This page will show the result once it arrives; you will not be charged twice.' : 'Confirming your payment with the provider…'}</p>
  }
  return <p className="notice notice-wait">This order is waiting for payment. {from === 'cancel' ? 'You left the payment page.' : ''} Unpaid orders are cancelled after 30 minutes and the items go back on sale.</p>
}
