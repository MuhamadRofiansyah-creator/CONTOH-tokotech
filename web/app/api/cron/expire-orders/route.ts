import { expireOverduePayments } from "@/lib/orders/settle"

// GET /api/cron/expire-orders with "Authorization: Bearer <CRON_SECRET>".
// For hosted schedulers (e.g. Vercel Cron). On `next start`, instrumentation.ts runs the same job every 5 minutes.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ ok: false }, { status: 401 })
  const expired = await expireOverduePayments()
  return Response.json({ ok: true, expired })
}
