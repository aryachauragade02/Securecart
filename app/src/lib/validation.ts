import { z } from 'zod'
import { PASSWORD_MAX } from './password'

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email({ message: 'Enter a valid email address.' }))
export const passwordInput = z.string().min(1, 'Enter your password.').max(PASSWORD_MAX)
export const nameSchema = z.string().trim().min(1, 'Enter your name.').max(80)
export const codeSchema = z.string().trim().min(6).max(20)
export const uuidSchema = z.uuid()
