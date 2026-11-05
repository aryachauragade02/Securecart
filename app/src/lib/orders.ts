import type pg from 'pg'
import { one, query, tx } from './db'
import { HttpError } from './http'
import { totalPaise } from './money'

export const ORDER_PAYMENT_WINDOW_MIN = 30
export const MAX_DECLINES_PER_ORDER = 3

export type Order = {
  id: string
  number: number
  user_id: string
  status: 'pending_payment' | 'paid' | 'shipped' | 'cancelled'
  total_paise: number
  currency: string
  provider: string
  provider_ref: string | null
  client_ip: string | null
  declined_count: number
  cancel_reason: string | null
  created_at: Date
  expires_at: Date
  paid_at: Date | null
  shipped_at: Date | null
}

export type OrderItem = { order_id: string; product_id: number; name: string; unit_price_paise: number; quantity: number }

async function restoreStock(c: pg.PoolClient, orderId: string) {
  await c.query(
    `UPDATE products p SET stock = p.stock + oi.quantity FROM order_items oi WHERE oi.order_id = $1 AND oi.product_id = p.id`,
    [orderId],
  )
}

/** Unpaid orders past their payment window are cancelled and their stock released. */
export async function expireStaleOrders() {
  const stale = await query<{ id: string }>(`SELECT id FROM orders WHERE status = 'pending_payment' AND expires_at < now() LIMIT 50`)
  for (const o of stale) await cancelOrder(o.id, 'payment window expired')
}

/**
 * Turns the cart into an order. Prices and stock come from the database inside one
 * transaction with the product rows locked, so a tampered client cannot change a price
 * and two shoppers cannot both buy the last unit.
 */
export async function createOrderFromCart(userId: string, owner: string, ip: string, provider: string): Promise<Order> {
  return tx(async (c) => {
    const lines = await c.query<{ product_id: number; name: string; unit_price_paise: number; quantity: number; stock: number; active: boolean }>(
      `SELECT ci.product_id, p.name, p.price_paise AS unit_price_paise, ci.quantity, p.stock, p.active
       FROM cart_items ci JOIN products p ON p.id = ci.product_id
       WHERE ci.owner = $1 ORDER BY p.id FOR UPDATE OF p`,
      [owner],
    )
    if (lines.rowCount === 0) throw new HttpError(400, 'Your cart is empty.')
    for (const l of lines.rows) {
      if (!l.active) throw new HttpError(409, `${l.name} is no longer available. Remove it from your cart to continue.`)
      if (l.quantity > l.stock) throw new HttpError(409, `Only ${l.stock} of ${l.name} left. Update your cart to continue.`)
    }
    const total = totalPaise(lines.rows)
    const order = (await c.query<Order>(
      `INSERT INTO orders (user_id, status, total_paise, provider, client_ip, expires_at)
       VALUES ($1, 'pending_payment', $2, $3, $4, now() + make_interval(mins => $5)) RETURNING *`,
      [userId, total, provider, ip, ORDER_PAYMENT_WINDOW_MIN],
    )).rows[0]
    for (const l of lines.rows) {
      await c.query('INSERT INTO order_items (order_id, product_id, name, unit_price_paise, quantity) VALUES ($1,$2,$3,$4,$5)',
        [order.id, l.product_id, l.name, l.unit_price_paise, l.quantity])
      await c.query('UPDATE products SET stock = stock - $2 WHERE id = $1', [l.product_id, l.quantity])
    }
    await c.query('DELETE FROM cart_items WHERE owner = $1', [owner])
    return order
  })
}

export async function setProviderRef(orderId: string, ref: string) {
  await query('UPDATE orders SET provider_ref = $2 WHERE id = $1', [orderId, ref])
}

export type PaidResult = 'paid' | 'already_paid' | 'amount_mismatch' | 'not_payable' | 'not_found'

/** Marks an order paid only if it is still pending and the amount matches what we charged. */
export async function markPaid(orderId: string, amountPaise: number, currency: string): Promise<{ result: PaidResult; order: Order | null }> {
  return tx(async (c) => {
    const order = (await c.query<Order>('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId])).rows[0]
    if (!order) return { result: 'not_found', order: null }
    if (order.status === 'paid' || order.status === 'shipped') return { result: 'already_paid', order }
    if (amountPaise !== order.total_paise || currency !== order.currency) return { result: 'amount_mismatch', order }
    if (order.status !== 'pending_payment') return { result: 'not_payable', order }
    const updated = (await c.query<Order>(`UPDATE orders SET status = 'paid', paid_at = now() WHERE id = $1 RETURNING *`, [orderId])).rows[0]
    return { result: 'paid', order: updated }
  })
}

/** Counts a declined attempt; after MAX_DECLINES_PER_ORDER the order is cancelled (card-testing defence). */
export async function recordDecline(orderId: string): Promise<{ order: Order | null; cancelled: boolean }> {
  const order = await one<Order>(
    `UPDATE orders SET declined_count = declined_count + 1 WHERE id = $1 AND status = 'pending_payment' RETURNING *`, [orderId])
  if (!order) return { order: await one<Order>('SELECT * FROM orders WHERE id = $1', [orderId]), cancelled: false }
  if (order.declined_count >= MAX_DECLINES_PER_ORDER) {
    await cancelOrder(orderId, `payment declined ${order.declined_count} times`)
    return { order, cancelled: true }
  }
  return { order, cancelled: false }
}

export async function cancelOrder(orderId: string, reason: string): Promise<boolean> {
  return tx(async (c) => {
    const res = await c.query(
      `UPDATE orders SET status = 'cancelled', cancel_reason = $2 WHERE id = $1 AND status = 'pending_payment' RETURNING id`, [orderId, reason])
    if (!res.rowCount) return false
    await restoreStock(c, orderId)
    return true
  })
}

/** Always scoped to the owner: guessing another order's ID returns nothing (no IDOR). */
export async function getOrderForUser(orderId: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return null
  const order = await one<Order>('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [orderId, userId])
  if (!order) return null
  const items = await query<OrderItem>('SELECT * FROM order_items WHERE order_id = $1 ORDER BY name', [orderId])
  return { order, items }
}

export async function listOrdersForUser(userId: string) {
  return query<Order & { item_count: number }>(
    `SELECT o.*, (SELECT sum(quantity) FROM order_items WHERE order_id = o.id)::int AS item_count
     FROM orders o WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [userId])
}

export async function orderItems(orderId: string) {
  return query<OrderItem>('SELECT * FROM order_items WHERE order_id = $1 ORDER BY name', [orderId])
}
