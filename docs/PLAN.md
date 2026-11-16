# TokoTech: E-commerce for Computer Products

**Plan v3 · updated 16 Nov 2026**
Stack: Next.js 16 (App Router, Cache Components) · React 19 · Tailwind CSS 4 · shadcn/ui · zustand · PostgreSQL + Prisma 7 (Phase 2)

| Phase | Scope | Status |
|---|---|---|
| **1. UI** | Storefront + admin dashboard on mock data | ✅ Done |
| **2. Data** | Postgres + Prisma, seed, swap the data layer | ✅ Done |
| **3. Commerce** | Auth, cart/checkout, Midtrans, shipping, admin writes, emails, Bahasa UI | ✅ Built (mock fallbacks until service keys are added) |

---

## 1. Goals & scope

Sell PCs, laptops, monitors, keyboards, mouse, headsets and components in Indonesia (IDR; English UI with Bahasa Indonesia planned).

**v1 includes:** catalog with faceted filtering, search, product pages with price-changing variants, cart, guest and signed-in checkout, Midtrans payments, live courier rates, vouchers, flash sales, moderated buyer-only reviews, customer accounts, and an admin for products, payments, users and reviews.

**Out of scope for v1:** PC builder / compatibility checks, B2B tax invoices (NPWP / e-Faktur), in-app returns (support handles them), bilingual product content, multiple warehouses.

---

## 2. Design reference

The storefront follows the supplied screenshot: white surfaces, one teal accent, a dark utility bar, a large light-weight hero headline, a filter sidebar of bordered cards, and product cards with a badge, brand + heart, price and a stock warning. Mobile uses a two-row header, a "Filter" pill that opens a bottom sheet, and a 2-column grid.

| Token | Value | Use |
|---|---|---|
| `--primary` | teal `#14b8c4` | Prices, links, active filters, badges |
| `--topbar` | navy `#0b1220` | Utility bar, footer |
| `--success` / `--warning` / `--destructive` | green / amber / red | Stock and status, always with an icon or label |
| `--chart-1` | `#0e9aa5` light / `#12a3ae` dark | Admin chart series (validated for contrast) |
| Font | Lexend | Hero weight 300, UI 400–600 |

Dark mode is supported (light is the default).

---

## 3. Phase 1: UI (done)

### What was built

| Area | Routes | Notes |
|---|---|---|
| Home | `/` | Compact hero carousel (4 slides, auto-play with pause, arrows, dots) + 2 promo tiles, category tiles, flash sale with countdown, product rails, promos, brands, newsletter |
| Catalog | `/c/[category]`, `/search?q=` | Category hero, URL-driven filters (brand, price histogram + slider, per-category spec facets, color, rating, stock), grid/list, sort, pagination, active-filter chips, mobile filter sheet |
| Product | `/p/[slug]` | Gallery, color/variant picker, quantity, Add to cart / Buy now, delivery and warranty info, Overview / Specifications / Reviews tabs, bundle, related products |
| Shopping | `/cart`, `/wishlist`, `/compare` | zustand stores persisted to localStorage, undo, mock voucher `TOKOTECH10` |
| Checkout | `/checkout` | Address → Shipping → Payment → Review with validation; mock confirmation |
| Auth & account | `/login`, `/register`, `/account/*` | Forms with client validation; overview, orders, order timeline, addresses. Mock user: **Rofi** |
| Admin | `/admin`, `/admin/products`, `/admin/payments`, `/admin/users` | KPI tiles, revenue + category charts (hover, keyboard, table view), product table with add/edit drawer and bulk actions, payments with detail drawer and refund, users with roles and invites. All actions only show a toast |
| System | 404, error, loading skeletons | |

### Changes from plan v1
- **Product images are generated SVG art** (`components/product/product-art.tsx`), not photos. `ProductImage` is the single swap point.
- **No `nuqs` dependency.** Spec facets use dynamic `f_<key>` URL keys, so a small custom hook (`components/catalog/catalog-context.tsx`) manages the URL instead.
- **Listing pages stream their results.** Cache Components (the Next 16 default) requires reading `searchParams` inside `<Suspense>`, so the hero and frame prerender and results stream in.
- **The admin dashboard moved into Phase 1** as design-only screens.
- **The hero is compact:** about 300px tall and contained, instead of full-bleed.

### QA status
- [x] `tsc`, `eslint` and `next build` pass (80+ routes; listing pages partially prerendered)
- [x] Layout checked at desktop and tablet widths with headless screenshots; mobile reflows without horizontal scroll
- [x] Filter, sort, page and view state live in the URL (survive refresh and back)
- [x] Prices go through `lib/format.ts`; components get data only through `lib/data`
- [x] Charts validated for colour contrast; every chart has a table view
- [ ] Cart and checkout not yet verified with items in a real browser (headless Chrome can't preload localStorage)
- [ ] No full keyboard/screen-reader audit or Lighthouse run yet
- [ ] `next/image` pending real photography

---

## 4. Data model (agreed)

The schema is `prisma/schema.prisma` (Prisma 7: 28 models, 11 enums, 16 CHECK constraints), migrated and seeded locally. **Full reference: [DATA-MODEL.md](./DATA-MODEL.md)** (conventions, every model, lifecycles, constraints, seed contents).

| Area | Models |
|---|---|
| Identity | `User` (role CUSTOMER/STAFF/ADMIN, status ACTIVE/INVITED/SUSPENDED), `Address`, Auth.js `Account` / `Session` / `VerificationToken` |
| Catalog | `Category` (tree + facet config), `Brand`, `Product`, `ProductVariant`, `ProductImage`, `Review` |
| Shopping | `Cart` / `CartItem` (user or guest token), `WishlistItem`, `StockAlert` |
| Orders | `Order`, `OrderItem`, `OrderEvent`, `Payment`, `Refund`, `Shipment` |
| Promotions | `Voucher`, `VoucherRedemption`, `FlashSale`, `FlashSaleItem` |
| Operations | `InventoryMovement` (stock ledger), `AuditLog`, `NewsletterSubscriber` |

### Decisions

| Topic | Decision | Effect on the schema |
|---|---|---|
| Variants | Can change the price (e.g. RAM/storage configs) | Price, stock, SKU, weight and size live on `ProductVariant`; `Product.priceFrom` is kept in sync for sorting |
| Payments | Midtrans (Snap) | `Payment.snapToken`, `gatewayRef` (transaction_id, idempotency key), `fraudStatus`; one Payment row per attempt |
| Checkout | Guest checkout allowed | `Order.userId` optional, `Order.guestAccessToken` for the order link, claim by email on registration; `Cart.guestToken` |
| Stock | Reserved until the payment expires | `ProductVariant.reserved`; `Order.expiresAt` copied from `Payment.expiresAt`; expired orders cancel and release stock |
| Shipping | Live rates via an aggregator | Variant weight/size; `Address.district` required + `areaId` + coordinates; `Shipment.provider` / `externalId` / waybill |
| Reviews | Buyer-only, moderated | `Review.orderItemId` required and unique; starts `PENDING`; moderator and note recorded |
| Promotions | Vouchers + flash sales in v1 | Voucher limits per total and per user; flash sale quota; `OrderItem.flashSaleItemId` |
| Returns | Handled through support | Only the `RETURNED` order status and admin refunds; no return tables |
| Content language | English product content, bilingual UI | No translation tables; `User.locale` for the UI |
| Money | Whole Rupiah `Int` (max ≈ Rp 2.1 billion per value) | Revisit as `BigInt` only if B2B is added |

Orders copy everything they display (names, SKUs, prices, address), so catalog edits never change order history.

---

## 5. Phase 2: Data (done)

**Goal:** every page renders from Postgres with the same UI. Function signatures in `lib/data/index.ts` stay the same.

| # | Milestone | Deliverables | Done when |
|---|---|---|---|
| 2.1 ✅ | Infrastructure | `prisma@7` + client, `prisma.config.ts` (`DATABASE_URL`), `docker-compose.yml` with Postgres, `.env.example`, npm scripts (`db:migrate`, `db:seed`, `db:studio`) | `npm run db:migrate` creates the database locally |
| 2.2 ✅ | Migration | Initial migration, plus SQL CHECK constraints (rating 1–5, quantity > 0, `stock ≥ reserved ≥ 0`) and the GIN index on `Product.specs` | Migration applies cleanly from scratch |
| 2.3 ✅ | Align domain types | Replace `lib/types.ts` with generated types + mappers; reshape fixtures (colors → variants with weight/size; badges derived: new, sale, best seller, pre-order) | UI compiles against the new types |
| 2.4 ✅ | Seed | Seed script from the fixtures: categories, brands, products + variants, users (Rofi as admin), orders, payments, vouchers (`TOKOTECH10`), one flash sale | `db:seed` is repeatable (idempotent) |
| 2.5 ✅ | Swap the data layer | Prisma queries in `lib/data`: JSONB facet filters, facet counts via GROUP BY, price histogram (`width_bucket`), sorting and pagination in SQL; admin queries for KPIs and charts | All storefront and admin pages work with no mock imports |
| 2.6 ✅ | Search | `pg_trgm` index on product name + brand for search and suggestions | Typo-tolerant search returns relevant results |
| 2.7 ✅ | Caching | `"use cache"` + `cacheTag` per product/category; tags ready for Phase 3 writes | Product and category pages stay prerendered |

### Done so far (16 Nov 2026)
- **2.1** Prisma 7.10.1 + `@prisma/adapter-pg`, `prisma.config.ts`, `.env.example`, `docker-compose.yml` (optional), `db:*` npm scripts. Locally the database is a dedicated `tokotech` role + database on the native PostgreSQL 18 install.
- **2.2** Init migration generated from the schema, plus hand-written CHECK constraints (stock ≥ reserved ≥ 0, quantities > 0, line and order totals, rating 1–5, voucher and flash-sale limits, cart owner). Applies cleanly with `npm run db:deploy`.
- **2.3** `lib/types.ts` derives every type from the generated client (`Serialized<Model>`), so schema drift fails `tsc`. Fixtures reshaped: colours and configs became variants with weight/size, badges are derived, orders carry snapshots + payments + shipments + events, reviews are tied to delivered order items, vouchers and a flash sale exist. Cart lines are variants (`{ variantId, quantity }`), product pages pick RAM/storage/colour variants, the cart validates vouchers against the fixtures.
- **2.4** `prisma/seed.ts` truncates and loads the same fixtures (repeatable), after validating them against the database rules. `npx tsx prisma/seed.ts --check` validates without a database.

- **2.5** `lib/data/index.ts` queries Postgres through `lib/db.ts` (Prisma + `@prisma/adapter-pg`); function signatures are unchanged, so server pages didn't change. Listing filters, facet counts, price histogram, sort and pagination run in SQL. Admin KPIs and both charts are real `GROUP BY` queries over paid orders. Browser components that hold ids in localStorage read through `GET /api/catalog` (`components/cart/use-catalog.ts`); the header search uses `GET /api/search`; vouchers are validated by the `checkVoucher` server action. The fixtures moved to `prisma/fixtures/` and are used only by the seed.
- **2.6** `pg_trgm` (migration `search_trgm`) with a trigram index on product names; search terms match as substrings or with `word_similarity ≥ 0.45`, so "keychorn" finds Keychron and "sueprlight" finds the Superlight.
- **2.7** Every read is `"use cache"` with `cacheLife` and tags (`catalog`, `product:<slug>`, `reviews:<id>`, `orders:<userId>`, `admin`); all 80+ pages still prerender. Phase 3 writes call `revalidateTag` on these.

Note: `next build` now needs the database running (pages prerender from it). After `npm run db:seed`, restart the server so cached reads refresh.

---

## 6. Phase 3: Commerce

Decisions taken (16 Nov 2026): **Biteship** for shipping, **Midtrans Snap** (sandbox first), **email + password and Google** sign-in (Phone OTP hidden), **Resend** for email, and an **in-app scheduler** for expiring unpaid orders.

Every external service has a fallback, so the full flow works locally with no keys: mock courier rates and waybills, a mock payment page, and emails printed to the server console. Adding a key in `.env` switches that part to the real service.

| # | Milestone | Status | What exists |
|---|---|---|---|
| 3.1 | Auth | ✅ | Auth.js v5 (`auth.ts`): JWT sessions, email + password (bcrypt), Google when `AUTH_GOOGLE_ID/SECRET` are set; suspended users blocked. `proxy.ts` gates `/account/*` (signed in), `/admin/*` (STAFF/ADMIN), `/admin/payments` and `/admin/users` (ADMIN); pages re-check with `lib/auth/session.ts` inside `<Suspense>`. Seeded accounts use the password in `SEED_USER_PASSWORD` (default `tokotech123`). |
| 3.2 | Cart & wishlist in the DB | ✅ | Guest cart by httpOnly `tt_cart` cookie, user cart by account; merged on sign-in (`lib/cart.ts`, `lib/actions/cart.ts`). Old localStorage carts are uploaded once. Wishlist mirrors to `WishlistItem` when signed in; compare stays local. |
| 3.3 | Shipping | ✅ code, 🔑 key needed | `lib/shipping.ts`: Biteship rates (billed weight incl. volumetric), pickup booking, tracking webhook `/api/webhooks/biteship`. Mock rates by zone and weight without `BITESHIP_API_KEY`. Free JNE REG over Rp 1 jt. Not yet: area autocomplete (`areaId`) and coordinates for instant couriers. |
| 3.4 | Checkout & orders | ✅ | `lib/orders/checkout.ts`: one transaction re-prices the cart (flash-sale prices + quota), re-validates the voucher (incl. per-user limit), re-quotes shipping, holds stock with a conditional update, writes order, items, events, shipment, payment and ledger rows. Expired payments are swept every 5 min (`instrumentation.ts`) or via `/api/cron/expire-orders`. |
| 3.5 | Midtrans | ✅ code, 🔑 keys needed | `lib/payments/midtrans.ts`: Snap transaction, webhook `/api/webhooks/midtrans` (SHA-512 signature, amount check, idempotent via `lib/orders/settle.ts`), refunds for cards/e-wallets. Without `MIDTRANS_SERVER_KEY`: `/checkout/pay/[number]` simulates success/failure through the same code path. |
| 3.6 | Admin writes | ✅ | `lib/actions/admin.ts`: product create/edit (first variant's price/stock with ledger `ADJUSTMENT`), bulk status/archive, refunds (restock if not shipped), book pickup & ship, mark delivered, role change, suspend, staff invites (token email → register), review moderation (`/admin/reviews`), vouchers (`/admin/vouchers`), flash sales (`/admin/flash-sales`), categories (`/admin/categories`: name, URL slug, tagline, description, hero text, illustration, menu order; delete when empty). `/c/mice` permanently redirects to `/c/mouse` after the rename. Every write is in `AuditLog`. Not yet: multi-variant and image editing, CSV import, an orders page separate from payments. |
| 3.7 | Guest orders | ✅ | `/orders/[number]?t=<token>` from the emails; orders are claimed when someone registers with the same email. |
| 3.8 | Emails | ✅ code, 🔑 key needed | `lib/email.ts` (Resend): order placed (with pay link), payment received, shipped, staff invite, back-in-stock template. Console output without `RESEND_API_KEY`. Not yet: the back-in-stock trigger and password reset. |
| 3.9 | Language | ✅ | Storefront UI in English (`/...`) and Bahasa Indonesia (`/id/...`). Routes live under `app/[lang]`; `proxy.ts` rewrites clean URLs to `/en` and redirects visible `/en/...` to the clean URL. Both locales prerender. Dictionaries: `lib/i18n/dictionaries/{en,id}.ts`. Product/category content and the admin stay English. Still English: emails, server-side cart/checkout error messages. Not yet: hreflang alternates, picking the language from the browser or `User.locale`. |

**Verified (16 Nov 2026):** browser tests of guest checkout and signed-in checkout with `TOKOTECH10` (mock payment → paid → order page), stock/ledger/voucher effects in the database, sign-in/redirect/role checks over HTTP, and every admin action (ship, deliver, refund, publish review, create voucher, edit product). Not verified: anything needing real keys (Midtrans, Biteship, Google, Resend).

### Keys to add when ready
`.env` holds empty placeholders (`.env.example` documents them): `MIDTRANS_SERVER_KEY`/`MIDTRANS_CLIENT_KEY` (and set the notification URL to `<APP_URL>/api/webhooks/midtrans`; locally that needs a tunnel such as ngrok), `BITESHIP_API_KEY` + `BITESHIP_WEBHOOK_SECRET`, `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` (redirect `<APP_URL>/api/auth/callback/google`), `RESEND_API_KEY` + `EMAIL_FROM`, `CRON_SECRET` for a hosted scheduler, and `APP_URL`.

## 7. Open decisions

2. **Image storage** for admin uploads: e.g. Cloudflare R2, S3, Vercel Blob or UploadThing.
3. **Hosting and managed Postgres** (local dev uses PostgreSQL 18): e.g. Vercel + Neon/Supabase, or a VPS. On serverless hosting, switch the expiry job to `/api/cron/expire-orders`.
4. **Phone OTP provider** if phone sign-in comes back (Twilio, Zenziva, Fonnte…).
5. **Real product photography:** when it arrives, `ProductImage` switches to `next/image`.

### Resolved
URL-based locales (`/id`) ✔ · Biteship ✔ · Midtrans ✔ · Resend ✔ · email + password and Google sign-in ✔ · in-app scheduler ✔ · IDR and Indonesian market ✔ · "TokoTech" name ✔ · placeholder imagery for now ✔ · Compare included in Phase 1 ✔ · PC builder deferred past v1 ✔
