# Deploy ScanServe PH on Vercel and Supabase

## 1. Prepare your Supabase project

1. Create a Supabase project. In **SQL Editor**, run `supabase/migrations/202611240001_scanserve.sql` once. If that migration is already applied, keep the existing database.
2. In **Authentication → Users**, create a confirmed email/password user for the restaurant administrator. Copy that user's UUID.
3. Copy `.env.example` to `.env.local`. Set `SUPABASE_URL` to the project URL, `SUPABASE_PUBLISHABLE_KEY` to its publishable key, and `SUPABASE_SECRET_KEY` to its server secret key. Set `RESTAURANT_SLUG` to the intended restaurant slug, such as `my-restaurant`.
4. Create the restaurant. Replace the slug, name, and UUID in this command with your values. The slug must match `RESTAURANT_SLUG`.

```powershell
node --env-file=.env.local server/provision.mjs my-restaurant "My Restaurant" YOUR-ADMIN-UUID
```

The command needs Node.js 24 and connectivity to your Supabase project. It creates an empty menu, one branch, one table with a unique QR URL, and a single administrator. Skip it if you already provisioned that restaurant. The secret key stays on the server or your local provisioning machine.

[Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)

## 2. Deploy the Next.js app to Vercel

1. Add the source to a private GitHub repository. Keep `.env.local` out of Git. Run `npm install` and commit the resulting lockfile. The Next.js production checks are `npm run typecheck`, `npm run lint`, and `npm run build`.
2. In Vercel, import the repository as a Next.js project. Select Node.js 24. Add `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and `RESTAURANT_SLUG` to the **Production** environment. Give preview deployments a separate Supabase project if you enable them.
3. Deploy and open the production HTTPS URL. Optionally set `APP_ORIGIN` to the final canonical origin, for example `https://restaurant.example` without a trailing slash. Redeploy after editing the variables. Set the same URL in **Supabase → Authentication → URL Configuration → Site URL**.
4. Use the resulting Vercel production domain or a custom domain when generating table QR codes in the admin portal.

[Vercel Git deployments](https://vercel.com/docs/git) · [Vercel environments](https://vercel.com/docs/deployments/environments)

## 3. Configure the restaurant and check one order

1. Open `/login` and sign in as the admin. In **Menu**, add a category and an available dish. In **Tables**, open the first table's QR code, then download or print it.
2. Create confirmed email/password accounts for your kitchen and service staff in Supabase Auth. In **People**, assign each user's UUID to the corresponding role.
3. Scan the QR on a phone. Verify the table and place an order. In the service screen, open **Awaiting cash payment** and record the amount after receiving it.
4. Open `/kitchen` as kitchen staff. Check that the order appears once after full payment. Accept it, mark it preparing, and mark it ready. Service staff can mark the order served and completed.
5. Open `/admin/sales` as the administrator. Confirm net sales, exports, and refunds against recorded payments. For split cash payments, the sales report includes the amount received for each share when recorded. The kitchen receives the order after every share is paid.

## Runtime and operational details

- The hosted app uses Supabase Postgres for restaurant data and Supabase Auth for accounts. The migration enables row-level security and restricts database RPCs to the server role. Keep the Supabase secret key out of browser code.
- The first release records in-person cash payments and staff-confirmed refunds. Digital payments require a separately configured payment provider.
- Use a hosting plan that permits commercial restaurant use if the site will serve paying customers. Use an isolated project for development and test data.
- Export backups separately from the app repository. Before going live, test restoring the database and confirm staff sign-in, phone scanning, and ordering on the production domain.

[Vercel Hobby plan](https://vercel.com/docs/plans/hobby)
