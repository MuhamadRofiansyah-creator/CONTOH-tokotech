import type { Metadata } from "next"
import { Suspense } from "react"
import { requireStaff } from "@/lib/auth/session"
import { AdminSkeleton } from "@/components/admin/admin-skeleton"
import { getAdminProducts, getBrands, getCategories } from "@/lib/data"
import { ProductsManager } from "@/components/admin/products-manager"
import { Skeleton } from "@/components/ui/skeleton"

export const metadata: Metadata = { title: "Products" }

export default function AdminProductsPage() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <ProductsContent />
    </Suspense>
  )
}

async function ProductsContent() {
  await requireStaff({ next: "/admin/products" })
  const [products, categories, brands] = await Promise.all([getAdminProducts(), getCategories(), getBrands()])
  return (
    <Suspense fallback={<Skeleton className="h-[640px] rounded-xl" />}>
      <ProductsManager products={products} categories={categories.map((c) => c.name)} brands={brands} />
    </Suspense>
  )
}
