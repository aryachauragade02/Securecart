import Link from 'next/link'

export default function Denied({ reason }: { reason: 'permission' | 'mfa' }) {
  if (reason === 'mfa') {
    return (
      <div className="stack-lg measure">
        <h1 className="h1">Use a second factor to continue</h1>
        <p className="lede">Staff tools are only available when you signed in with a passkey or two-step verification.</p>
        <p><Link className="btn btn-dark" href="/account/security">Set up a passkey or two-step verification</Link></p>
        <p className="small muted">Already set up? Sign out and sign in again using it.</p>
      </div>
    )
  }
  return (
    <div className="stack-lg measure">
      <h1 className="h1">You do not have access to this page</h1>
      <p className="lede">Your role does not include this permission. The attempt has been logged.</p>
      <p><Link href="/">Back to the shop</Link></p>
    </div>
  )
}
