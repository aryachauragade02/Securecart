const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 })

export function formatPaise(paise: number): string {
  return INR.format(paise / 100)
}

/** Order total from server-side prices. The client never sends prices. */
export function totalPaise(lines: Array<{ unit_price_paise: number; quantity: number }>): number {
  return lines.reduce((sum, l) => sum + l.unit_price_paise * l.quantity, 0)
}
