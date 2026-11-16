import type { Metadata } from "next"
import { Lexend, Geist_Mono } from "next/font/google"
import { ThemeProvider } from "next-themes"
import { SessionProvider } from "next-auth/react"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { I18nProvider } from "@/components/i18n/provider"
import { en } from "@/lib/i18n/dictionaries/en"
import "../globals.css"
import { Logo } from "@/components/layout/logo"
import { AdminNav } from "@/components/admin/admin-nav"
import { AdminTopbar } from "@/components/admin/admin-topbar"
import { getAdminProducts, getPayments, getReviewQueue } from "@/lib/data"

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin | TokoTech" },
  robots: { index: false },
}

const lexend = Lexend({ variable: "--font-lexend", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

// Admin is its own root layout (English only; the storefront root layout is app/[lang]/layout.tsx).
// Access: proxy.ts redirects non-staff; each page re-checks with requireStaff() inside <Suspense>.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [products, payments, reviews] = await Promise.all([getAdminProducts(), getPayments(), getReviewQueue()])
  const counts = {
    products: products.length,
    pendingPayments: payments.filter((p) => p.status === "PENDING").length,
    pendingReviews: reviews.filter((r) => r.status === "PENDING").length,
    lowStock: products.filter((p) => p.status === "ACTIVE" && p.totalStock <= 5).length,
  }
  return (
    <html lang="en" suppressHydrationWarning className={`${lexend.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <I18nProvider locale="en" dict={en}>
            <SessionProvider>
              <TooltipProvider>
    <div className="flex min-h-dvh bg-muted/40">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-sidebar lg:flex">
        <div className="flex h-16 items-center gap-2 border-b px-5">
          <Logo />
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Admin</span>
        </div>
        <AdminNav counts={counts} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar counts={counts} />
        <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
              </TooltipProvider>
            </SessionProvider>
          </I18nProvider>
          <Toaster position="bottom-right" richColors={false} />
        </ThemeProvider>
      </body>
    </html>
  )
}
