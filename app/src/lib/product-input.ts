import { z } from 'zod'
import { CATEGORIES } from './products'

export const ProductInput = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens.').max(80),
  sku: z.string().trim().regex(/^[A-Z0-9-]{3,20}$/, 'Use 3-20 capital letters, digits or hyphens.'),
  tagline: z.string().trim().min(2).max(160),
  description: z.string().trim().min(2).max(2000),
  category: z.enum(CATEGORIES),
  art: z.enum(['key', 'key-nfc', 'shutter', 'sleeve', 'screen', 'lab', 'flag', 'course', 'course-ir', 'book', 'sticker']),
  pricePaise: z.number().int().min(100, 'Minimum price is ₹1.').max(10_000_000),
  stock: z.number().int().min(0).max(1_000_000),
  active: z.boolean(),
})
