import type { Metadata } from "next"
import { Suspense } from "react"
import { requireStaff } from "@/lib/auth/session"
import { AdminSkeleton } from "@/components/admin/admin-skeleton"
import Link from "next/link"
import { ArrowDownRight, ArrowRight, ArrowUpRight, Download, Minus, Plus } from "lucide-react"
import { getAdminOverview } from "@/lib/data"
import { compactIDR, formatPrice, providerLabel } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { CategoryBars, ChartTable, RevenueChart, Sparkline } from "@/components/admin/charts"
import { PageHeader, StatusBadge } from "@/components/admin/status-badge"
import { DateRangeSelect } from "@/components/admin/date-range-select"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Dashboard" }

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
const timeAgo = (iso: string) => {
  const h = Math.round((Date.UTC(2026, 10, 16) - new Date(iso).getTime()) / 3_600_000)
  return h < 1 ? "Just now" : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
}

export default function AdminDashboard() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <DashboardContent />
    </Suspense>
  )
}

async function DashboardContent() {
  await requireStaff({ next: "/admin" })
  const o = await getAdminOverview()
  const kpis = [
    { label: "Revenue", value: compactIDR(o.kpis.revenue.value), full: formatPrice(o.kpis.revenue.value), delta: o.kpis.revenue.delta, trend: o.kpis.revenue.trend },
    { label: "Orders", value: o.kpis.orders.value.toLocaleString("id-ID"), delta: o.kpis.orders.delta, trend: o.kpis.orders.trend },
    { label: "Avg. order value", value: compactIDR(o.kpis.aov.value), full: formatPrice(o.kpis.aov.value), delta: o.kpis.aov.delta },
    { label: "Customers", value: o.kpis.customers.value.toLocaleString("id-ID"), delta: o.kpis.customers.delta },
  ]

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Welcome back, Rofi. Here's how the store is doing."
        actions={
          <>
            <Button variant="outline" className="h-9">
              <Download /> Export
            </Button>
            <Button asChild className="h-9">
              <Link href="/admin/products?new=1">
                <Plus /> Add product
              </Link>
            </Button>
          </>
        }
      />

      {/* One filter row above everything it scopes */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <DateRangeSelect />
        <span className="text-xs text-muted-foreground">Compared with the previous 7 days</span>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => {
          const flat = Math.abs(k.delta) < 0.05
          const up = k.delta >= 0
          return (
            <li key={k.label} className="rounded-xl border bg-card p-5">
              <p className="text-sm text-muted-foreground">{k.label}</p>
              <div className="mt-2 flex items-end justify-between gap-3">
                <p className="text-2xl font-semibold tracking-tight whitespace-nowrap tabular-nums" title={k.full}>
                  {k.value}
                </p>
                {k.trend && <Sparkline values={k.trend} />}
              </div>
              <p className="mt-2 flex items-center gap-1 text-xs">
                <span
                  className={cn("inline-flex items-center gap-0.5 font-medium", flat ? "text-muted-foreground" : up ? "text-success" : "text-destructive")}
                >
                  {flat ? <Minus className="size-3.5" /> : up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                  {flat ? "0.0" : `${up ? "+" : ""}${k.delta.toFixed(1)}`}%
                </span>
                <span className="text-muted-foreground">vs last week</span>
              </p>
            </li>
          )
        })}
      </ul>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <section className="rounded-xl border bg-card p-5" aria-labelledby="rev-title">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 id="rev-title" className="font-medium">
                Daily revenue
              </h2>
              <p className="text-xs text-muted-foreground">Last 30 days · IDR</p>
            </div>
            <p className="text-right">
              <span className="block text-lg font-semibold tabular-nums">
                {compactIDR(o.revenueSeries.reduce((n, d) => n + d.revenue, 0))}
              </span>
              <span className="text-xs text-muted-foreground">30-day total</span>
            </p>
          </div>
          <RevenueChart data={o.revenueSeries} />
          <ChartTable caption="Daily revenue" rows={o.revenueSeries.map((d) => [shortDate(d.date), formatPrice(d.revenue)])} />
        </section>

        <section className="rounded-xl border bg-card p-5" aria-labelledby="cat-title">
          <h2 id="cat-title" className="font-medium">
            Revenue by category
          </h2>
          <p className="mb-5 text-xs text-muted-foreground">Last 30 days · IDR</p>
          <CategoryBars data={o.categoryRevenue} />
          <ChartTable caption="Revenue by category" rows={o.categoryRevenue.map((d) => [d.name, formatPrice(d.revenue)])} />
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="font-medium">Recent payments</h2>
            <Link href="/admin/payments" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              View all <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-y bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Customer</th>
                  <th className="px-3 py-2.5 font-medium">Method</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-5 py-2.5 text-right font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {o.recentPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/40">
                    <td className="px-5 py-3">
                      <p className="font-medium">{p.customer}</p>
                      <p className="text-xs text-muted-foreground">{p.orderNumber}</p>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{providerLabel(p.provider)}</td>
                    <td className="px-3 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatPrice(p.amount)}</td>
                    <td className="px-5 py-3 text-right text-xs text-muted-foreground">{timeAgo(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-4">
          <section className="rounded-xl border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium">Low stock</h2>
              <Link href="/admin/products?stock=low" className="text-xs text-primary hover:underline">
                Restock
              </Link>
            </div>
            <ul className="space-y-3">
              {o.lowStock.map((p) => (
                <li key={p.id}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{p.name}</span>
                    <span className={cn("shrink-0 text-xs font-medium tabular-nums", p.totalStock <= 2 ? "text-destructive" : "text-warning")}>
                      {p.totalStock} left
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", p.totalStock <= 2 ? "bg-destructive" : "bg-warning")}
                      style={{ width: `${Math.max(6, (p.totalStock / 10) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-3 font-medium">Top products</h2>
            <ol className="space-y-2.5">
              {o.topProducts.map((p, i) => (
                <li key={p.id} className="flex items-center gap-3 text-sm">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground tabular-nums">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{p.soldCount.toLocaleString("id-ID")} sold</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  )
}
