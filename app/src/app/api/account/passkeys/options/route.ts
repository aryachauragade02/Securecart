import { requireUser } from '@/lib/auth'
import { json, route } from '@/lib/http'
import { registrationOptions } from '@/lib/passkeys'
import { setChallenge } from '@/lib/session'

export const POST = route(async () => {
  const { user, session } = await requireUser()
  const options = await registrationOptions(user)
  await setChallenge(session, options.challenge)
  return json(options)
})
