import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import AddToCart from '@/components/client/AddToCart'
import PriceTag from '@/components/PriceTag'
import ProductArt from '@/components/ProductArt'
import { getProductBySlug } from '@/lib/products'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getProductBySlug((await params).slug)
  return { title: p?.name ?? 'Product not found' }
}

export default async function ProductPage({ params }: Props) {
  const p = await getProductBySlug((await params).slug)
  if (!p) notFound()
  return (
    <div className="stack-lg">
      <p className="meta"><Link href="/">Shop</Link> / <Link href={`/?category=${encodeURIComponent(p.category)}`}>{p.category}</Link></p>
      <div className="product">
        <div className="product-art"><ProductArt art={p.art} title={p.name} /></div>
        <div className="stack-lg">
          <div className="stack">
            <span className="meta code">{p.sku}</span>
            <h1 className="h1">{p.name}</h1>
            <p className="lede">{p.tagline}</p>
          </div>
          <PriceTag paise={p.price_paise} large />
          <AddToCart productId={p.id} stock={p.stock} />
          <p className="measure">{p.description}</p>
          {p.specs.length > 0 && (
            <table className="specs">
              <caption className="sr-only">Specifications</caption>
              <tbody>{p.specs.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
