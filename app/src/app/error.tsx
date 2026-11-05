'use client'

export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="stack-lg measure">
      <h1 className="h1">Something went wrong</h1>
      <p className="lede">The error was logged. Try again, and if it keeps happening, come back in a few minutes.</p>
      <p><button className="btn" onClick={reset}>Try again</button></p>
    </div>
  )
}
