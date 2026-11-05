/** Same-origin JSON calls from the browser. Errors carry the server's message for display. */
export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public data?: Record<string, unknown>) {
    super(message)
  }
}

export async function api<T = Record<string, unknown>>(path: string, method = 'POST', body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status}).`, res.status, data.code, data)
  return data as T
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error && err.name === 'NotAllowedError') return 'The passkey prompt was cancelled or timed out.'
  return 'Something went wrong. Check your connection and try again.'
}
