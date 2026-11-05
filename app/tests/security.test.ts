import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { GENESIS_HASH, canonicalJson, entryHash, verifyRows, type AuditFields } from '@/lib/audit'
import { decrypt, encrypt, safeEqual } from '@/lib/crypto'
import { resolveClientIp } from '@/lib/http'
import { totalPaise } from '@/lib/money'
import { passwordProblems } from '@/lib/password'
import {
  signTimestamped, verifyRazorpayPayment, verifyRazorpayWebhook, verifyTimestampedSignature,
} from '@/lib/payments/signature'
import { slidingEstimate } from '@/lib/rate-limit'
import { can, isStaff } from '@/lib/rbac'
import { safeNext } from '@/lib/safe-next'
import { generateTotp, newRecoveryCodes, normalizeRecoveryCode, verifyTotp } from '@/lib/totp'

describe('password policy', () => {
  it('rejects short, common and email-based passwords', () => {
    expect(passwordProblems('short')).toContain('Use at least 12 characters.')
    expect(passwordProblems('password1234')).toContain('This password is too common.')
    expect(passwordProblems('aaaaaaaaaaaaaa')).toContain('Avoid repeating a single character.')
    expect(passwordProblems('arya.sharma-secret', 'arya.sharma@example.com')[0]).toMatch(/email name/)
  })
  it('accepts a long passphrase', () => {
    expect(passwordProblems('correct horse battery staple', 'me@example.com')).toEqual([])
  })
  it('caps length to bound hashing cost', () => {
    expect(passwordProblems('x'.repeat(200))).toContain('Use at most 128 characters.')
  })
})

describe('webhook signatures', () => {
  const secret = 'whsec_test'
  const body = '{"id":"evt_1"}'
  const now = 1_800_000_000
  it('accepts a fresh, correct signature', () => {
    expect(verifyTimestampedSignature(body, signTimestamped(body, secret, now), secret, now)).toEqual({ ok: true })
  })
  it('rejects a modified body', () => {
    const r = verifyTimestampedSignature(body.replace('1', '2'), signTimestamped(body, secret, now), secret, now)
    expect(r.ok).toBe(false)
  })
  it('rejects a replay outside the 5-minute window', () => {
    const r = verifyTimestampedSignature(body, signTimestamped(body, secret, now), secret, now + 301)
    expect(r).toEqual({ ok: false, reason: 'timestamp outside tolerance (possible replay)' })
  })
  it('rejects a wrong secret and a missing header', () => {
    expect(verifyTimestampedSignature(body, signTimestamped(body, 'other', now), secret, now).ok).toBe(false)
    expect(verifyTimestampedSignature(body, null, secret, now).ok).toBe(false)
  })
  it('verifies Razorpay checkout and webhook signatures', () => {
    const sig = crypto.createHmac('sha256', 'key_secret').update('order_1|pay_1').digest('hex')
    expect(verifyRazorpayPayment('order_1', 'pay_1', sig, 'key_secret')).toBe(true)
    expect(verifyRazorpayPayment('order_1', 'pay_2', sig, 'key_secret')).toBe(false)
    const wh = crypto.createHmac('sha256', 'wh_secret').update(body).digest('hex')
    expect(verifyRazorpayWebhook(body, wh, 'wh_secret')).toBe(true)
    expect(verifyRazorpayWebhook(body, null, 'wh_secret')).toBe(false)
  })
})

describe('tamper-evident audit chain', () => {
  const entry = (i: number): AuditFields => ({
    ts: new Date(1_800_000_000_000 + i * 1000).toISOString(), actor_id: null, actor_email: 'a@b.c',
    action: `test.${i}`, target: null, ip: '127.0.0.1', details: { n: i, nested: { b: 2, a: 1 } },
  })
  const chain = () => {
    let prev = GENESIS_HASH
    return [1, 2, 3, 4].map((i) => {
      const f = entry(i)
      const hash = entryHash(prev, f)
      const row = { id: i, ...f, prev_hash: prev, hash }
      prev = hash
      return row
    })
  }
  it('canonical JSON ignores key order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }))
  })
  it('an untouched chain verifies', () => {
    expect(verifyRows(chain())).toMatchObject({ ok: true, checked: 4 })
  })
  it('detects an edited entry', () => {
    const rows = chain()
    rows[2].details = { n: 999 }
    expect(verifyRows(rows)).toMatchObject({ ok: false, firstBadId: 3 })
  })
  it('detects a deleted entry', () => {
    const rows = chain()
    rows.splice(1, 1)
    expect(verifyRows(rows)).toMatchObject({ ok: false, firstBadId: 3 })
  })
})

describe('TOTP', () => {
  const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
  const t = 1_800_000_000_000
  it('accepts the current code and one step of drift', () => {
    expect(verifyTotp(secret, generateTotp(secret, t), null, t)).not.toBeNull()
    expect(verifyTotp(secret, generateTotp(secret, t - 30_000), null, t)).not.toBeNull()
  })
  it('rejects a reused code (replay)', () => {
    const step = verifyTotp(secret, generateTotp(secret, t), null, t)!
    expect(verifyTotp(secret, generateTotp(secret, t), step, t)).toBeNull()
  })
  it('rejects codes far in the past and malformed input', () => {
    expect(verifyTotp(secret, generateTotp(secret, t - 120_000), null, t)).toBeNull()
    expect(verifyTotp(secret, 'abcdef', null, t)).toBeNull()
  })
  it('makes 10 distinct recovery codes, hashed', () => {
    const { codes, hashes } = newRecoveryCodes()
    expect(new Set(codes).size).toBe(10)
    expect(hashes.every((h) => /^[0-9a-f]{64}$/.test(h))).toBe(true)
    expect(normalizeRecoveryCode('AB12-cd34')).toBe('ab12cd34')
  })
})

describe('encryption at rest', () => {
  const key = crypto.randomBytes(32)
  it('round-trips and uses a fresh IV every time', () => {
    const a = encrypt('totp-secret', key)
    expect(decrypt(a, key)).toBe('totp-secret')
    expect(encrypt('totp-secret', key)).not.toBe(a)
  })
  it('fails on tampered ciphertext (GCM authentication)', () => {
    const [v, iv, tag, ct] = encrypt('totp-secret', key).split('.')
    const flipped = Buffer.from(ct, 'base64url')
    flipped[0] ^= 1
    expect(() => decrypt([v, iv, tag, flipped.toString('base64url')].join('.'), key)).toThrow()
  })
})

describe('client IP and redirects', () => {
  it('ignores X-Forwarded-For unless proxies are trusted', () => {
    expect(resolveClientIp('10.0.0.5', '6.6.6.6', 0)).toBe('10.0.0.5')
    expect(resolveClientIp('::ffff:10.0.0.5', null, 0)).toBe('10.0.0.5')
  })
  it('takes the right entry when one proxy is trusted', () => {
    expect(resolveClientIp('10.0.0.2', '6.6.6.6, 203.0.113.9', 1)).toBe('203.0.113.9')
  })
  it('only allows same-site relative redirects', () => {
    expect(safeNext('/cart')).toBe('/cart')
    expect(safeNext('https://evil.example')).toBe('/')
    expect(safeNext('//evil.example')).toBe('/')
    expect(safeNext('/\\evil.example')).toBe('/')
  })
})

describe('authorization and money', () => {
  it('gives each role only its permissions', () => {
    expect(can('customer', 'admin:access')).toBe(false)
    expect(can('support', 'orders:update')).toBe(true)
    expect(can('support', 'products:write')).toBe(false)
    expect(can('support', 'audit:read')).toBe(false)
    expect(can('admin', 'audit:read')).toBe(true)
    expect(isStaff('customer')).toBe(false)
  })
  it('sums in integer paise', () => {
    expect(totalPaise([{ unit_price_paise: 249900, quantity: 1 }, { unit_price_paise: 500, quantity: 3 }])).toBe(251400)
  })
  it('sliding window weights the previous window', () => {
    expect(slidingEstimate(10, 5, 0.5)).toBe(10)
    expect(slidingEstimate(10, 5, 1)).toBe(5)
  })
  it('compares secrets in constant time and by length', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
  })
})
