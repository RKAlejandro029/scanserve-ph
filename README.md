# ScanServe PH

A restaurant ordering website for Vercel and Supabase. The public home displays the restaurant's current menu. Guests scan their table QR to place and track orders. Staff record cash after collecting it, and the kitchen sees the order after full payment.

| Page | Purpose |
| --- | --- |
| `/` | Public menu with prices and availability |
| `/r/<restaurant>/<table-code>` | Table ordering, bill splitting, and order tracking |
| `/login` | Supabase email/password sign-in |
| `/staff/<restaurant>/service` | Unpaid orders, cash collection, assistance, and serving |
| `/kitchen` | Paid order queue and preparation status |
| `/admin/sales` | Admin-only sales metrics, refunds, and 30-day CSV export |

## Deploy

Follow [DEPLOYMENT.md](DEPLOYMENT.md) to apply the Supabase migration, provision a restaurant and administrator, and configure Vercel. Create menus, tables, and staff accounts in the admin portal after deployment. The hosted app uses your own restaurant data and only accepts in-person cash orders.

## Verify

Use Node.js 24. Run `node --test` for the dependency-free workflow tests. Run `npm install`, then `npm run typecheck`, `npm run lint`, and `npm run build` for Next.js verification.

The automated tests use SQLite and a stubbed Supabase Auth response to exercise hosted-mode business logic. Complete the live checks in [DEPLOYMENT.md](DEPLOYMENT.md) against your Supabase project and deployed HTTPS origin.

The separate `npm run demo` command runs the original local SQLite sandbox. It does not participate in the Vercel runtime or seed the hosted database.
