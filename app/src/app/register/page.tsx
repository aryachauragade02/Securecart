import type { Metadata } from 'next'
import RegisterForm from '@/components/client/RegisterForm'

export const metadata: Metadata = { title: 'Create an account' }

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  return <div className="auth"><div className="panel"><RegisterForm next={next ?? null} /></div></div>
}
