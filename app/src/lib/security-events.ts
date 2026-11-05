import { logs, SeverityNumber } from '@opentelemetry/api'

/**
 * Security events are structured log records with an `event.name` attribute. They go to
 * OpenTelemetry (and so to PulseOps, whose detections count them) and to stdout as JSON
 * lines. They never contain passwords, tokens, codes or card data.
 */
export type SecurityEventName =
  | 'auth.login_succeeded'
  | 'auth.login_failed'
  | 'auth.account_locked'
  | 'auth.mfa_failed'
  | 'auth.mfa_enabled'
  | 'auth.mfa_disabled'
  | 'auth.passkey_added'
  | 'auth.passkey_removed'
  | 'auth.password_changed'
  | 'auth.password_reset_requested'
  | 'auth.password_reset_completed'
  | 'auth.session_revoked'
  | 'auth.registered'
  | 'authz.denied'
  | 'payment.succeeded'
  | 'payment.declined'
  | 'fraud.checkout_blocked'
  | 'webhook.signature_invalid'
  | 'admin.action'

type Level = 'INFO' | 'WARN' | 'ERROR'
const SEVERITY: Record<Level, SeverityNumber> = { INFO: SeverityNumber.INFO, WARN: SeverityNumber.WARN, ERROR: SeverityNumber.ERROR }

const logger = () => logs.getLogger('securecart.security')

export function securityEvent(
  name: SecurityEventName,
  message: string,
  attributes: Record<string, string | number | boolean | null | undefined> = {},
  level: Level = 'INFO',
): void {
  const attrs: Record<string, string | number | boolean> = { 'event.name': name }
  for (const [k, v] of Object.entries(attributes)) if (v !== undefined && v !== null) attrs[k] = v
  logger().emit({ severityNumber: SEVERITY[level], severityText: level, body: message, attributes: attrs })
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, message, ...attrs }))
}
