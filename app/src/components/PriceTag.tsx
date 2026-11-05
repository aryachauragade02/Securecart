import { formatPaise } from '@/lib/money'

export default function PriceTag({ paise, large }: { paise: number; large?: boolean }) {
  return <span className={`tag${large ? ' tag-lg' : ''}`}><span className="sr-only">Price </span>{formatPaise(paise)}</span>
}
