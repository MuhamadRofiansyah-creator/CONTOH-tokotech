"use client"

import { useState } from "react"
import { CalendarDays } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"

const PRESETS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
]

/** Date range control (UI only in Phase 1; presets first, custom tucked last). */
export function DateRangeSelect({ defaultValue = "7d" }: { defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue)
  return (
    <Select value={value} onValueChange={setValue}>
      <SelectTrigger className="h-9! min-w-40 bg-background" aria-label="Date range">
        <CalendarDays className="size-4 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        {PRESETS.map((p) => (
          <SelectItem key={p.value} value={p.value}>
            {p.label}
          </SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value="custom">Custom range…</SelectItem>
      </SelectContent>
    </Select>
  )
}
