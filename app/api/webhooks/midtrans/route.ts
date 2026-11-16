import { db } from "@/lib/db"
import { applyPaymentStatus } from "@/lib/orders/settle"
import { mapPaymentType, mapTransactionStatus, verifySignature } from "@/lib/payments/midtrans"

// POST /api/webhooks/midtrans: set this URL as the Payment Notification URL in the
// Midtrans dashboard (Settings > Configuration). Signature-verified and idempotent.
export async function POST(request: Request) {
  const n = await request.json().catch(() => null)
  if (!n || !verifySignature(n)) return Response.json({ ok: false, error: "invalid signature" }, { status: 401 })

  const payment = await db.payment.findUnique({ where: { number: n.order_id }, select: { amount: true } })
  if (!payment) return Response.json({ ok: true, ignored: "unknown order_id" })
  // Never trust an amount that doesn't match what we asked for
  if (Math.round(Number(n.gross_amount)) !== payment.amount) return Response.json({ ok: false, error: "amount mismatch" }, { status: 400 })

  const status = mapTransactionStatus(n.transaction_status, n.fraud_status)
  const type = mapPaymentType(n)
  if (status)
    await applyPaymentStatus(n.order_id, status, {
      transactionId: n.transaction_id ?? null,
      method: type?.method,
      provider: type?.provider,
      fraudStatus: n.fraud_status ?? null,
      vaNumber: n.va_numbers?.[0]?.va_number ?? n.permata_va_number ?? n.bill_key ?? null,
      raw: n,
    })
  return Response.json({ ok: true })
}
