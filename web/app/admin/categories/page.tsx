import type { Metadata } from "next"
import { Suspense } from "react"
import { requireStaff } from "@/lib/auth/session"
import { AdminSkeleton } from "@/components/admin/admin-skeleton"
import { getAdminCategories } from "@/lib/data"
import { CategoriesManager } from "@/components/admin/categories-manager"

export const metadata: Metadata = { title: "Categories" }

export default function AdminCategoriesPage() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <CategoriesContent />
    </Suspense>
  )
}

async function CategoriesContent() {
  await requireStaff({ next: "/admin/categories" })
  const categories = await getAdminCategories()
  return <CategoriesManager categories={categories} />
}
