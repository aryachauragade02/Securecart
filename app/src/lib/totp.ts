import crypto from 'node:crypto'
import { Secret, TOTP } from 'otpauth'
import { sha256 } from './crypto'

export const TOTP_PERIOD = 30

export function newTotpSecret(): string {
  return new Secret({ size: 20 }).base32
}

function totp(secretBase32: string, label = 'account') {
  return new TOTP({ issuer: 'SecureCart', label, algorithm: 'SHA1', digits: 6, period: TOTP_PERIOD, secret: Secret.fromBase32(secretBase32) })
}

export function totpUri(secretBase32: string, email: string): string {
  return totp(secretBase32, email).toString()
}

/**
 * Checks a 6-digit code, allowing one step of clock drift either way. Returns the time
 * step the code belongs to, or null. Callers reject steps at or below the last one used,
 * so a code seen over someone's shoulder cannot be replayed.
 */
export function verifyTotp(secretBase32: string, code: string, lastStep: number | null, nowMs = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null
  const delta = totp(secretBase32).validate({ token: code, window: 1, timestamp: nowMs })
  if (delta === null) return null
  const step = Math.floor(nowMs / 1000 / TOTP_PERIOD) + delta
  if (lastStep !== null && step <= lastStep) return null
  return step
}

export function generateTotp(secretBase32: string, nowMs = Date.now()): string {
  return totp(secretBase32).generate({ timestamp: nowMs })
}

/** Ten single-use recovery codes like "k3fq-82ma-xz7p". Stored only as SHA-256 hashes. */
export function newRecoveryCodes(): { codes: string[]; hashes: string[] } {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  const codes = Array.from({ length: 10 }, () => {
    const bytes = crypto.randomBytes(12)
    const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
    return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`
  })
  return { codes, hashes: codes.map((c) => sha256(normalizeRecoveryCode(c))) }
}

export function normalizeRecoveryCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, '')
}
