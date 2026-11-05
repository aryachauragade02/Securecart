'use client'
import { api } from '@/lib/client-api'

export default function LogoutButton() {
  return (
    <button className="linklike" onClick={async () => { await api('/api/auth/logout').catch(() => {}); window.location.href = '/' }}>
      Sign out
    </button>
  )
}
