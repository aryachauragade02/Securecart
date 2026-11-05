import { audit } from '@/lib/audit'
import { requirePermission } from '@/lib/auth'
import { one } from '@/lib/db'
import { HttpError, clientIp, json, readJson, route } from '@/lib/http'
import { ProductInput } from '@/lib/product-input'

export const PATCH = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const { user } = await requirePermission('products:write', '/api/admin/products/[id]')
  const id = Number((await ctx.params).id)
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'Product not found.')
  const p = await readJson(req, ProductInput)
  const before = await one<{ price_paise: number; stock: number; active: boolean }>('SELECT price_paise, stock, active FROM products WHERE id = $1', [id])
  if (!before) throw new HttpError(404, 'Product not found.')
  try {
    await one(
      `UPDATE products SET name=$2, slug=$3, sku=$4, tagline=$5, description=$6, category=$7, art=$8, price_paise=$9, stock=$10, active=$11, updated_at=now() WHERE id=$1`,
      [id, p.name, p.slug, p.sku, p.tagline, p.description, p.category, p.art, p.pricePaise, p.stock, p.active])
  } catch (err) {
    if (String(err).includes('duplicate key')) throw new HttpError(409, 'Another product already uses that slug or SKU.')
    throw err
  }
  // Price changes are exactly what an auditor wants to see.
  await audit({ action: 'product.updated', actor: user, target: `product:${id}`, ip: clientIp(req.headers), details: {
    price_paise: before.price_paise !== p.pricePaise ? { from: before.price_paise, to: p.pricePaise } : undefined,
    stock: before.stock !== p.stock ? { from: before.stock, to: p.stock } : undefined,
    active: before.active !== p.active ? { from: before.active, to: p.active } : undefined,
  } })
  return json({ ok: true })
})
