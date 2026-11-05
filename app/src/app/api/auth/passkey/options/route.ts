import { ensureSession } from '@/lib/auth'
import { json, route } from '@/lib/http'
import { authenticationOptions } from '@/lib/passkeys'
import { setChallenge } from '@/lib/session'

export const POST = route(async () => {
  const session = await ensureSession()
  const options = await authenticationOptions()
  await setChallenge(session, options.challenge)
  return json(options)
})
