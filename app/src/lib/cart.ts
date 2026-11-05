import { query } from './db'
import { HttpError } from './http'
import { totalPaise } from './money'

export const MAX_QTY = 10

export type CartLine = {
  product_id: number
  slug: string
  name: string
  art: string
  sku: string
  unit_price_paise: number
  quantity: number
  stock: number
}

export async function getCart(owner: string | null): Promise<{ lines: CartLine[]; total: number; count: number }> {
  if (!owner) return { lines: [], total: 0, count: 0 }
  const lines = await query<CartLine>(
    `SELECT c.product_id, p.slug, p.name, p.art, p.sku, p.price_paise AS unit_price_paise, c.quantity, p.stock
     FROM cart_items c JOIN products p ON p.id = c.product_id
     WHERE c.owner = $1 AND p.active ORDER BY c.added_at`,
    [owner],
  )
  return { lines, total: totalPaise(lines), count: lines.reduce((n, l) => n + l.quantity, 0) }
}

export async function setCartQuantity(owner: string, productId: number, quantity: number) {
  if (quantity === 0) {
    await query('DELETE FROM cart_items WHERE owner = $1 AND product_id = $2', [owner, productId])
    return
  }
  const product = await query<{ stock: number }>('SELECT stock FROM products WHERE id = $1 AND active', [productId])
  if (!product[0]) throw new HttpError(404, 'That product is not available.')
  if (quantity > product[0].stock) throw new HttpError(409, `Only ${product[0].stock} left in stock.`)
  await query(
    `INSERT INTO cart_items (owner, product_id, quantity) VALUES ($1,$2,$3)
     ON CONFLICT (owner, product_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
    [owner, productId, quantity],
  )
}
