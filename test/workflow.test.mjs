import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApi } from '../server/api.mjs';
import { demoPassword } from '../server/auth.mjs';
import { demoRestaurant } from '../server/seed.mjs';
import { sqliteStore } from '../server/sqlite.mjs';
import { seedDemo } from '../server/store.mjs';
import { qrMatrix } from '../server/qr.mjs';

const base = 'http://localhost:3000';
const slug = 'mesa-demo', table = 'demo-table-12';
const lines = [{ id: 'sisig', quantity: 2, options: ['egg'], notes: 'Chili on the side', price: 1 }];
const total = 59000;

async function setup(t) {
  const store = sqliteStore(':memory:');
  await seedDemo(store);
  const api = createApi({ store, demoEnabled: true, demoSecret: 'test-secret', origin: base });
  t.after(() => store.close());
  function actor() {
    let cookie = '';
    return async (action, params = {}, method = 'GET', expected = 200, origin = base) => {
      const input = { slug, table, ...params };
      const request = new Request(base + '/api/' + action + (method === 'GET' ? '?' + new URLSearchParams(input) : ''), {
        method, headers: { cookie, ...(method === 'POST' ? { Origin: origin, 'Content-Type': 'application/json' } : {}) },
        body: method === 'POST' ? JSON.stringify(input) : undefined
      });
      const res = await api(request);
      const payload = await res.json();
      assert.equal(res.status, expected, JSON.stringify(payload));
      const identity = res.headers.get('set-cookie')?.split(';')[0];
      if (identity) cookie = [cookie, identity].filter(Boolean).join('; ');
      return payload;
    };
  }
  return { store, actor };
}

test('guest checkout, duplicate submission, kitchen and service transitions, tracking and analytics', async t => {
  const { actor } = await setup(t);
  const guest = actor(), kitchen = actor(), service = actor(), admin = actor();
  await guest('staff', {}, 'GET', 401);
  await guest('menu', { table: 'wrong' }, 'GET', 404);
  assert.equal((await guest('menu')).table, '12');
  assert.equal((await guest('quote', { lines }, 'POST')).total, total);
  const key = randomUUID();
  const request = { lines, method: 'cash', key, expectedTotal: total };
  await guest('order', { ...request, expectedTotal: 1 }, 'POST', 409);
  const [order, duplicate] = await Promise.all([guest('order', request, 'POST'), guest('order', request, 'POST')]);
  assert.equal(order.id, duplicate.id);
  assert.equal(order.total, total);
  await guest('assistance', {}, 'POST', 403, 'https://another.example');
  await guest('assistance', {}, 'POST');
  await kitchen('login', { email: 'kitchen@scanserve.demo', password: demoPassword }, 'POST');
  await service('login', { email: 'service@scanserve.demo', password: demoPassword }, 'POST');
  await admin('login', { email: 'admin@scanserve.demo', password: demoPassword }, 'POST');
  assert.equal((await kitchen('staff')).orders.some(row => row.id === order.id), false);
  await kitchen('staff/status', { id: order.id, status: 'confirmed' }, 'POST', 409);
  await guest('pay', { id: order.id, outcome: 'approve' }, 'POST', 403);
  await service('staff/payment', { id: order.id }, 'POST');
  await service('staff/status', { id: order.id, status: 'confirmed' }, 'POST', 403);
  for (const status of ['confirmed', 'preparing', 'ready']) {
    await kitchen('staff/status', { id: order.id, status }, 'POST');
    assert.equal((await guest('menu')).orders[0].status, status);
  }
  const staff = await service('staff');
  assert.equal(staff.assistance.length, 1);
  await service('staff/assist', { id: staff.assistance[0].id }, 'POST');
  assert.equal((await guest('menu')).assistance, false);
  await service('staff/status', { id: order.id, status: 'served' }, 'POST');
  await service('staff/status', { id: order.id, status: 'completed' }, 'POST');
  assert.equal((await guest('menu')).orders[0].payment.status, 'paid');
  assert.equal((await admin('staff')).analytics.daily, total);
  await service('staff/refund', { id: order.id, reason: 'Test refund' }, 'POST', 403);
  await admin('staff/refund', { id: order.id, reason: 'Test refund' }, 'POST');
  assert.equal((await guest('menu')).orders[0].payment.status, 'refunded');
  assert.equal((await admin('staff')).analytics.daily, 0);
});

test('split amounts reconcile and another guest or tenant cannot control the order', async t => {
  const { store, actor } = await setup(t);
  const guest = actor(), other = actor(), staff = actor();
  await guest('menu');
  const order = await guest('order', { lines, method: 'simulated', key: randomUUID(), expectedTotal: total }, 'POST');
  await other('menu');
  assert.equal((await other('menu')).orders.length, 0);
  await other('pay', { id: order.id, outcome: 'approve' }, 'POST', 404);
  await guest('pay', { id: order.id, outcome: 'fail' }, 'POST');
  await guest('split', { id: order.id, mode: 'equal', diners: ['A', 'B'] }, 'POST', 400);
  const second = await guest('order', { lines, method: 'simulated', key: randomUUID(), expectedTotal: total }, 'POST');
  const split = await guest('split', { id: second.id, mode: 'equal', diners: ['A', 'B', 'C'] }, 'POST');
  assert.equal(split.splits.reduce((sum, row) => sum + row.amount, 0), total);
  const pay = share => guest('pay', { id: second.id, outcome: 'approve', split: share.id }, 'POST');
  const updated = await pay(split.splits[0]);
  assert.equal(updated.payment.status, 'pending');
  await pay(split.splits[0]);
  await pay(split.splits[1]);
  assert.equal((await pay(split.splits[2])).payment.status, 'paid');
  const itemLines = [...lines, { id: 'rice', quantity: 1, options: [] }];
  const itemOrder = await guest('order', { lines: itemLines, method: 'simulated', key: randomUUID(), expectedTotal: total + 5500 }, 'POST');
  const itemSplit = await guest('split', { id: itemOrder.id, mode: 'items', diners: ['A', 'B'], assignments: [0, 1] }, 'POST');
  assert.deepEqual(itemSplit.splits.map(row => [row.amount, row.items]), [[total, [0]], [5500, [1]]]);
  const otherTenant = { ...demoRestaurant(), slug: 'other-tenant', demo: false, orders: [] };
  store.save(otherTenant.slug, -1, otherTenant);
  await staff('login', { email: 'admin@scanserve.demo', password: demoPassword }, 'POST');
  await staff('staff', { slug: otherTenant.slug }, 'GET', 401);
  assert.equal((await guest('menu', { slug: otherTenant.slug })).orders.length, 0);
});

test('administrator changes table and item availability; kitchen cannot edit menu', async t => {
  const { actor } = await setup(t);
  const guest = actor(), admin = actor(), kitchen = actor();
  await guest('menu');
  await admin('login', { email: 'admin@scanserve.demo', password: demoPassword }, 'POST');
  await kitchen('login', { email: 'kitchen@scanserve.demo', password: demoPassword }, 'POST');
  await kitchen('staff/menu-item', { id: 'sisig', toggle: true }, 'POST', 403);
  await admin('staff/menu-item', { id: 'sisig', toggle: true }, 'POST');
  assert.equal((await guest('menu')).menu.find(row => row.id === 'sisig').available, false);
  await guest('quote', { lines }, 'POST', 400);
  await admin('staff/table', { name: '12', branch: 'qc', active: true }, 'POST', 400);
  await admin('staff/table', { name: '13', branch: 'qc', active: true }, 'POST');
  const newTable = (await admin('staff')).tables.find(row => row.name === '13');
  assert.equal((await guest('menu', { table: newTable.code })).table, '13');
  await admin('staff/reset', {}, 'POST');
  assert.equal((await guest('menu')).menu.find(row => row.id === 'sisig').available, true);
});

test('SQLite persists across reopen and checks compare-and-swap versions', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'scanserve-test-'));
  const path = join(folder, 'demo.sqlite');
  try {
    const first = sqliteStore(path);
    await seedDemo(first);
    const { state } = first.get(slug);
    state.name = 'Persisted';
    assert.equal(first.save(slug, 0, state), true);
    assert.equal(first.save(slug, 0, state), false);
    first.close();
    const reopened = sqliteStore(path);
    assert.equal(reopened.get(slug).state.name, 'Persisted');
    reopened.close();
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('QR matrix creates complete binary modules and rejects oversized URLs', () => {
  const matrix = qrMatrix(base + '/restaurant/mesa-demo/table/demo-table-12');
  assert.equal(matrix.length, 41);
  assert.ok(matrix.every(row => row.length === 41 && row.every(bit => bit === 0 || bit === 1)));
  assert.deepEqual(matrix[0].slice(0, 8), [1, 1, 1, 1, 1, 1, 1, 0]);
  assert.throws(() => qrMatrix('x'.repeat(135)), RangeError);
});
