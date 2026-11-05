import crypto from 'node:crypto'
import { env, requireSecret } from './env'

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url')
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export function hmacSha256Hex(secret: string, message: string): string {
  return crypto.createHmac('sha256', secret).update(message).digest('hex')
}

/** Constant-time comparison, so response timing does not reveal how many characters matched. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}

function key(): Buffer {
  const raw = Buffer.from(requireSecret(env.dataKey, 'DATA_ENCRYPTION_KEY'), 'base64')
  if (raw.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes, base64-encoded')
  return raw
}

/** AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext>, all base64url. */
export function encrypt(plaintext: string, k: Buffer = key()): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', k, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.')
}

export function decrypt(payload: string, k: Buffer = key()): string {
  const [v, iv, tag, ct] = payload.split('.')
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('unrecognised ciphertext')
  const decipher = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8')
}
