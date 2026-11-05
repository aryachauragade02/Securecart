import { audit } from '@/lib/audit'
import { requirePermission } from '@/lib/auth'
import { one } from '@/lib/db'
import { HttpError, clientIp, json, readJson, route } from '@/lib/http'
import { ProductInput } from '@/lib/product-input'

export const POST = route(async (req) => {
  const { user } = await requirePermission('products:write', '/api/admin/products')
  const p = await readJson(req, ProductInput)
  const row = await one<{ id: number }>(
    `INSERT INTO products (name, slug, sku, tagline, description, category, art, price_paise, stock, active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING RETURNING id`,
    [p.name, p.slug, p.sku, p.tagline, p.description, p.category, p.art, p.pricePaise, p.stock, p.active])
  if (!row) throw new HttpError(409, 'A product with that slug or SKU already exists.')
  await audit({ action: 'product.created', actor: user, target: `product:${row.id}`, ip: clientIp(req.headers), details: { sku: p.sku, price_paise: p.pricePaise } })
  return json({ ok: true, id: row.id }, 201)
})
