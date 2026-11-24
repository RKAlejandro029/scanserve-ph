import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createAuth } from './auth.mjs';
import { manage } from './manage.mjs';
import { demoRestaurant } from './seed.mjs';
import { analytics, clean, InputError, makeQuote, payOrder, placeOrder, recommendations, refundOrder, requireThat, splitOrder, updateStatus } from './orders.mjs';

const guestCookie = 'scanserve_guest';
const staffCookie = 'scanserve_auth';
const recoveryCookie = 'scanserve_recovery';
function json(value, status = 200, ...cookies) {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  for (const cookie of cookies) if (cookie) headers.append('Set-Cookie', cookie);
  return Response.json(value, { status, headers });
}
const hash = token => createHash('sha256').update(token).digest('hex');
const orderView = order => {
  const view = { ...order };
  delete view.key;
  delete view.session;
  return view;
};
const terminal = ['completed', 'rejected', 'cancelled'];

function cookieValue(request, name) {
  return request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1);
}

function setCookie(url, name, value, seconds, path = '/') {
  return name + '=' + value + '; Path=' + path + '; HttpOnly; SameSite=Lax; Max-Age=' + seconds + (url.protocol === 'https:' ? '; Secure' : '');
}

async function readJSON(request) {
  requireThat(request.headers.get('content-type')?.split(';')[0] === 'application/json', 'Send a JSON request.', 415);
  requireThat(request.body, 'Missing request body.');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 240000) {
        await reader.cancel();
        throw new InputError('Request too large.', 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new InputError('Invalid JSON request.'); }
  requireThat(body && typeof body === 'object' && !Array.isArray(body), 'Invalid request.');
  return body;
}

function limit(state, key, limit, duration = 60000) {
  const now = Date.now();
  state.rates = state.rates.filter(row => row.until > now);
  const row = state.rates.find(r => r.key === key);
  requireThat(!row || row.count < limit, 'Too many requests. Try again shortly.', 429);
  if (row) row.count++;
  else state.rates.push({ key, until: now + duration, count: 1 });
}

export function createApi({ store, origin, defaultSlug, demoEnabled = false, supabaseUrl, anonKey, demoSecret, fetcher = fetch }) {
  const auth = createAuth({ supabaseUrl, anonKey, demoSecret, fetcher });

  async function load(slug) {
    const data = await store.get(slug);
    requireThat(data && (!data.state.demo || demoEnabled), 'Restaurant not found.', 404);
    return data;
  }

  async function mutate(slug, callback) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const { state, version } = await load(slug);
      const result = await callback(state);
      if (await store.save(slug, version, state)) return result;
    }
    throw new InputError('The restaurant is busy. Please retry.', 409);
  }

  return async function handle(request) {
    try {
      const url = new URL(request.url);
      const action = url.pathname.slice('/api/'.length);
      const post = request.method === 'POST';
      requireThat(post || request.method === 'GET', 'Method not allowed.', 405);
      if (post) {
        const source = request.headers.get('origin');
        requireThat(!source || source === (origin || url.origin), 'Request origin is invalid.', 403);
        requireThat(request.headers.get('sec-fetch-site') !== 'cross-site', 'Request origin is invalid.', 403);
      }
      const input = post ? await readJSON(request) : Object.fromEntries(url.searchParams);
      const slug = input.slug || defaultSlug || (demoEnabled ? 'mesa-demo' : '');
      requireThat(typeof slug === 'string' && /^[a-z0-9-]{1,64}$/.test(slug), 'Restaurant not found.', 404);
      if (action === 'logout' && post) return json({ ok: true }, 200, setCookie(url, staffCookie, '', 0));

      const { state } = await load(slug);
      if (action === 'catalog' && !post) {
        const dishes = state.menu.filter(item => !item.archived).map(({ id, category, name, price, description, image, available, dietary, allergens }) =>
          ({ id, category, name, price, description, image, available, dietary, allergens }));
        return json({ name: state.name, description: state.description, categories: state.categories, dishes });
      }
      if (action === 'login' && post) {
        const ip = request.headers.get('x-vercel-forwarded-for') || 'local';
        await mutate(slug, current => limit(current, 'login:' + hash(ip), 12));
        const login = await auth.login(input, state.demo);
        return json({ ok: true }, 200, setCookie(url, staffCookie, login.token, login.maxAge));
      }
      if (action === 'register' && post) {
        const ip = request.headers.get('x-vercel-forwarded-for') || 'local';
        await mutate(slug, current => limit(current, 'register:' + hash(ip), 6));
        await auth.register(input);
        return json({ ok: true });
      }

      if (action === 'recover' && post) {
        requireThat(!state.demo, 'Password recovery is unavailable for the demo.', 404);
        const ip = request.headers.get('x-vercel-forwarded-for') || 'local';
        await mutate(slug, current => limit(current, 'recover:' + hash(ip), 4));
        const verifier = randomBytes(32).toString('base64url');
        await auth.requestRecovery(input, verifier);
        return json({ ok: true }, 200, setCookie(url, recoveryCookie, verifier, 3600, '/api/reset-password'));
      }
      if (action === 'reset-password' && post) {
        requireThat(!state.demo, 'Password recovery is unavailable for the demo.', 404);
        const session = await auth.resetPassword(input, cookieValue(request, recoveryCookie));
        const employee = state.employees.find(row => row.id === session.id && row.role !== 'revoked');
        return json({ ok: true, next: employee ? '/staff/' + slug : '/' }, 200,
          setCookie(url, staffCookie, session.token, session.maxAge),
          setCookie(url, recoveryCookie, '', 0, '/api/reset-password'));
      }

      const authToken = cookieValue(request, staffCookie);
      const user = await auth.user(authToken, state.demo);
      const roleFor = current => user?.role || current.employees.find(row => row.id === user?.id && row.role !== 'revoked')?.role;
      if (action === 'staff' && !post) {
        const role = roleFor(state);
        requireThat(role, 'Sign in with a restaurant staff account.', 401);
        const kitchen = role === 'kitchen';
        const orders = state.orders.filter(order => !kitchen || order.payment.status === 'paid');
        const base = {
          role, name: state.name, demo: state.demo, branches: state.branches, tables: kitchen ? [] : state.tables,
          targetMinutes: state.targetMinutes, orders: orders.map(order => ({ ...orderView(order), session: order.session })),
          sessions: kitchen ? [] : state.sessions.filter(session => !session.closed).map(({ id, table, createdAt }) => ({ id, table, createdAt })),
          assistance: kitchen ? [] : state.assistance.filter(entry => !entry.resolved)
        };
        return json(role === 'admin' ? { ...base, menu: state.menu.filter(item => !item.archived),
          categories: state.categories, employees: state.employees, promotions: state.promotions,
          settings: { name: state.name, description: state.description, taxBps: state.taxBps, serviceBps: state.serviceBps,
            targetMinutes: state.targetMinutes }, analytics: analytics(state.orders) } : base);
      }
      if (post && action.startsWith('staff/')) {
        const result = await mutate(slug, current => {
          const role = roleFor(current);
          requireThat(role, 'Sign in with a restaurant staff account.', 401);
          const task = action.slice(6);
          if (task === 'reset') {
            requireThat(role === 'admin' && current.demo && demoEnabled, 'Reset is available only for the demo administrator.', 403);
            Object.assign(current, demoRestaurant());
            return { ok: true };
          }
          if (task === 'status' || task === 'payment' || task === 'refund') {
            const order = current.orders.find(row => row.id === input.id);
            requireThat(order, 'Order not found.', 404);
            if (task === 'status') {
              const advancesFulfillment = ['confirmed', 'preparing', 'ready', 'served'].includes(input.status);
              if (role === 'kitchen' || advancesFulfillment) {
                requireThat(order.payment.status === 'paid', 'Record full payment before sending this order to the kitchen.', 409);
              }
              updateStatus(order, role, input.status, input.reason);
            }
            else if (task === 'refund') refundOrder(order, role, input.reason);
            else payOrder(order, role, input, current.demo);
          } else if (task === 'assist' || task === 'close') {
            requireThat(role === 'admin' || role === 'service', 'This action requires service staff or an administrator.', 403);
            if (task === 'assist') {
              const entry = current.assistance.find(row => row.id === input.id);
              requireThat(entry, 'Request not found.', 404);
              entry.resolved = true;
            } else {
              const session = current.sessions.find(row => row.id === input.id);
              requireThat(session, 'Session not found.', 404);
              requireThat(!current.orders.some(order => order.session === session.id && !terminal.includes(order.status)), 'Complete outstanding orders before closing the session.');
              session.closed = new Date().toISOString();
              current.assistance.filter(row => row.session === session.id).forEach(row => { row.resolved = true; });
            }
          } else {
            requireThat(role === 'admin', 'This action requires an administrator.', 403);
            manage(current, task, input);
          }
          current.audit.push({ action: task, actor: user.id, subject: clean(input.id || input.code), at: new Date().toISOString() });
          return { ok: true };
        });
        return json(result);
      }

      const findTable = current => {
        const table = current.tables.find(row => row.code === input.table && row.active);
        requireThat(table, 'This table is unavailable. Ask a staff member for the current QR code.', 404);
        return table;
      };
      const oldToken = cookieValue(request, guestCookie);
      const validToken = oldToken && /^[A-Za-z0-9_-]{43}$/.test(oldToken);
      const token = validToken ? oldToken : randomBytes(32).toString('base64url');
      const guestHash = hash(token);
      const ownSessions = current => current.sessions.filter(s => s.user ? s.user === user?.id : s.guest === guestHash);
      if (action === 'menu' && !post) {
        const table = findTable(state);
        const sessions = ownSessions(state);
        const orders = state.orders.filter(row => sessions.some(s => s.id === row.session)).map(orderView).reverse();
        const session = sessions.find(s => s.table === table.code && !s.closed);
        const menu = state.menu.filter(item => !item.archived);
        return json({ name: state.name, description: state.description, demo: state.demo,
          branch: state.branches.find(row => row.id === table.branch)?.name, table: table.name,
          categories: state.categories, menu, orders, session: session?.id,
          assistance: state.assistance.some(row => row.session === session?.id && !row.resolved),
          recommendations: recommendations(state, clean(input.cart, 300).split(',').filter(Boolean), orders),
          hasAccount: !!(user && !user.role) }, 200, !validToken ? setCookie(url, guestCookie, token, 2592000) : undefined);
      }

      requireThat(post && ['session', 'quote', 'order', 'split', 'pay', 'assistance'].includes(action), 'Action not found.', 404);
      requireThat(validToken, 'Open the table menu before placing an order.', 403);
      if (action === 'quote') { findTable(state); return json(makeQuote(state, input.lines)); }
      return json(await mutate(slug, current => {
        const table = findTable(current);
        const sessions = ownSessions(current);
        let session = sessions.find(row => row.table === table.code && !row.closed);
        if (action === 'split' || action === 'pay') {
          const order = current.orders.find(row => row.id === input.id && row.table === table.code && sessions.some(s => s.id === row.session));
          requireThat(order, 'Order not found.', 404);
          const ownerSession = sessions.find(s => s.id === order.session);
          requireThat(!ownerSession.closed, 'This dining session has closed.');
          if (action === 'split') splitOrder(order, input);
          else payOrder(order, 'guest', input, current.demo);
          return orderView(order);
        }
        if (!session) {
          limit(current, 'session:' + table.code, 50);
          session = { id: randomUUID(), table: table.code, guest: guestHash, user: user && !user.role ? user.id : null, createdAt: new Date().toISOString(), closed: null };
          current.sessions.push(session);
        } else if (user && !user.role && !session.user) session.user = user.id;
        if (action === 'session') return { ok: true };
        limit(current, 'guest:' + session.id, 20);
        if (action === 'order') {
          requireThat(input.method === 'cash' || current.demo, 'Pay a staff member in person.');
          return orderView(placeOrder(current, { table, session, method: input.method, key: input.key, lines: input.lines, expectedTotal: input.expectedTotal }));
        }
        if (!current.assistance.some(row => row.session === session.id && !row.resolved)) {
          current.assistance.push({ id: randomUUID(), table: table.code, tableName: table.name, branch: table.branch, session: session.id,
            createdAt: new Date().toISOString(), resolved: false });
        }
        return { ok: true };
      }));
    } catch (error) {
      if (error instanceof InputError) return json({ error: error.message }, error.status);
      console.error(error);
      return json({ error: 'ScanServe could not complete the request. Try again shortly.' }, 500);
    }
  };
}
