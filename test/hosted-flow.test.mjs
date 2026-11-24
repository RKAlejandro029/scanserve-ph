import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createApi } from '../server/api.mjs';
import { analytics } from '../server/orders.mjs';
import { demoRestaurant } from '../server/seed.mjs';
import { sqliteStore } from '../server/sqlite.mjs';

test('restaurant catalog, cash collection, paid-only kitchen, and admin sales in hosted mode', async t => {
  const origin = 'https://restaurant.example';
  const store = sqliteStore(':memory:');
  t.after(() => store.close());
  const state = { ...demoRestaurant(), demo: false, slug: 'restaurant', orders: [], employees: [
    { id: 'kitchen-a', role: 'kitchen' }, { id: 'service-a', role: 'service' }, { id: 'admin-a', role: 'admin' }
  ] };
  store.save(state.slug, -1, state);
  const api = createApi({
    store, origin, defaultSlug: state.slug, supabaseUrl: 'https://database.example', anonKey: 'publishable-for-test',
    fetcher: async (url, options) => {
      assert.equal(url, 'https://database.example/auth/v1/user');
      assert.equal(options.headers.apikey, 'publishable-for-test');
      return Response.json({ id: options.headers.Authorization.slice('Bearer '.length) });
    }
  });
  function actor(user) {
    let cookie = user ? 'scanserve_auth=' + user : '';
    return async (action, { input = {}, post = false, status = 200 } = {}) => {
      const request = new Request(origin + '/api/' + action + (post ? '' : '?' + new URLSearchParams(input)), {
        method: post ? 'POST' : 'GET',
        headers: { Cookie: cookie, ...(post ? { Origin: origin, 'Content-Type': 'application/json' } : {}) },
        body: post ? JSON.stringify(input) : undefined
      });
      const response = await api(request);
      const data = await response.json();
      assert.equal(response.status, status, JSON.stringify(data));
      const value = response.headers.get('Set-Cookie');
      if (value) {
        assert.match(value, /HttpOnly; SameSite=Lax; Max-Age=\d+; Secure/);
        cookie = value.split(';')[0];
      }
      return data;
    };
  }
  const guest = actor(), kitchen = actor('kitchen-a'), service = actor('service-a'), admin = actor('admin-a');
  const catalog = await guest('catalog');
  assert.equal(catalog.name, state.name);
  assert.ok(catalog.dishes.some(item => item.id === 'rice'));
  for (const field of ['tables', 'orders', 'employees']) assert.equal(Object.hasOwn(catalog, field), false);
  const table = 'demo-table-12';
  await guest('menu', { input: { table } });
  const input = { table, method: 'cash', key: randomUUID(), expectedTotal: 5500, lines: [{ id: 'rice', quantity: 1 }] };
  await guest('order', { input: { ...input, method: 'simulated' }, post: true, status: 400 });
  const order = await guest('order', { input, post: true });
  assert.deepEqual((await kitchen('staff')).orders, []);
  assert.equal((await service('staff')).orders[0].payment.status, 'pending');
  assert.equal((await admin('staff')).analytics.monthly, 0);
  await admin('staff/status', { input: { id: order.id, status: 'confirmed' }, post: true, status: 409 });
  const split = await guest('split', { input: { table, id: order.id, mode: 'equal', diners: ['A', 'B'] }, post: true });
  const pay = share => service('staff/payment', { input: { id: order.id, split: share.id }, post: true });
  await pay(split.splits[0]);
  await pay(split.splits[0]);
  assert.equal((await admin('staff')).analytics.monthly, 2750);
  assert.deepEqual((await kitchen('staff')).orders, []);
  await pay(split.splits[1]);
  const queue = await kitchen('staff');
  assert.deepEqual(queue.orders.map(row => row.id), [order.id]);
  assert.equal(queue.orders[0].payment.status, 'paid');
  assert.equal(Object.hasOwn(queue, 'analytics'), false);
  await kitchen('staff/status', { input: { id: order.id, status: 'confirmed' }, post: true });
  const stats = (await admin('staff')).analytics;
  assert.equal(stats.collected, 5500);
  assert.equal(stats.daily, 5500);
  assert.equal(stats.paidOrders, 1);
  assert.equal(stats.activity.length, 2);
});

test('sales reports use Philippine collection and refund dates', () => {
  const order = {
    total: 1200, number: 1, branch: 'main', createdAt: '2026-11-23T15:58:00Z', items: [], splits: [],
    payment: { status: 'refunded', method: 'cash', paidAt: '2026-11-23T15:59:00Z', refundedAt: '2026-11-23T16:00:00Z' }
  };
  const stats = analytics([order], Date.parse('2026-11-24T01:00:00Z'));
  assert.equal(stats.daily, -1200);
  assert.equal(stats.monthly, 0);
  assert.equal(stats.collected, 1200);
  assert.equal(stats.refunded, 1200);
  assert.deepEqual(stats.activity.map(row => [row.type, row.date]), [['payment', '2026-11-23'], ['refund', '2026-11-24']]);
});

test('password recovery binds the code to the requesting browser before updating the password', async t => {
  const store = sqliteStore(':memory:');
  t.after(() => store.close());
  store.save('restaurant', -1, { ...demoRestaurant(), demo: false, slug: 'restaurant', employees: [{ id: 'staff-id', role: 'admin' }] });
  const calls = [];
  const origin = 'https://restaurant.example';
  const api = createApi({
    store, origin, defaultSlug: 'restaurant', supabaseUrl: 'https://database.example', anonKey: 'publishable-for-test',
    fetcher: async (url, options) => {
      const path = url.split('/auth/v1/')[1];
      calls.push({ path, ...options, body: options.body ? JSON.parse(options.body) : undefined });
      if (path === 'token?grant_type=pkce') return Response.json({ access_token: 'recovery-token', expires_in: 3600 });
      if (path === 'user') return Response.json({ id: 'staff-id' });
      return Response.json({});
    }
  });
  const post = (path, body, cookie = '') => api(new Request(origin + '/api/' + path, {
    method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }));
  const sent = await post('recover', { email: 'Staff@restaurant.example' });
  assert.equal(sent.status, 200);
  const setCookie = sent.headers.get('set-cookie');
  assert.match(setCookie, /Path=\/api\/reset-password; HttpOnly; SameSite=Lax; Max-Age=3600; Secure/);
  assert.equal(calls[0].path, 'recover');
  assert.equal(calls[0].body.email, 'staff@restaurant.example');
  assert.equal(calls[0].body.code_challenge_method, 's256');
  const cookie = setCookie.split(';')[0];
  const input = { code: '53fff199-5555-4111-8555-111111111111', password: 'new-example-password' };
  assert.equal((await post('reset-password', input)).status, 400);
  assert.equal(calls.length, 1);
  const saved = await post('reset-password', input, cookie);
  assert.equal(saved.status, 200);
  const cookies = saved.headers.getSetCookie();
  const session = cookies.find(line => line.startsWith('scanserve_auth='));
  assert.match(session, /scanserve_auth=recovery-token; Path=\/; HttpOnly; SameSite=Lax; Max-Age=3600; Secure/);
  assert.match(cookies.find(line => line.startsWith('scanserve_recovery=')), /Max-Age=0/);
  assert.equal(calls[1].path, 'token?grant_type=pkce');
  assert.equal(calls[1].body.auth_code, input.code);
  assert.equal(calls[1].body.code_verifier, cookie.split('=')[1]);
  assert.notEqual(calls[1].body.code_verifier, calls[0].body.code_challenge);
  assert.deepEqual([calls[2].path, calls[2].method, calls[2].headers.Authorization, calls[2].body.password],
    ['user', 'PUT', 'Bearer recovery-token', input.password]);
  assert.deepEqual(await saved.json(), { ok: true, next: '/staff/restaurant' });
  const staff = await api(new Request(origin + '/api/staff', { headers: { Cookie: session.split(';')[0] } }));
  assert.equal(staff.status, 200);
  assert.equal((await staff.json()).role, 'admin');
});
