import type { Metadata } from 'next'
import Denied from '@/components/Denied'
import ProductEditor from '@/components/client/ProductEditor'
import { adminGuard } from '@/lib/admin-page'
import { CATEGORIES, listAllProducts } from '@/lib/products'

export const metadata: Metadata = { title: 'Products · Admin' }

export default async function AdminProducts() {
  const g = await adminGuard('products:write', '/admin/products')
  if (!g.allowed) return <Denied reason={g.reason} />
  const products = await listAllProducts()
  return (
    <div className="stack-lg">
      <h1 className="h1">Products</h1>
      <p className="muted measure">Price and stock changes are recorded in the audit log with the old and new values.</p>
      <ProductEditor categories={[...CATEGORIES]} products={products.map((p) => ({
        id: p.id, name: p.name, slug: p.slug, sku: p.sku, tagline: p.tagline, description: p.description, category: p.category,
        art: p.art, pricePaise: p.price_paise, stock: p.stock, active: p.active,
      }))} />
    </div>
  )
}
