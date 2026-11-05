import { clientIp, json, route } from '@/lib/http'
import { query } from '@/lib/db'

export const GET = route(async (req) => {
  await query('SELECT 1')
  return json({ status: 'ok', ip: clientIp(req.headers) })
})
