import type { Metadata } from "next"
import { Suspense } from "react"
import { requireStaff } from "@/lib/auth/session"
import { AdminSkeleton } from "@/components/admin/admin-skeleton"
import { getVouchers } from "@/lib/data"
import { VouchersManager } from "@/components/admin/promotions-manager"

export const metadata: Metadata = { title: "Vouchers" }

export default function AdminVouchersPage() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <VouchersContent />
    </Suspense>
  )
}

async function VouchersContent() {
  await requireStaff({ next: "/admin/vouchers" })
  const vouchers = await getVouchers()
  return <VouchersManager vouchers={vouchers} />
}
