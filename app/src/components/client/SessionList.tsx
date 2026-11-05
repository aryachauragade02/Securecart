'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { api, errorMessage } from '@/lib/client-api'

type S = { id: string; current: boolean; device: string; ip: string; method: string; since: string; seen: string }

export default function SessionList({ sessions }: { sessions: S[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const revoke = async (target: string) => {
    setError(null)
    try {
      await api('/api/account/sessions/revoke', 'POST', { target })
      router.refresh()
    } catch (err) {
      setError(errorMessage(err))
    }
  }
  return (
    <div className="stack">
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Device</th><th>Address</th><th>Signed in with</th><th>Last active</th><th></th></tr></thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td>{s.device}{s.current && <> <span className="pill pill-ink">This device</span></>}<div className="meta">since {s.since}</div></td>
                <td>{s.ip}</td>
                <td>{s.method}</td>
                <td>{s.seen}</td>
                <td className="num">{!s.current && <button className="btn btn-sm btn-quiet" onClick={() => revoke(s.id)}>Sign out</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sessions.length > 1 && <div><button className="btn btn-quiet" onClick={() => revoke('others')}>Sign out all other devices</button></div>}
      {error && <p className="notice notice-bad" role="alert">{error}</p>}
    </div>
  )
}
