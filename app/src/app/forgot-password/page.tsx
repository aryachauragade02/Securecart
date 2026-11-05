import type { Metadata } from 'next'
import ForgotForm from '@/components/client/ForgotForm'
import { env } from '@/lib/env'

export const metadata: Metadata = { title: 'Reset your password' }

export default function ForgotPage() {
  return <div className="auth"><div className="panel"><ForgotForm demo={env.demoMode} /></div></div>
}
