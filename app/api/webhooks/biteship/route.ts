import { revalidateTag } from "next/cache"
import { db } from "@/lib/db"
import { mapBiteshipStatus } from "@/lib/shipping"
import { sendShipped } from "@/lib/email"
import { courierLabel } from "@/lib/format"

// POST /api/webhooks/biteship?secret=<BITESHIP_WEBHOOK_SECRET>: order status updates.
// Register it in the Biteship dashboard with the secret in the query string.
export async function POST(request: Request) {
  const secret = process.env.BITESHIP_WEBHOOK_SECRET
  if (!secret || new URL(request.url).searchParams.get("secret") !== secret) return Response.json({ ok: false }, { status: 401 })
  const body = await request.json().catch(() => null)
  // Biteship sends a test ping with no order when the webhook is saved
  if (!body?.order_id) return Response.json({ ok: true })

  const shipment = await db.shipment.findUnique({ where: { externalId: body.order_id }, include: { order: true } })
  const status = mapBiteshipStatus(String(body.status ?? ""))
  if (!shipment || !status) return Response.json({ ok: true, ignored: true })

  const now = new Date()
  await db.$transaction(async (tx) => {
    await tx.shipment.update({
      where: { id: shipment.id },
      data: {
        status,
        trackingNumber: body.courier_waybill_id ?? shipment.trackingNumber,
        ...(status === "PICKED_UP" && !shipment.shippedAt ? { shippedAt: now } : {}),
        ...(status === "DELIVERED" ? { deliveredAt: now } : {}),
      },
    })
    const o = shipment.order
    if (status === "PICKED_UP" && (o.status === "PAID" || o.status === "PROCESSING")) {
      await tx.order.update({ where: { id: o.id }, data: { status: "SHIPPED" } })
      await tx.orderEvent.create({ data: { orderId: o.id, status: "SHIPPED", message: "Picked up by courier" } })
    }
    if (status === "DELIVERED" && o.status !== "DELIVERED") {
      await tx.order.update({ where: { id: o.id }, data: { status: "DELIVERED" } })
      await tx.orderEvent.create({ data: { orderId: o.id, status: "DELIVERED", message: "Delivered" } })
    }
  })
  if (status === "PICKED_UP") await sendShipped(shipment.order, courierLabel(shipment.courier, shipment.service), body.courier_waybill_id ?? shipment.trackingNumber)
  revalidateTag("admin", { expire: 0 })
  if (shipment.order.userId) revalidateTag(`orders:${shipment.order.userId}`, { expire: 0 })
  return Response.json({ ok: true })
}
