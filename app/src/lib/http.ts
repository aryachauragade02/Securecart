import { NextResponse } from 'next/server'
import { z } from 'zod'
import { env } from './env'
import { setRequestAttributes } from './telemetry'

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string, public extra?: Record<string, unknown>) {
    super(message)
  }
}

export function normalizeIp(ip: string): string {
  const v = ip.trim()
  return v.startsWith('::ffff:') ? v.slice(7) : v
}

/**
 * The client's IP. server.mjs writes the TCP peer address into x-securecart-peer on every
 * request (overwriting anything the client sent). X-Forwarded-For is only consulted when
 * TRUSTED_PROXY_HOPS says how many proxies in front of us append to it; otherwise a client
 * could put any address there and dodge per-IP rate limits.
 */
export function resolveClientIp(peer: string | null, xff: string | null, trustedHops: number): string {
  if (trustedHops > 0 && xff) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean)
    const idx = parts.length - trustedHops
    if (idx >= 0 && parts[idx]) return normalizeIp(parts[idx])
  }
  return peer ? normalizeIp(peer) : 'unknown'
}

export function clientIp(h: Headers): string {
  return resolveClientIp(h.get('x-securecart-peer'), h.get('x-forwarded-for'), env.trustedProxyHops)
}

export function userAgent(h: Headers): string {
  return (h.get('user-agent') ?? '').slice(0, 300)
}

export function json(data: unknown, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } })
}

const MAX_BODY = 64 * 1024

export async function readJson<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  const text = await req.text()
  if (text.length > MAX_BODY) throw new HttpError(413, 'Request body is too large.')
  let data: unknown
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new HttpError(400, 'Request body must be JSON.')
  }
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new HttpError(400, issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'Invalid request.', 'invalid_input')
  }
  return parsed.data
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>

/** Wraps a route handler: tags the request span with the client IP and turns errors into safe JSON responses. */
export function route<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    setRequestAttributes({ 'client.address': clientIp(req.headers) })
    try {
      return await fn(req, ctx)
    } catch (err) {
      if (err instanceof HttpError) {
        return json({ error: err.message, code: err.code, ...err.extra }, err.status,
          err.status === 429 && err.extra?.retryAfter ? { 'Retry-After': String(err.extra.retryAfter) } : undefined)
      }
      console.error(err)
      // Never leak stack traces or SQL errors to the client.
      return json({ error: 'Something went wrong on our side. Please try again.' }, 500)
    }
  }
}
