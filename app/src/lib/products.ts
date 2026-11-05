import { one, query } from './db'

export type Product = {
  id: number
  slug: string
  sku: string
  name: string
  tagline: string
  description: string
  category: string
  art: string
  price_paise: number
  stock: number
  active: boolean
  specs: [string, string][]
}

export const CATEGORIES = ['Hardware keys', 'Privacy gear', 'Lab kits', 'Training', 'Books', 'Merch'] as const

export async function listProducts(category?: string): Promise<Product[]> {
  if (category) return query<Product>('SELECT * FROM products WHERE active AND category = $1 ORDER BY id', [category])
  return query<Product>('SELECT * FROM products WHERE active ORDER BY id')
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  return one<Product>('SELECT * FROM products WHERE slug = $1 AND active', [slug])
}

export async function listAllProducts(): Promise<Product[]> {
  return query<Product>('SELECT * FROM products ORDER BY id')
}
