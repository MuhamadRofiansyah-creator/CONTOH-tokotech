# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@web/AGENTS.md

## Project status

TokoTech is an e-commerce storefront and admin dashboard for computer products (Indonesian market, IDR prices). Phases 1–3 are built: Auth.js sign-in, a database cart, checkout with stock holds, Midtrans payments, Biteship shipping, Resend emails and admin writes. Each external service falls back to a mock when its key is missing from `.env` (mock rates/waybills, `/checkout/pay/[number]` payment simulator, console emails). See `docs/PLAN.md` for the roadmap and `docs/DATA-MODEL.md` for the data model. `prisma/schema.prisma` uses Prisma 7 style: `prisma-client` generator output in `lib/generated/prisma` (gitignored, regenerated on `npm install`), connection URL in `prisma.config.ts` from `DATABASE_URL` in `.env`. Decisions baked into it:
- Variants can change the price; stock lives on `ProductVariant`.
- Payments go through Midtrans (Snap).
- Guest checkout is allowed.
- Reviews are buyer-only and moderated.
- Vouchers and flash sales are in v1.
- Shipping uses live courier rates from an aggregator (Biteship or RajaOngkir), so variants carry weight/size and addresses carry `areaId`.
- Stock stays reserved until the payment expires.
- Returns are handled through support, with no return-request tables.
- Product content is English only, while the UI is bilingual.
- PC builder and B2B tax invoices are out of scope, so money stays whole-Rupiah `Int`.

Schema changes: edit `prisma/schema.prisma`, run `npm run db:migrate` (use `-- --create-only` and append SQL when you need a CHECK constraint, as the init migration does), then update the fixtures until `tsc` and `npx tsx prisma/seed.ts --check` pass.

## Commands

```bash
cd web               # all app commands run from web/
npm run dev          # dev server on http://localhost:3000 (Turbopack)
npm run build        # production build; also the strictest check (see Cache Components below)
npm run lint         # ESLint (flat config; `next lint` no longer exists in Next 16)
npx tsc --noEmit     # typecheck
npx next typegen     # regenerate PageProps/LayoutProps route types after adding routes
npx shadcn@latest add <component>   # add a shadcn/ui component (Radix base, "nova" preset)
npm run db:generate  # regenerate the Prisma client (lib/generated/prisma); runs on npm install
npm run db:migrate   # prisma migrate dev
npm run db:deploy    # apply migrations
npm run db:seed      # truncate + load the fixtures (repeatable)
npm run db:reset     # drop, migrate, seed
npx tsx prisma/seed.ts --check   # validate fixtures against the DB rules, no database needed
```

There is no test suite. Verify changes with `tsc`, `lint` and `next build`, then check the page in a browser. `next build` needs the database up (pages prerender from it); after `db:seed`, restart the server so `"use cache"` entries refresh.

## Stack specifics that bite

- **Next.js 16 + React 19, with `cacheComponents: true`** in `next.config.ts`. Any server component that reads `searchParams`, `params` (without `generateStaticParams`), cookies or headers must sit inside a `<Suspense>` boundary, or `next build` fails with "uncached or runtime data during prerendering". The pattern used: the page renders its static shell and passes the `searchParams` promise to an inner async component wrapped in Suspense (see `app/(shop)/c/[category]/page.tsx`). Client components using `useSearchParams` also need a Suspense parent.
- `params` and `searchParams` are Promises. Type pages with the global `PageProps<"/route">` / `LayoutProps<"/route">` helpers.
- **Tailwind CSS v4.** There is no tailwind config file. Theme tokens live in `app/globals.css` (`:root`, `.dark`, and `@theme inline`). The important modifier goes at the end (`h-10!`).
- **shadcn/ui components import `cn` from the `cn` package** (`lib/utils.ts` re-exports it). Generated files in `components/ui/` may be edited. One lint suppression already exists in `carousel.tsx`.
- Client modules cannot export plain functions for server use: a server component calling a function from a `"use client"` file fails at build time. Shared helpers (formatting etc.) belong in non-client modules such as `lib/format.ts`.

## Architecture

### Data access boundary
`lib/data/index.ts` is the **only** module pages and components may import data from. Its async functions (`getProducts`, `getProductBySlug`, `getCollection`, `getAdminOverview`, `getPayments`, …) query Postgres through `lib/db.ts` (PrismaClient with `@prisma/adapter-pg`). The module is `server-only`: a client component importing it fails the build.

- **Every read is `"use cache"`** with `cacheLife` + `cacheTag` (`catalog`, `product:<slug>`, `reviews:<productId>`, `orders:<userId>`, `admin`). That's what keeps pages prerendering under Cache Components; new reads must do the same (or sit under `<Suspense>`). Don't read cookies/headers inside them; pass values as arguments (account functions take `userId`).
- **Listing queries are raw SQL** built with `Prisma.sql` fragments in `getProducts`: `specs @> …::jsonb` filters (GIN index), facet counts via `count(*) FILTER (WHERE <all other filters>)`, `width_bucket` histogram. Search terms match the name/brand/category/spec text by `ILIKE` or `word_similarity ≥ 0.45` (pg_trgm).
- **Browser components can't import `lib/data`.** They use `GET /api/catalog?products=…&variants=…` through `useCatalog` (`components/cart/use-catalog.ts`, a per-session cache; `ready` gates rendering), `GET /api/search?q=…` (header suggestions) or server actions in `lib/actions/` (`checkVoucher`). Admin client tables get everything as props from their server page.
- **Fixtures live in `prisma/fixtures/`** and are only for the seed.

- **Types come from the schema.** `lib/types.ts` maps generated models through `Serialized<T>` (Date → ISO string) and narrows Json columns. Enum values are the uppercase Prisma enums (`"ACTIVE"`, `"PENDING_PAYMENT"`); display text comes from `lib/format.ts` (`providerLabel`, `courierLabel`, `PAYMENT_METHOD_LABEL`, `brandMark`) or the badge components.
- **Seed fixtures** (`prisma/fixtures/`) are inserted with their ids. Keep invariants true when editing them: `priceFrom`/`totalStock` via `syncDenormalized()`, `stock ≥ reserved`, order totals, every review tied to a delivered order item of its author.
- **Price and stock live on variants.** Use `priceFrom`/`compareAtFrom`/`totalStock`/`ratingAvg`/`soldCount` for listings and `lib/product.ts` (`defaultVariant`, `optionGroups`, `resolveVariant`, `productColors`, `available`) for variant logic. Badges are derived in `lib/data/index.ts`, never stored.
- The storefront only shows `status === "ACTIVE"` products; admin rows include drafts and archived.
- Cart lines are `{ variantId, quantity }`; voucher amounts are computed with `voucherDiscount` (`lib/pricing.ts`) from the rule `checkVoucher` returns.
- Admin tables take projection rows (`AdminProductRow`, `AdminUserRow`, `AdminPaymentRow`); KPIs and charts are `GROUP BY` queries over paid orders, by WIB day.
- The fixtures are deterministic (seeded PRNG, fixed `MOCK_NOW` of 2026-11-16 in `prisma/fixtures/clock.ts`); the app uses the real clock.

### Catalog filtering (the listing/search pages)
- Filter state lives entirely in the URL. `lib/filters.ts` parses it: reserved keys are `q, brand, color, min, max, rating, stock, sort, view, page`, and every key prefixed `f_` is a category-specific spec facet (e.g. `f_refresh=144Hz,165Hz`). Values are comma-joined lists.
- Spec facets are configured per category in `lib/data/categories.ts` (`facets: { key, label, type: "checkbox" | "chips", order }`). The key must match a key in `Product.specs`. The filter UI renders generically from this config.
- `getProducts` computes facet counts "excluding self" (standard faceted search) plus price bounds and a price histogram.
- On the client, `components/catalog/catalog-context.tsx` (`CatalogProvider` / `useCatalog`) owns URL updates via `router.replace` inside a transition, resets `page` on every filter change, and exposes `pending`. `PendingRegion` uses `pending` to dim results while they load.

### Languages (storefront: English + Bahasa Indonesia)
- Storefront routes live under `app/[lang]` (root layout `app/[lang]/layout.tsx` sets `<html lang>` and prerenders `en` + `id`). URLs: English is clean (`/c/mouse`, rewritten to `/en/c/mouse` by `proxy.ts`), Indonesian is `/id/c/mouse`; a visible `/en/...` redirects to the clean URL. `app/admin` is its own English-only root layout; `app/api` is unaffected.
- Text comes from `lib/i18n/dictionaries/en.ts` (defines the `Dictionary` type) and `id.ts` (must match; tsc enforces it). Placeholders use `fmt("Only {n} left", { n })`. Never hard-code UI text in storefront components; add a key to both files.
- Server components: `await getDictionary()` / `await getLocale()` (`lib/i18n/dictionary.ts`, reads the root param via `next/root-params`; not usable in client components, server actions or route handlers). Client components: `useDict()`, `useLocale()`, `useLocalePath()` from `components/i18n/provider`. Components shared by both (product card, primitives, breadcrumbs, order status) are client components.
- Links and navigation: import `Link` from `@/components/i18n/link` and `useRouter` from `@/components/i18n/provider` in storefront code; they add `/id` when needed. Server redirects build paths with `localizePath(path, locale)` (`lib/i18n/config.ts`). Don't use `useSearchParams` for text-bearing client components; pass query values from the page (see the login page).
- Product and category content (names, specs, descriptions) is English only; spec filter labels are translated via `t.specLabels[key]`.

### Auth
- `auth.ts` (Auth.js v5): JWT sessions with `id` + `role`; email + password via bcrypt; Google only when its env keys exist. Server code reads the user through `lib/auth/session.ts` (`getSessionUser`, `requireUser`, `requireStaff({ admin })`), always inside `<Suspense>` (it reads cookies) and never inside `"use cache"`; pass `user.id` into cached data functions.
- `proxy.ts` is the first gate for `/account` and `/admin` (payments/users are ADMIN-only); pages and every server action re-check.
- Client components use `useSessionUser()` (`components/auth/session-user.tsx`, from `next-auth/react`), so headers don't block prerendering.
- Seeded users share the password `SEED_USER_PASSWORD` (default `tokotech123`): Rofi `rofi@example.com` (ADMIN), Dewi `dewi.l@example.com` (STAFF), Siti `siti.n@example.com` (customer), Ayu `ayu.k@example.com` (suspended).

### Client state and server actions
- `stores/index.ts`: `useCart` is a client copy of the server cart. Mutations are optimistic, then call `lib/actions/cart.ts` and adopt the returned lines. `<StoreSync />` (root layout) loads the cart and syncs the wishlist whenever the session changes. `useWishlist`/`useCompare` persist to localStorage; the wishlist mirrors to the DB when signed in. `useVoucher` carries the cart's voucher into checkout.
- Server actions live in `lib/actions/` (`auth`, `cart`, `checkout`, `voucher`, `admin`). Admin actions return `AdminResult`; client managers run them through `useAdminAction()` (toast + `router.refresh()`), write an `AuditLog` row and call `updateTag`.

### Orders and payments
- `lib/orders/checkout.ts` `placeOrder`: the only way an order is created. It re-prices everything and holds stock with `UPDATE … WHERE stock - reserved >= qty` inside one transaction.
- `lib/orders/settle.ts` `applyPaymentStatus`: the only way a payment changes state (Midtrans webhook, mock pay page, expiry sweeper). It's idempotent and handles stock conversion/release, ledger rows, voucher redemption, flash-sale quota and cache invalidation. Keep these two functions as the single source of order/stock truth.
- External services: `lib/payments/midtrans.ts`, `lib/shipping.ts` (Biteship), `lib/email.ts` (Resend). Webhooks: `app/api/webhooks/{midtrans,biteship}`. The expiry sweeper runs from `instrumentation.ts` every 5 minutes on `next start`, and `/api/cron/expire-orders` (Bearer `CRON_SECRET`) serves hosted schedulers.

### Route groups / layouts
- `app/(shop)`: storefront with top bar, header and footer. This group also contains `account/*`.
- `app/(checkout)`: minimal header. `/checkout` is a client multi-step flow that calls `placeOrderAction`; `/checkout/pay/[number]` is the mock payment page.
- `app/(shop)/orders/[number]`: guest order page (needs the `?t=` token from the email).
- `app/(auth)`: login/register, split-screen layout.
- `app/admin`: separate shell (sidebar + top bar). Sidebar counts are computed in `app/admin/layout.tsx` and passed down. Admin pages check `requireStaff` inside `<Suspense>`, then pass data to client "manager" components (`components/admin/*-manager.tsx`), which filter and paginate locally and call admin server actions. Pages: dashboard, products, categories (name, slug, hero text, order; delete only when empty), payments (refund, ship, deliver), users, reviews, vouchers, flash sales. Catalog text (product and category names) lives in the database: edit it in the admin, and also in `prisma/fixtures/` if a reseed should keep it.

### Product imagery
There are no photos. `components/product/product-art.tsx` draws SVG art per `Category.art` kind (`monitor`, `keyboard`, `mouse`, `desktop`, `laptop`, `headset`, `gpu`), tinted by `Product.accent` and the selected color. `ProductImage` wraps it in a soft backdrop. Swap `ProductImage` for `next/image` once real photos exist.

### Admin charts
`components/admin/charts.tsx` contains hand-built SVG charts (no chart library): `RevenueChart` (area chart with crosshair, tooltip and arrow-key inspection), `CategoryBars`, `Sparkline`, and `ChartTable` (the "View as table" fallback). Series color is `--chart-1`. It was validated for contrast and lightness separately for light (`#0e9aa5` on white) and dark (`#12a3ae` on `#111a2e`), so re-validate if you change it or add series. Status colors (`StatusBadge` in `components/admin/status-badge.tsx`) are reserved for state and always carry an icon and a label.

## Conventions

- Prices are integers in IDR. Format only through `lib/format.ts`: `formatPrice`, `formatPriceShort` (slider labels), and `compactIDR` (axes/KPIs, e.g. "Rp 120 jt").
- Design tokens: teal `--primary`, navy `--topbar` (utility bar/footer), `--success`/`--warning`/`--destructive`, plus `--surface`. Font is Lexend (`--font-lexend`). Use `container-page` for the page gutter/max width.
- Rofi (`u-001`, `rofi@example.com`) is the main test account (ADMIN); see Auth for the others.
- Vouchers in the fixtures: `TOKOTECH10` (10%, max Rp 500 rb), `GRATISONGKIR` (free shipping over Rp 1 jt), `HEMAT100K` (expired).
- Customer self-service actions live in `lib/actions/account.ts` (addresses, reviews, stock alerts, newsletter, password reset). Footer info pages are `/info/[slug]` with bilingual content in `lib/i18n/info-pages.ts`. The printable invoice is `app/[lang]/(print)/invoice/[number]`.
- `MOCK_EMAIL_LINKS="true"` shows password-reset links on screen (self-hosted use only). `BITESHIP_ALLOW_LIVE` must be "true" before a live Biteship key is used (see `shippingMode()` in `lib/shipping.ts`).
- Local production: `npm run local` (migrate, build, start on :3000). Never run it while `npm run dev` is running; they share `.next`.
- Values shared by server and client code (e.g. `lib/admin-ranges.ts`) must live in plain modules: a server component can't import non-component exports from a "use client" file.
- Fixture source files may have been saved with CRLF endings on Windows; normalize to LF before scripted edits.
