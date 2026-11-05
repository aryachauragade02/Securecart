import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { one, query } from './db'
import { env } from './env'

export type PasskeyRow = {
  id: string
  user_id: string
  public_key: Buffer
  counter: number
  transports: string[]
  device_type: string | null
  backed_up: boolean
  name: string
  created_at: Date
  last_used_at: Date | null
}

export async function listPasskeys(userId: string) {
  return query<PasskeyRow>('SELECT * FROM passkeys WHERE user_id = $1 ORDER BY created_at', [userId])
}

export async function registrationOptions(user: { id: string; email: string; name: string }) {
  const existing = await listPasskeys(user.id)
  return generateRegistrationOptions({
    rpName: 'SecureCart',
    rpID: env.rpID,
    userName: user.email,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(user.id),
    attestationType: 'none',
    // Stops the same authenticator being registered twice on this account.
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  })
}

export async function verifyRegistration(userId: string, response: RegistrationResponseJSON, expectedChallenge: string, name: string) {
  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: env.appOrigin,
    expectedRPID: env.rpID,
    requireUserVerification: true,
  })
  if (!result.verified) return null
  const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo
  return one<PasskeyRow>(
    `INSERT INTO passkeys (id, user_id, public_key, counter, transports, device_type, backed_up, name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [credential.id, userId, Buffer.from(credential.publicKey), credential.counter, credential.transports ?? [], credentialDeviceType, credentialBackedUp, name],
  )
}

/** Usernameless sign-in: the browser offers whichever passkeys it holds for this site. */
export async function authenticationOptions() {
  return generateAuthenticationOptions({ rpID: env.rpID, userVerification: 'required' })
}

export async function verifyAuthentication(response: AuthenticationResponseJSON, expectedChallenge: string) {
  const key = await one<PasskeyRow>('SELECT * FROM passkeys WHERE id = $1', [response.id])
  if (!key) return null
  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: env.appOrigin,
    expectedRPID: env.rpID,
    credential: { id: key.id, publicKey: new Uint8Array(key.public_key), counter: Number(key.counter), transports: key.transports },
    requireUserVerification: true,
  })
  if (!result.verified) return null
  // A signature counter that goes backwards can indicate a cloned authenticator.
  // Synced passkeys report 0 forever, which the library accepts.
  await query('UPDATE passkeys SET counter = $2, last_used_at = now() WHERE id = $1', [key.id, result.authenticationInfo.newCounter])
  return key
}
