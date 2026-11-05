import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="stack-lg measure">
      <h1 className="h1">Page not found</h1>
      <p className="lede">The page may have moved, or the link is wrong.</p>
      <p><Link className="btn" href="/">Back to the shop</Link></p>
    </div>
  )
}
