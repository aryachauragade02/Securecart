import type { NextConfig } from 'next'

// Headers that are the same on every response. The Content-Security-Policy is added
// per request in src/proxy.ts because it carries a fresh nonce.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self), usb=(), publickey-credentials-get=(self), publickey-credentials-create=(self)' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
]

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: [
    '@node-rs/argon2', 'pg', 'qrcode',
    '@opentelemetry/sdk-node', '@opentelemetry/sdk-trace', '@opentelemetry/sdk-logs', '@opentelemetry/resources',
    '@opentelemetry/exporter-trace-otlp-proto', '@opentelemetry/exporter-logs-otlp-proto', '@opentelemetry/instrumentation-pg',
  ],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default config
