import { createApi } from './api.mjs';
import { postgresStore } from './store.mjs';

let handler;

export async function hostedApi(request) {
  const { SUPABASE_URL: url, APP_ORIGIN: origin, RESTAURANT_SLUG: defaultSlug } = process.env;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key || !anonKey) {
    return Response.json({ error: 'The restaurant database has not been configured.' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' }
    });
  }
  handler ??= createApi({ store: postgresStore({ url, key }), defaultSlug, supabaseUrl: url, anonKey, origin });
  return handler(request);
}
