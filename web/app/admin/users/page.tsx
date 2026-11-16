import type { Metadata } from "next"
import { Suspense } from "react"
import { requireStaff } from "@/lib/auth/session"
import { AdminSkeleton } from "@/components/admin/admin-skeleton"
import { getAdminUsers } from "@/lib/data"
import { UsersManager } from "@/components/admin/users-manager"

export const metadata: Metadata = { title: "Users" }

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <UsersContent />
    </Suspense>
  )
}

async function UsersContent() {
  await requireStaff({ admin: true, next: "/admin/users" })
  const users = await getAdminUsers()
  return <UsersManager users={users} />
}
