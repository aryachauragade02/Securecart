'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { api, errorMessage } from '@/lib/client-api'
import { formatPaise } from '@/lib/money'

type P = { id: number; name: string; slug: string; sku: string; tagline: string; description: string; category: string; art: string; pricePaise: number; stock: number; active: boolean }
const ARTS = ['key', 'key-nfc', 'shutter', 'sleeve', 'screen', 'lab', 'flag', 'course', 'course-ir', 'book', 'sticker']
const blank = (category: string): P => ({ id: 0, name: '', slug: '', sku: '', tagline: '', description: '', category, art: 'key', pricePaise: 10000, stock: 0, active: true })

export default function ProductEditor({ products, categories }: { products: P[]; categories: string[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<P | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof P>(k: K, v: P[K]) => setEditing((e) => (e ? { ...e, [k]: v } : e))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setBusy(true)
    setError(null)
    const { id, ...body } = editing
    try {
      await api(id ? `/api/admin/products/${id}` : '/api/admin/products', id ? 'PATCH' : 'POST', body)
      setEditing(null)
      router.refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <form onSubmit={save} className="panel stack" noValidate>
        <h2 className="h2">{editing.id ? `Edit ${editing.name}` : 'New product'}</h2>
        <div className="controls">
          <div className="field"><label htmlFor="p-name">Name</label><input id="p-name" className="input" value={editing.name} onChange={(e) => set('name', e.target.value)} /></div>
          <div className="field"><label htmlFor="p-sku">SKU</label><input id="p-sku" className="input" value={editing.sku} onChange={(e) => set('sku', e.target.value.toUpperCase())} /></div>
          <div className="field"><label htmlFor="p-slug">URL slug</label><input id="p-slug" className="input" value={editing.slug} onChange={(e) => set('slug', e.target.value)} /></div>
          <div className="field"><label htmlFor="p-cat">Category</label><select id="p-cat" className="input" value={editing.category} onChange={(e) => set('category', e.target.value)}>{categories.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="field"><label htmlFor="p-price">Price (₹)</label><input id="p-price" className="input" type="number" min={1} step="0.01" value={editing.pricePaise / 100} onChange={(e) => set('pricePaise', Math.round(Number(e.target.value) * 100))} /></div>
          <div className="field"><label htmlFor="p-stock">Stock</label><input id="p-stock" className="input" type="number" min={0} value={editing.stock} onChange={(e) => set('stock', Number(e.target.value))} /></div>
          <div className="field"><label htmlFor="p-art">Drawing</label><select id="p-art" className="input" value={editing.art} onChange={(e) => set('art', e.target.value)}>{ARTS.map((a) => <option key={a}>{a}</option>)}</select></div>
          <div className="field"><label htmlFor="p-active">Visibility</label><select id="p-active" className="input" value={editing.active ? 'yes' : 'no'} onChange={(e) => set('active', e.target.value === 'yes')}><option value="yes">On sale</option><option value="no">Hidden</option></select></div>
        </div>
        <div className="field"><label htmlFor="p-tag">Tagline</label><input id="p-tag" className="input" value={editing.tagline} onChange={(e) => set('tagline', e.target.value)} /></div>
        <div className="field"><label htmlFor="p-desc">Description</label><textarea id="p-desc" className="input" value={editing.description} onChange={(e) => set('description', e.target.value)} /></div>
        {error && <p className="notice notice-bad" role="alert">{error}</p>}
        <div className="row"><button className="btn btn-dark" disabled={busy}>Save product</button><button type="button" className="linklike" onClick={() => setEditing(null)}>Cancel</button></div>
      </form>
    )
  }

  return (
    <div className="stack">
      <div><button className="btn" onClick={() => setEditing(blank(categories[0]))}>Add a product</button></div>
      <div className="panel panel-tight table-wrap">
        <table className="table">
          <thead><tr><th>SKU</th><th>Name</th><th>Category</th><th className="num">Price</th><th className="num">Stock</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td className="code small">{p.sku}</td><td>{p.name}</td><td>{p.category}</td>
                <td className="num">{formatPaise(p.pricePaise)}</td><td className="num">{p.stock}</td>
                <td>{p.active ? <span className="status status-on">On sale</span> : <span className="status status-off">Hidden</span>}</td>
                <td className="num"><button className="btn btn-sm btn-quiet" onClick={() => setEditing(p)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
