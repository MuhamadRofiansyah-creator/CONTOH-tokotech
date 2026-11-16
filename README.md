# TokoTech

E-commerce storefront for computer products (PCs, laptops, monitors, keyboards, mouse, headsets, components).

Repository layout: the Next.js app lives in `web/` (paths below are relative to it), API documentation in `api/`, and project documents in `dokumentasi/`. `docker-compose.yml` stays in the root.

See [docs/PLAN.md](./docs/PLAN.md) for the full plan and [docs/DATA-MODEL.md](./docs/DATA-MODEL.md) for the data model.

**Status:** storefront (English at `/`, Bahasa Indonesia at `/id`), admin, database, sign-in, cart, checkout, payments, shipping and emails are built. Without service keys in `.env`, payments, shipping and email run in mock mode (see below).

## Run

```bash
cd web
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint
```

The app needs PostgreSQL running (also for `npm run build`, which prerenders from it).

**Test accounts** (password `tokotech123`, set by `SEED_USER_PASSWORD`): `rofi@example.com` (admin), `dewi.l@example.com` (staff), `siti.n@example.com` (customer).

**Mock mode:** with no `MIDTRANS_SERVER_KEY`, checkout sends you to `/checkout/pay/<payment>` where you choose "Pay" or "Fail". With no `BITESHIP_API_KEY`, courier rates and waybills are simulated. With no `RESEND_API_KEY`, emails are printed in the server log. Add the keys to `.env` to switch each one to the real service (see `.env.example`).

### Run it for yourself (local production)

Stop `npm run dev` first (it shares the `.next` folder), then:

```bash
cd web
npm run local        # apply migrations, build, and serve on http://localhost:3000
# later, without rebuilding:
npm run local:start
```

Rebuild (`npm run local`) after pulling or changing code. To open the shop from another device on your Wi-Fi, set `APP_URL` to `http://<your-PC-IP>:3000`.

With `MOCK_EMAIL_LINKS="true"` in `.env`, the password-reset page shows the reset link on screen (handy when email can't reach your inbox). Turn it off before putting the site on the internet.

### Database

```bash
cd web
cp .env.example .env   # set DATABASE_URL (local Postgres, or `docker compose up -d`)
npm run db:deploy      # apply migrations
npm run db:seed        # load the fixtures (repeatable)
npm run db:studio      # browse
```

## Stack

Next.js 16 (App Router, Cache Components) · React 19 · Tailwind CSS 4 · shadcn/ui (Radix, Nova) · zustand · Lexend font.
PostgreSQL 18 + Prisma 7 (`prisma/schema.prisma`, migrations in `prisma/migrations`, seed in `prisma/seed.ts`).

## Where things live

| Path | What |
|---|---|
| `lib/data/` | The **only** data-access functions (`getProducts`, `getProductBySlug`, …): cached Prisma queries |
| `lib/db.ts` | Prisma client (pg adapter) |
| `app/api/` | `GET /api/catalog` (cart/wishlist/compare lookups), `GET /api/search` (suggestions) |
| `lib/actions/` | Server actions (`checkVoucher`) |
| `lib/types.ts` | Domain types derived from the generated Prisma client |
| `lib/product.ts` | Variant helpers (default variant, option groups, colours, availability) |
| `prisma/` | Schema, migrations, seed + its fixtures (`prisma/fixtures/`) |
| `lib/filters.ts` | URL ⇄ filter parsing (`?brand=asus&f_refresh=240Hz&min=…&sort=…`) |
| `stores/` | Cart / wishlist / compare (zustand, persisted to localStorage) |
| `components/catalog/` | Listing page: filter panel, toolbar, active chips, pagination |
| `components/product/` | Product card, hero (gallery + purchase), generated SVG product art |
| `components/layout/` | Top bar, header, search with suggestions, mega-menu, footer |
| `app/(shop)` | Storefront routes · `app/(checkout)` checkout · `app/(auth)` sign-in/register |

## Routes

`/` · `/c/[category]` · `/search?q=` · `/p/[slug]` · `/cart` · `/wishlist` · `/compare` · `/checkout` ·
`/login` · `/register` · `/account` · `/account/orders` · `/account/orders/[id]` · `/account/addresses` · `/orders/[number]?t=` (guest)

Every storefront route also exists in Bahasa Indonesia under `/id` (e.g. `/id/c/mouse`). Pages live in `app/[lang]`; translations in `lib/i18n/dictionaries/`.

**Admin (reads live data; writes are previews; no auth guard yet):** `/admin` (dashboard) · `/admin/products` · `/admin/payments` · `/admin/users`.
Data from `getAdminOverview` / `getAdminProducts` / `getPayments` / `getAdminUsers` in `lib/data`; components in `components/admin/`.

## Notes

- Product images are generated SVG art (`components/product/product-art.tsx`). Replace `ProductImage` with `next/image` once real photos exist.
- Prices are integers in IDR, formatted only through `lib/format.ts`.
- Voucher codes: `TOKOTECH10`, `GRATISONGKIR` (`HEMAT100K` is expired).
