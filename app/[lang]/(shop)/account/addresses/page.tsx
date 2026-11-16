import type { Metadata } from "next"
import { MapPin, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getAddresses } from "@/lib/data"
import { Suspense } from "react"
import { requireUser } from "@/lib/auth/session"
import { AccountSkeleton } from "@/components/account/account-skeleton"
import { getDictionary, getLocale } from "@/lib/i18n/dictionary"
import { fmt, localizePath } from "@/lib/i18n/config"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).meta.addresses }
}

export default function AddressesPage() {
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <AddressesContent />
    </Suspense>
  )
}

async function AddressesContent() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()])
  const user = await requireUser(localizePath("/account/addresses", locale))
  const addresses = await getAddresses(user.id)
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-medium tracking-tight">{t.account.addresses}</h1>
        <Button>
          <Plus /> {t.account.addAddress}
        </Button>
      </div>
      <ul className="mt-6 grid gap-4 md:grid-cols-2">
        {addresses.map((a) => (
          <li key={a.id} className="flex flex-col rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2">
              <MapPin className="size-4 text-primary" />
              <span className="font-medium">{a.label}</span>
              {a.isDefault && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">{t.account.primary}</span>}
            </div>
            <p className="mt-3 text-sm">
              {a.recipient} · {a.phone}
            </p>
            <p className="mt-1 flex-1 text-sm text-muted-foreground">
              {a.street}, {a.district}, {a.city}, {a.province} {a.postalCode}
              {a.notes && <span className="mt-1 block text-xs">{fmt(t.account.note, { note: a.notes })}</span>}
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm">
                {t.common.edit}
              </Button>
              {!a.isDefault && (
                <Button variant="ghost" size="sm">
                  {t.account.setPrimary}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
