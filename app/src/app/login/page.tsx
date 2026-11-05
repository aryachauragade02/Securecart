import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import LoginForm from '@/components/client/LoginForm'
import { getCurrentUser } from '@/lib/auth'
import { safeNext } from '@/lib/safe-next'

export const metadata: Metadata = { title: 'Sign in' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  if (await getCurrentUser()) redirect(safeNext(next))
  return <div className="auth"><div className="panel"><LoginForm next={next ?? null} /></div></div>
}
