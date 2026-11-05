const LABEL: Record<string, string> = {
  pending_payment: 'Awaiting payment',
  paid: 'Paid',
  shipped: 'Shipped',
  cancelled: 'Cancelled',
}

export default function OrderStatus({ status }: { status: string }) {
  return <span className={`status status-${status}`}>{LABEL[status] ?? status}</span>
}
