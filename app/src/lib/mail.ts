import { query } from './db'

/**
 * There is no SMTP server in this project: outgoing mail is written to mail_outbox and,
 * in demo mode, shown at /dev/mailbox. Swap this function for a real provider in production.
 */
export async function sendMail(to: string, subject: string, body: string): Promise<void> {
  await query('INSERT INTO mail_outbox (to_email, subject, body) VALUES ($1,$2,$3)', [to, subject, body])
}
