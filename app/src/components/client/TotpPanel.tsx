'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { api, errorMessage } from '@/lib/client-api'

export default function TotpPanel({ enabled, recoveryLeft }: { enabled: boolean; recoveryLeft: number }) {
  const router = useRouter()
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [disabling, setDisabling] = useState(false)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try { await fn() } catch (err) { setError(errorMessage(err)) } finally { setBusy(false) }
  }

  if (codes) {
    return (
      <div className="stack">
        <p className="notice notice-ok">Two-step verification is on.</p>
        <p><strong>Save these recovery codes now.</strong> Each one works once if you lose your phone. They will not be shown again.</p>
        <div className="recovery" aria-label="Recovery codes">{codes.map((c) => <span key={c}>{c}</span>)}</div>
        <button className="btn" onClick={() => { setCodes(null); router.refresh() }}>I have saved them</button>
      </div>
    )
  }

  if (enabled && !disabling) {
    return (
      <div className="stack">
        <p><span className="status status-on">On</span> <span className="muted small">{recoveryLeft} recovery codes left</span></p>
        {recoveryLeft < 3 && <p className="notice notice-wait">You are running low on recovery codes. Turn two-step verification off and on again to get a new set.</p>}
        <button className="btn btn-quiet" onClick={() => setDisabling(true)}>Turn off</button>
      </div>
    )
  }

  if (disabling) {
    return (
      <form className="stack" onSubmit={(e) => { e.preventDefault(); run(async () => { await api('/api/account/totp/disable', 'POST', { password, code }); setDisabling(false); router.refresh() }) }}>
        <p>Confirm with your password and a current code.</p>
        <div className="field"><label htmlFor="d-pw">Password</label><input id="d-pw" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></div>
        <div className="field"><label htmlFor="d-code">6-digit code</label><input id="d-code" className="input code-input" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} autoComplete="one-time-code" /></div>
        {error && <p className="notice notice-bad" role="alert">{error}</p>}
        <div className="row"><button className="btn btn-danger" disabled={busy}>Turn off two-step verification</button><button type="button" className="linklike" onClick={() => setDisabling(false)}>Keep it on</button></div>
      </form>
    )
  }

  if (setup) {
    return (
      <form className="stack" onSubmit={(e) => { e.preventDefault(); run(async () => { const r = await api<{ recoveryCodes: string[] }>('/api/account/totp/enable', 'POST', { code }); setCodes(r.recoveryCodes); setSetup(null) }) }}>
        <p>Scan this code with an authenticator app (for example Google Authenticator, Microsoft Authenticator, 1Password or Aegis), then enter the 6-digit code it shows.</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="qr" src={setup.qr} alt="QR code for your authenticator app" width={200} height={200} />
        <p className="small muted">Can not scan? Enter this key manually: <span className="code">{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</span></p>
        <div className="field"><label htmlFor="t-code">6-digit code</label><input id="t-code" className="input code-input" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} autoComplete="one-time-code" autoFocus /></div>
        {error && <p className="notice notice-bad" role="alert">{error}</p>}
        <button className="btn btn-dark" disabled={busy || code.length !== 6}>Turn on</button>
      </form>
    )
  }

  return (
    <div className="stack">
      <p><span className="status status-off">Off</span></p>
      {error && <p className="notice notice-bad" role="alert">{error}</p>}
      <button className="btn" disabled={busy} onClick={() => run(async () => setSetup(await api('/api/account/totp/setup')))}>Set up two-step verification</button>
    </div>
  )
}
