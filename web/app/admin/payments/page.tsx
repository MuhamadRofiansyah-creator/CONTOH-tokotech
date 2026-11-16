import type { Metadata } from "next"
import { Suspense } from "react"
import { requireStaff } from "@/lib/auth/session"
import { AdminSkeleton } from "@/components/admin/admin-skeleton"
import { getPayments } from "@/lib/data"
import { PaymentsManager } from "@/components/admin/payments-manager"

export const metadata: Metadata = { title: "Payments" }

export default function AdminPaymentsPage() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <PaymentsContent />
    </Suspense>
  )
}

async function PaymentsContent() {
  await requireStaff({ admin: true, next: "/admin/payments" })
  const payments = await getPayments()
  return <PaymentsManager payments={payments} />
}
