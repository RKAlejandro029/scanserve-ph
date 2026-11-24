import { demoRestaurant } from './seed.mjs';

export function postgresStore({ url, key }) {
  async function rpc(name, params) {
    const response = await fetch(url + '/rest/v1/rpc/' + name, {
      method: 'POST', cache: 'no-store',
      headers: { apikey: key, ...(!key.startsWith('sb_secret_') ? { Authorization: 'Bearer ' + key } : {}), 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!response.ok) throw new Error('Supabase operation failed (' + response.status + ')');
    return response.json();
  }
  return {
    get: slug => rpc('scanserve_read', { p_slug: slug }),
    save: (slug, version, state) => rpc('scanserve_write', { p_slug: slug, p_version: version, p_state: state })
  };
}

export async function seedDemo(store) {
  const demo = demoRestaurant();
  if (!await store.get(demo.slug)) await store.save(demo.slug, -1, demo);
}
