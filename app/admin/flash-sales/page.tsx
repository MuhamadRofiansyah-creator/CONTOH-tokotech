import type { Metadata } from "next"
import { Suspense } from "react"
import { requireStaff } from "@/lib/auth/session"
import { AdminSkeleton } from "@/components/admin/admin-skeleton"
import { getFlashSales } from "@/lib/data"
import { FlashSalesManager } from "@/components/admin/promotions-manager"

export const metadata: Metadata = { title: "Flash sales" }

export default function AdminFlashsalesPage() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <FlashsalesContent />
    </Suspense>
  )
}

async function FlashsalesContent() {
  await requireStaff({ next: "/admin/flash-sales" })
  const data = await getFlashSales()
  return <FlashSalesManager data={data} />
}
