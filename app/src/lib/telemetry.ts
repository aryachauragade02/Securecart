import { trace, type Span } from '@opentelemetry/api'

/**
 * The OpenTelemetry SDK (src/instrumentation.node.ts) records every request's root
 * SERVER span here, keyed by trace ID. Route handlers run inside child spans, so this
 * is how they attach request-level facts (client IP, user) to the span that PulseOps
 * and other tools treat as "the request".
 */
const g = globalThis as unknown as { __securecartRootSpans?: Map<string, Span> }
export const rootSpans: Map<string, Span> = (g.__securecartRootSpans ??= new Map())

export function setRequestAttributes(attrs: Record<string, string | number | boolean | undefined | null>): void {
  const active = trace.getActiveSpan()
  if (!active) return
  const root = rootSpans.get(active.spanContext().traceId)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue
    root?.setAttribute(k, v)
    active.setAttribute(k, v)
  }
}

export function currentTraceId(): string | undefined {
  return trace.getActiveSpan()?.spanContext().traceId
}
