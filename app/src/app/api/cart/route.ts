import { z } from 'zod'
import { cartOwner, ensureSession, getAuth } from '@/lib/auth'
import { MAX_QTY, getCart, setCartQuantity } from '@/lib/cart'
import { json, readJson, route } from '@/lib/http'

export const PUT = route(async (req) => {
  const { productId, quantity } = await readJson(req, z.object({ productId: z.number().int().positive(), quantity: z.number().int().min(0).max(MAX_QTY) }))
  let auth = await getAuth()
  if (!auth.session) auth = { session: await ensureSession(), user: null }
  const owner = cartOwner(auth)!
  await setCartQuantity(owner, productId, quantity)
  const cart = await getCart(owner)
  return json({ ok: true, count: cart.count, total: cart.total })
})
