import { DiagConsoleLogger, DiagLogLevel, SpanKind, diag, type Context } from '@opentelemetry/api'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { NodeSDK } from '@opentelemetry/sdk-node'
import {
  BatchSpanProcessor, type ReadableSpan, type Span, type SpanExporter, type SpanProcessor,
} from '@opentelemetry/sdk-trace'
import { rootSpans } from './lib/telemetry'

/**
 * With a custom server, Next.js opens two SERVER spans per request: one for the proxy
 * step (named just "GET", always status 200, ends before routing starts) and one for the
 * route ("GET /api/orders", real status). Tools that count SERVER spans, PulseOps
 * included, would see every request twice. At export time we drop the proxy-phase span
 * and its "middleware" child, and make the route span the root. A request the proxy
 * answers itself (e.g. a blocked cross-site POST) has no route span and is kept as is.
 */
export function isProxyPhaseSpan(s: ReadableSpan): boolean {
  const a = s.attributes
  return s.kind === SpanKind.SERVER && a['next.span_type'] === 'BaseServer.handleRequest' && !a['next.route']
    && /^[A-Z]+$/.test(s.name) && Number(a['http.status_code'] ?? 200) === 200
}

const dropped = new Set<string>()

class DedupeServerSpans implements SpanExporter {
  constructor(private inner: SpanExporter) {}
  export(spans: ReadableSpan[], done: Parameters<SpanExporter['export']>[1]) {
    for (const s of spans) if (isProxyPhaseSpan(s)) dropped.add(s.spanContext().spanId)
    const out: ReadableSpan[] = []
    for (const s of spans) {
      if (dropped.has(s.spanContext().spanId)) continue
      const parent = s.parentSpanContext?.spanId
      if (parent && dropped.has(parent)) {
        if (s.kind !== SpanKind.SERVER) continue // the proxy's own "middleware GET" span
        out.push(Object.create(s, { parentSpanContext: { value: undefined } }))
        continue
      }
      out.push(s)
    }
    if (dropped.size > 10_000) dropped.clear()
    this.inner.export(out, done)
  }
  shutdown() { return this.inner.shutdown() }
  forceFlush() { return this.inner.forceFlush?.() ?? Promise.resolve() }
}

/** Remembers each request's current SERVER span so handlers can add attributes to it (see lib/telemetry.ts). */
class RequestSpanTracker implements SpanProcessor {
  onStart(span: Span, _ctx: Context): void {
    if (span.kind === SpanKind.SERVER) rootSpans.set(span.spanContext().traceId, span)
  }
  onEnd(span: ReadableSpan): void {
    const id = span.spanContext().traceId
    if (rootSpans.get(id)?.spanContext().spanId === span.spanContext().spanId) rootSpans.delete(id)
  }
  forceFlush() { return Promise.resolve() }
  shutdown() { rootSpans.clear(); return Promise.resolve() }
}

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    'service.name': process.env.OTEL_SERVICE_NAME ?? 'securecart',
    'service.version': '1.0.0',
    'deployment.environment': process.env.NODE_ENV ?? 'development',
  }),
  spanProcessors: [
    new RequestSpanTracker(),
    new BatchSpanProcessor({ exporter: new DedupeServerSpans(new OTLPTraceExporter()), scheduledDelayMillis: 2000 }),
  ],
  logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter(), scheduledDelayMillis: 2000 })],
  instrumentations: [new PgInstrumentation({ enhancedDatabaseReporting: false })],
})

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR)
sdk.start()
console.log(`OpenTelemetry enabled: exporting to ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}`)
