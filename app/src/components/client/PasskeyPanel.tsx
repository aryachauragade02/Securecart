'use client'
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { api, errorMessage } from '@/lib/client-api'

type Key = { id: string; name: string; created: string; lastUsed: string; synced: boolean }

export default function PasskeyPanel({ passkeys }: { passkeys: Key[] }) {
  const router = useRouter()
  const [supported, setSupported] = useState(true)
  const [name, setName] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  useEffect(() => setSupported(browserSupportsWebAuthn()), [])

  const add = async () => {
    setBusy(true)
    setError(null)
    setOk(null)
    try {
      const options = await api<Parameters<typeof startRegistration>[0]['optionsJSON']>('/api/account/passkeys/options')
      const response = await startRegistration({ optionsJSON: options })
      await api('/api/account/passkeys/register', 'POST', { response, name: name.trim() || 'Passkey' })
      setName('')
      setOk('Passkey added. You can now use it to sign in.')
      router.refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/api/account/passkeys/remove', 'POST', { id: removing, password })
      setRemoving(null)
      setPassword('')
      router.refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      {passkeys.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Added</th><th>Last used</th><th></th></tr></thead>
            <tbody>
              {passkeys.map((k) => (
                <tr key={k.id}>
                  <td>{k.name} {k.synced && <span className="pill">synced</span>}</td>
                  <td>{k.created}</td>
                  <td>{k.lastUsed}</td>
                  <td className="num"><button className="btn btn-sm btn-quiet" onClick={() => { setRemoving(k.id); setError(null) }}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {removing && (
        <form onSubmit={remove} className="panel stack">
          <p>Confirm with your password to remove “{passkeys.find((k) => k.id === removing)?.name}”.</p>
          <div className="field"><label htmlFor="pk-pw">Password</label><input id="pk-pw" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></div>
          <div className="row"><button className="btn btn-danger" disabled={busy || !password}>Remove passkey</button><button type="button" className="linklike" onClick={() => setRemoving(null)}>Keep it</button></div>
        </form>
      )}
      {!supported ? (
        <p className="notice notice-wait">This browser does not support passkeys.</p>
      ) : (
        <div className="row">
          <label className="sr-only" htmlFor="pk-name">Passkey name</label>
          <input id="pk-name" className="input" placeholder={passkeys.length ? 'Name, e.g. Backup security key' : 'Name, e.g. MacBook Touch ID'} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          <button className="btn btn-primary" onClick={add} disabled={busy}>Add a passkey</button>
        </div>
      )}
      {passkeys.length === 1 && <p className="small muted">Tip: add a second passkey, such as a hardware key, so losing one device never locks you out.</p>}
      {ok && <p className="notice notice-ok">{ok}</p>}
      {error && <p className="notice notice-bad" role="alert">{error}</p>}
    </div>
  )
}
