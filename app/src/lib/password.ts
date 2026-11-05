import { hash, verify } from '@node-rs/argon2'

// argon2id with the OWASP Password Storage Cheat Sheet minimum (19 MiB, 2 passes).
const PARAMS = { memoryCost: 19456, timeCost: 2, parallelism: 1 }

export const PASSWORD_MIN = 12
export const PASSWORD_MAX = 128 // also caps hashing work per request

// A short list of common long passwords; the length rule already rules out most short ones.
const COMMON = new Set([
  'password1234', 'password12345', 'password123!', 'passw0rd1234', 'qwertyuiop12', 'qwerty123456', '123456789012',
  '1234567890ab', 'iloveyou1234', 'administrator', 'welcome12345', 'letmein12345', 'changeme1234',
  'monkey123456', 'football1234', 'baseball1234', 'superman1234', 'trustno1trustno1', 'abcdefghijkl',
  'aaaaaaaaaaaa', '111111111111', '000000000000', 'securecart123', 'securecart2026',
])

export function passwordProblems(password: string, email = ''): string[] {
  const problems: string[] = []
  if (password.length < PASSWORD_MIN) problems.push(`Use at least ${PASSWORD_MIN} characters.`)
  if (password.length > PASSWORD_MAX) problems.push(`Use at most ${PASSWORD_MAX} characters.`)
  const lower = password.toLowerCase()
  if (COMMON.has(lower)) problems.push('This password is too common.')
  if (/^(.)\1+$/.test(password)) problems.push('Avoid repeating a single character.')
  const local = email.split('@')[0]?.toLowerCase()
  if (local && local.length >= 4 && lower.includes(local)) problems.push('Do not include your email name in the password.')
  return problems
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, PARAMS)
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password)
  } catch {
    return false
  }
}

let dummy: Promise<string> | null = null
/**
 * Run a full verification against a throwaway hash. Used when the email does not exist,
 * so "unknown email" and "wrong password" take the same time (no user enumeration by timing).
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummy ??= hashPassword('dummy-password-for-timing')
  await verifyPassword(await dummy, password)
}
