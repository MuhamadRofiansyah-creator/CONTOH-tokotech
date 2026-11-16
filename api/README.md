# API documentation

This folder documents TokoTech's HTTP API. It contains **documentation only**. There is no separate backend: every endpoint is a Next.js route handler inside the monolith at `web/app/api/`, and it runs as part of the web app.

## Structure

| Folder | Contents |
|---|---|
| `endpoints/` | One document per endpoint: method, path, parameters, auth, response shape and error codes |
| `integrations/` | External services the API talks to or is called by (Midtrans, Biteship, Auth.js providers, schedulers) |
| `examples/` | Ready-to-run requests and sample responses (curl, HTTP files, JSON payloads) |

## Current endpoints (source in `web/app/api/`)

| Endpoint | Source |
|---|---|
| `/api/auth/[...nextauth]` | `web/app/api/auth/[...nextauth]/route.ts` |
| `GET /api/catalog` | `web/app/api/catalog/route.ts` |
| `GET /api/search` | `web/app/api/search/route.ts` |
| `GET /api/cron/expire-orders` | `web/app/api/cron/expire-orders/route.ts` |
| `/api/webhooks/midtrans` | `web/app/api/webhooks/midtrans/route.ts` |
| `/api/webhooks/biteship` | `web/app/api/webhooks/biteship/route.ts` |

Most data changes go through server actions (`web/lib/actions/`), not REST endpoints, so they aren't listed here.
