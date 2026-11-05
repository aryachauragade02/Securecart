/**
 * Next.js calls register() once per server start. Telemetry is only enabled when an OTLP
 * endpoint is configured (e.g. PulseOps at http://localhost:8000).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    await import('./instrumentation.node')
  }
}
