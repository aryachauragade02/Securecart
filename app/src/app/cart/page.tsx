import type { Metadata } from 'next'
import Link from 'next/link'
import CartLineControls from '@/components/client/CartLineControls'
import CheckoutButton from '@/components/client/CheckoutButton'
import PriceTag from '@/components/PriceTag'
import ProductArt from '@/components/ProductArt'
import { cartOwner, getAuth } from '@/lib/auth'
import { getCart } from '@/lib/cart'
import { env } from '@/lib/env'
import { formatPaise } from '@/lib/money'

export const metadata: Metadata = { title: 'Cart' }

export default async function CartPage() {
  const auth = await getAuth()
  const cart = await getCart(cartOwner(auth))
  if (cart.lines.length === 0) {
    return (
      <div className="stack-lg measure">
        <h1 className="h1">Your cart is empty</h1>
        <p className="lede">Browse hardware keys, privacy gear and training in the <Link href="/">shop</Link>.</p>
      </div>
    )
  }
  return (
    <div className="stack-lg">
      <h1 className="h1">Cart</h1>
      <div className="summary">
        <div className="panel">
          {cart.lines.map((l) => (
            <div className="cart-line" key={l.product_id}>
              <div className="cart-thumb"><ProductArt art={l.art} /></div>
              <div>
                <Link href={`/products/${l.slug}`} className="h3">{l.name}</Link>
                <div className="meta">{formatPaise(l.unit_price_paise)} each</div>
              </div>
              <CartLineControls productId={l.product_id} quantity={l.quantity} max={Math.min(10, l.stock)} />
              <strong className="num">{formatPaise(l.unit_price_paise * l.quantity)}</strong>
            </div>
          ))}
        </div>
        <aside className="panel stack-lg">
          <div className="spread"><span className="h2">Total</span><PriceTag paise={cart.total} large /></div>
          <p className="small muted">Prices are checked again on our server when you check out. You pay on {env.paymentProvider === 'razorpay' ? "Razorpay's" : "TestPay's"} secure page; SecureCart never sees your card number.</p>
          {auth.user ? (
            <CheckoutButton provider={env.paymentProvider} />
          ) : (
            <div className="stack">
              <Link className="btn btn-primary btn-block" href="/login?next=/cart">Sign in to check out</Link>
              <p className="small muted">Your cart is kept when you sign in. New here? <Link href="/register?next=/cart">Create an account</Link>.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
