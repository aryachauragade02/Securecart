import { audit } from './audit'
import { query } from './db'
import { sendMail } from './mail'
import { securityEvent } from './security-events'
import { rotateSession, type SessionRow } from './session'

export type LoginUser = { id: string; email: string; role: string }

/** The last step of every successful sign-in: new session ID, event, audit entry. */
export async function completeLogin(previous: SessionRow | null, user: LoginUser, method: string, mfa: boolean, ip: string, ua: string) {
  await query('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [user.id])
  await rotateSession(previous, { userId: user.id, stage: 'full', authMethod: method, mfa, ip, userAgent: ua })
  securityEvent('auth.login_succeeded', `sign-in succeeded for ${user.email} (${method})`, {
    'user.name': user.email, 'client.address': ip, 'auth.method': method, 'user.role': user.role,
  })
  await audit({ action: 'auth.login', actor: user, target: `user:${user.id}`, ip, details: { method, mfa } })
}

export async function notifyUser(email: string, subject: string, lines: string[]) {
  await sendMail(email, subject, [...lines, '', 'If this was not you, reset your password and review the devices signed in to your account.', '', 'SecureCart'].join('\n'))
}
