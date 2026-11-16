import type { Metadata } from "next"
import { Suspense } from "react"
import { requireStaff } from "@/lib/auth/session"
import { AdminSkeleton } from "@/components/admin/admin-skeleton"
import { getReviewQueue } from "@/lib/data"
import { ReviewsManager } from "@/components/admin/reviews-manager"

export const metadata: Metadata = { title: "Reviews" }

export default function AdminReviewsPage() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <ReviewsContent />
    </Suspense>
  )
}

async function ReviewsContent() {
  await requireStaff({ next: "/admin/reviews" })
  const reviews = await getReviewQueue()
  return <ReviewsManager reviews={reviews} />
}
