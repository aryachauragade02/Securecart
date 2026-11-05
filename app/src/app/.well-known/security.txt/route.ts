import { env } from '@/lib/env'

/** RFC 9116: tells security researchers how to report a vulnerability. */
export function GET() {
  const expires = new Date(Date.now() + 180 * 86400_000).toISOString()
  const body = [
    'Contact: mailto:security@securecart.test',
    `Expires: ${expires}`,
    'Preferred-Languages: en',
    `Canonical: ${env.appOrigin}/.well-known/security.txt`,
    `Policy: ${env.appOrigin}/security`,
    '',
  ].join('\n')
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' } })
}
