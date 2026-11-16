"use client"

import Link from "next/link"
import { useState } from "react"
import { Bell, LogOut, Menu, Search, Settings, Store } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Logo } from "@/components/layout/logo"
import { ThemeToggle } from "@/components/layout/header-actions"
import { AdminNav, type AdminCounts } from "./admin-nav"
import { initials, signOutToHome, useSessionUser } from "@/components/auth/session-user"

const NOTIFICATIONS = [
  { title: "Payment PAY-908412 is pending", time: "2 min ago" },
  { title: "Raider 18 HX AI: 1 unit left", time: "1 hour ago" },
  { title: "New staff invite accepted", time: "Yesterday" },
]

export function AdminTopbar({ counts }: { counts: AdminCounts }) {
  const [open, setOpen] = useState(false)
  const { user } = useSessionUser()
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur sm:px-6">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger className="-ml-1 inline-flex size-9 items-center justify-center rounded-lg hover:bg-muted lg:hidden">
          <Menu className="size-5" />
          <span className="sr-only">Open navigation</span>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 gap-0 p-0">
          <SheetHeader className="border-b">
            <SheetTitle asChild>
              <div className="flex items-center gap-2">
                <Logo />
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Admin</span>
              </div>
            </SheetTitle>
          </SheetHeader>
          <AdminNav counts={counts} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <label className="relative hidden max-w-md flex-1 sm:block">
        <span className="sr-only">Search admin</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          placeholder="Search products, payments, users…"
          className="h-9 w-full rounded-lg border bg-muted/50 pr-12 pl-9 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:bg-background focus:ring-3 focus:ring-primary/15"
        />
        <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border bg-background px-1.5 text-[10px] text-muted-foreground">
          ⌘K
        </kbd>
      </label>

      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger className="relative inline-flex size-9 items-center justify-center rounded-lg hover:bg-muted">
            <Bell className="size-[18px]" />
            <span className="absolute top-2 right-2 size-2 rounded-full bg-destructive ring-2 ring-background" />
            <span className="sr-only">Notifications, 3 unread</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {NOTIFICATIONS.map((n) => (
              <DropdownMenuItem key={n.title} className="flex-col items-start gap-0.5">
                <span className="text-sm">{n.title}</span>
                <span className="text-xs text-muted-foreground">{n.time}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="mx-1 h-6 w-px bg-border" />
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg p-1 text-left hover:bg-muted">
            <Avatar className="size-8">
              <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">{user ? initials(user.name, user.email) : ""}</AvatarFallback>
            </Avatar>
            <span className="hidden leading-tight sm:block">
              <span className="block text-sm font-medium">{user?.name ?? " "}</span>
              <span className="block text-[11px] text-muted-foreground">{user?.role === "ADMIN" ? "Administrator" : user?.role === "STAFF" ? "Staff" : " "}</span>
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link href="/">
                <Store /> View store
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => signOutToHome()}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
