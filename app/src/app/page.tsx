import Link from 'next/link'
import PriceTag from '@/components/PriceTag'
import ProductArt from '@/components/ProductArt'
import { CATEGORIES, listProducts } from '@/lib/products'

export default async function Shop({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams
  const active = CATEGORIES.find((c) => c === category)
  const products = await listProducts(active)
  return (
    <>
      <section className="hero">
        <h1 className="display">Equipment for people who defend systems.</h1>
        <div className="hero-aside stack">
          <p className="lede">Hardware security keys, privacy gear, practice labs and training. Sign in with a passkey, pay on a hosted checkout, and see every security control we use.</p>
          <p><Link href="/security">How SecureCart protects your account and payment</Link></p>
        </div>
      </section>

      <nav className="filters" aria-label="Categories">
        <Link href="/" aria-current={!active ? 'true' : undefined}>Everything</Link>
        {CATEGORIES.map((c) => (
          <Link key={c} href={`/?category=${encodeURIComponent(c)}`} aria-current={active === c ? 'true' : undefined}>{c}</Link>
        ))}
      </nav>

      <div className="grid">
        {products.map((p) => (
          <Link key={p.id} href={`/products/${p.slug}`} className="plate">
            <div className="plate-art"><ProductArt art={p.art} /></div>
            <div className="plate-body">
              <span className="meta code">{p.sku}</span>
              <span className="plate-name">{p.name}</span>
              <span className="muted small">{p.tagline}</span>
              <div className="plate-foot">
                <PriceTag paise={p.price_paise} />
                {p.stock === 0 ? <span className="stock-low">Out of stock</span> : p.stock < 30 ? <span className="stock-low">{p.stock} left</span> : null}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  )
}
