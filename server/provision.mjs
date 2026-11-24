import { randomBytes } from 'node:crypto';
import { postgresStore } from './store.mjs';
import { demoRestaurant } from './seed.mjs';

const [slug, name, admin] = process.argv.slice(2);
const { SUPABASE_URL: url } = process.env;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || !/^[a-z0-9-]{1,64}$/.test(slug || '') || slug === 'mesa-demo' || !name?.trim() || name.length > 100
    || !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(admin || '')) {
  console.error('Usage: node --env-file=.env.local server/provision.mjs restaurant-slug "Restaurant Name" supabase-admin-uuid');
  process.exit(1);
}
const response = await fetch(url + '/auth/v1/admin/users/' + admin, {
  headers: { apikey: key, ...(!key.startsWith('sb_secret_') ? { Authorization: 'Bearer ' + key } : {}) }
});
if (!response.ok || (await response.json()).id !== admin.toLowerCase()) {
  console.error('Create the administrator in Supabase Auth first and check their user ID.');
  process.exit(1);
}
const table = randomBytes(9).toString('base64url');
const state = { ...demoRestaurant(), slug, name: name.trim(), demo: false, description: '',
  branches: [{ id: 'main', name: 'Main branch' }], tables: [{ code: table, name: '01', branch: 'main', active: true }],
  categories: [], menu: [], orders: [], nextNumber: 1, employees: [{ id: admin.toLowerCase(), name: 'Administrator', role: 'admin' }] };
const saved = await postgresStore({ url, key }).save(slug, -1, state);
if (!saved) {
  console.error('A restaurant with this slug already exists.');
  process.exit(1);
}
console.log('Restaurant created. Staff path /staff/' + slug + ' · Guest path /restaurant/' + slug + '/table/' + table);
