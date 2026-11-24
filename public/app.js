import { staffPage } from './staff.js';

export const root = document.querySelector('#scanserve');
export const currency = value => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value / 100);
export const esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const labels = { received: 'Order received', confirmed: 'Confirmed', preparing: 'Preparing', ready: 'Ready to serve', served: 'Served', completed: 'Completed', cancelled: 'Cancelled', rejected: 'Rejected', paid: 'Paid', failed: 'Failed', pending: 'Pending', refunded: 'Refunded' };
export const badge = status => '<span class="status ' + esc(status) + '">' + esc(labels[status] || status) + '</span>';
export const time = date => new Date(date).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
const demoPath = '/restaurant/mesa-demo/table/demo-table-12';
const photos = {
  adobo: 'https://commons.wikimedia.org/wiki/Special:FilePath/Filipino%20Chicken%20Adobo.JPG?width=640',
  sisig: 'https://commons.wikimedia.org/wiki/Special:FilePath/Pork%20sisig%20and%20halo-halo.jpg?width=640'
};
const localDemo = root.dataset.localDemo === 'true';
const restaurant = root.dataset.restaurant || (localDemo ? 'mesa-demo' : '');
let context = { slug: restaurant };

export async function api(action, input = {}, method = 'GET') {
  const params = { ...context, ...input };
  const path = '/api/' + action;
  const response = await fetch(method === 'GET' ? path + '?' + new URLSearchParams(params) : path,
    method === 'GET' ? { cache: 'no-store' } : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'Request failed.'), { status: response.status });
  return data;
}

export const brand = '<a class="brand" href="/"><img src="/logo.svg" width="34" height="34" alt="">ScanServe<span>PH</span></a>';
export function shell(body, right = '') {
  root.innerHTML = '<header class="top"><div class="top-inner">' + brand + '<nav aria-label="Main navigation">' + right + '</nav></div></header>' + body
    + '<footer><span>ScanServe PH</span><span>Built for Filipino restaurants.</span></footer><div class="toast" role="status" aria-live="polite"></div>';
}
let toastTimer;
export function notify(message, error = false) {
  const toast = document.querySelector('.toast');
  toast.textContent = message;
  toast.className = 'toast shown' + (error ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 5200);
}
export const qrURL = url => '/qr?url=' + encodeURIComponent(url);
const demoCredentials = [
  ['Administrator', 'admin'], ['Kitchen', 'kitchen'], ['Service', 'service']
];

async function restaurantHome() {
  if (!restaurant) {
    shell('<main class="wrap empty"><h1>ScanServe PH</h1><p>Set RESTAURANT_SLUG to the restaurant you provisioned.</p><a class="button" href="/login">Staff sign in</a></main>');
    return;
  }
  const catalog = await api('catalog');
  document.title = catalog.name + ' | ScanServe PH';
  const sections = catalog.categories.map(category => {
    const dishes = catalog.dishes.filter(dish => dish.category === category.id);
    if (!dishes.length) return '';
    return '<section class="landing-section"><h2>' + esc(category.name) + '</h2><div class="dish-grid">' + dishes.map(dish =>
      '<article class="dish"><div class="dish-photo">' + (dish.image ? '<img src="' + esc(dish.image) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '')
      + '</div><div class="dish-details"><span class="dish-price">' + currency(dish.price) + '</span><h3>' + esc(dish.name) + '</h3><p>' + esc(dish.description) + '</p>'
      + (dish.dietary ? '<small>' + esc(dish.dietary) + '</small>' : '') + (dish.allergens ? '<small>Allergens: ' + esc(dish.allergens) + '</small>' : '')
      + (dish.available ? '' : '<small>Sold out</small>') + '</div></article>').join('') + '</div></section>';
  }).filter(Boolean);
  shell('<main class="wrap guest"><section class="menu-head"><div><p class="overline">DINE-IN MENU</p><h1>' + esc(catalog.name) + '</h1><p>' + esc(catalog.description)
    + '</p><p>Scan the QR code at your table to order.</p></div></section>'
    + (sections.length ? sections.join('') : '<p class="empty">The menu is being prepared.</p>') + '</main>', '<a href="/login">Staff sign in</a>');
}

function landing() {
  const qr = qrURL(location.origin + '/r/mesa-demo/demo-table-12');
  shell('<main><section class="hero"><div class="hero-inner"><div class="hero-copy"><p class="overline">QR DINING FOR FILIPINO RESTAURANTS</p><h1>Scan. Order.<br>Pay. Enjoy.</h1><p class="lede">Guests order from their table. The kitchen sees tickets as they come in. The whole team knows what’s ready to serve.</p><div class="actions"><a class="button" href="' + demoPath + '">Request a Demo <span aria-hidden="true">↗</span></a><a class="button light" href="/login">Staff sign in</a></div></div>'
    + '<div class="hero-object"><div class="qr-stand">' + brand + '<p>Scan to order</p><img src="' + qr + '" width="155" height="155" alt="QR code for the demo table"><small>MESA AT BAYAN · TABLE 12</small></div><div class="hero-ticket"><span class="overline">KITCHEN TICKET</span><strong>Table 12</strong><span>1 × Sizzling Pork Sisig</span>' + badge('preparing') + '</div></div></div></section>'
    + '<section class="wrap landing-section" id="features"><p class="overline">THE GUEST JOURNEY</p><h2>From table to kitchen in a scan.</h2><ol class="journey">' + ['Scan the table QR', 'Browse the menu', 'Customize and add', 'Choose how to pay', 'Kitchen prepares', 'Track and enjoy'].map(s => '<li>' + s + '</li>').join('') + '</ol><div class="feature-grid"><article><h3>For guests</h3><p>Browse Filipino favorites, customize each dish, split the bill, and track your order from your phone.</p></article><article><h3>For restaurants</h3><p>Manage menus and table QR codes. Send orders straight to the kitchen and tell service staff when food is ready.</p></article><article><h3>Smart suggestions</h3><p>Recommend dishes using popular orders, menu pairings, and restaurant promotions. The demo uses rules and simulated MannyPay.</p></article></div></section>'
    + '<section class="wrap ending"><div><h2>Ready to try it at your table?</h2><p>Start an order at our demo restaurant.</p></div><a class="button" href="' + demoPath + '">Open demo menu</a></section></main>',
    '<a href="/#features">Features</a><a href="/login">Staff sign in</a>');
}

function authPage(register, staffAccess = false) {
  const slug = new URLSearchParams(location.search).get('restaurant') || restaurant;
  context = { slug };
  const nextParam = new URLSearchParams(location.search).get('next');
  const guestNext = nextParam && /^\/restaurant\/[a-z0-9-]+\/table\/[a-zA-Z0-9_-]+$/.test(nextParam);
  const staffNext = nextParam && /^\/staff\/[a-z0-9-]+(?:\/[a-z-]+)?$/.test(nextParam);
  const next = guestNext || staffNext ? nextParam : '';
  const query = '?restaurant=' + encodeURIComponent(slug) + (next ? '&next=' + encodeURIComponent(next) : '');
  shell('<main class="wrap auth"><section><p class="overline">SCANSERVE PH</p><h1>' + (register ? 'Create an account' : guestNext ? 'Guest sign in' : 'Staff sign in') + '</h1>'
    + '<form id="auth"><label>Restaurant slug<input name="slug" value="' + esc(slug) + '" required pattern="[a-z0-9-]+" maxlength="64"></label><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="' + (register ? 'new-password' : 'current-password') + '" required ' + (register ? 'minlength="10"' : '') + '></label>'
    + '<button class="button">' + (register ? 'Create account' : 'Sign in') + '</button><p class="feedback" role="status"></p></form>'
    + (register ? '<p><a class="inline-link" href="/login' + query + '">Already have an account? Sign in</a></p>' : '')
    + (!register && guestNext ? '<p><a class="inline-link" href="/register' + query + '">Create a guest account</a></p>' : '')
    + (!register && !localDemo ? '<p><a class="inline-link" href="/forgot-password' + query + '">Forgot your password?</a></p>' : '') + '</section>'
    + (localDemo && !register && !next && slug === 'mesa-demo' ? '<aside class="demo-login"><h2>Try a demo role</h2><p>Choose a role to fill in the demo credentials, then sign in.</p><div class="actions">'
      + demoCredentials.map(([label, id]) => '<button class="button light" data-demo="' + id + '">' + label + '</button>').join('') + '</div><a class="inline-link" href="' + demoPath + '">Open the guest menu</a></aside>' : '') + '</main>', '<a href="/">Home</a>');
  const form = document.querySelector('#auth');
  if (staffAccess) document.querySelector('.feedback').textContent = 'Sign in with an account assigned to this restaurant.';
  document.querySelectorAll('[data-demo]').forEach(button => button.addEventListener('click', () => {
    form.elements.email.value = button.dataset.demo + '@scanserve.demo';
    form.elements.password.value = 'ScanServeDemo24!';
  }));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    const feedback = form.querySelector('.feedback');
    button.disabled = true;
    feedback.textContent = 'Please wait…';
    try {
      const input = Object.fromEntries(new FormData(form));
      await api(register ? 'register' : 'login', input, 'POST');
      if (register) feedback.textContent = 'Check your email for a confirmation link, then sign in.';
      else location.assign(next || '/staff/' + input.slug);
    } catch (error) { feedback.textContent = error.message; }
    finally { button.disabled = false; }
  });
}

function recoveryPage(code = '') {
  const slug = new URLSearchParams(location.search).get('restaurant') || restaurant;
  context = { slug };
  const query = '?restaurant=' + encodeURIComponent(slug);
  const label = code ? 'Set a new password' : 'Reset your password';
  shell('<main class="wrap auth"><section><h1>' + label + '</h1>'
    + (code ? '' : '<p>Open the email link in this same browser.</p>')
    + '<form id="recovery"><label>' + (code
      ? 'New password<input type="password" name="password" autocomplete="new-password" required minlength="10" maxlength="128">'
      : 'Email<input name="email" type="email" autocomplete="username" required>') + '</label>'
    + '<button class="button">' + (code ? 'Save password' : 'Send reset link') + '</button><p class="feedback" role="status"></p></form>'
    + '<p><a class="inline-link" href="' + (code ? '/forgot-password' : '/login') + query + '">'
    + (code ? 'Request a new link' : 'Back to sign in') + '</a></p></section></main>');
  const form = document.querySelector('#recovery');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    const feedback = form.querySelector('.feedback');
    const input = Object.fromEntries(new FormData(form));
    button.disabled = true;
    feedback.textContent = 'Please wait.';
    try {
      await api(code ? 'reset-password' : 'recover', code ? { ...input, code } : input, 'POST');
      if (code) location.replace('/login' + query);
      else feedback.textContent = 'If the account exists, check your inbox for a password reset link.';
    } catch (error) { feedback.textContent = error.message; }
    finally { button.disabled = false; }
  });
}

function readCart(key) {
  try { const data = JSON.parse(sessionStorage.getItem(key) || '[]'); return Array.isArray(data) ? data : []; }
  catch { return []; }
}
function remember(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* Cart remains usable for this visit. */ }
}
const amount = (item, line) => (item.price + item.options.filter(o => line.options.includes(o.id)).reduce((sum, option) => sum + option.price, 0)) * line.quantity;
const totals = data => '<dl class="totals"><div><dt>Subtotal</dt><dd>' + currency(data.subtotal) + '</dd></div>'
  + (data.tax ? '<div><dt>Tax</dt><dd>' + currency(data.tax) + '</dd></div>' : '')
  + (data.service ? '<div><dt>Service charge</dt><dd>' + currency(data.service) + '</dd></div>' : '')
  + '<div class="total"><dt>Total</dt><dd>' + currency(data.total) + '</dd></div></dl>';

async function guestPage(slug, code) {
  context = { slug, table: code };
  let data = await api('menu');
  if (data.hasAccount) await api('session', {}, 'POST');
  const cartKey = 'cart:' + slug + ':' + code;
  let cart = readCart(cartKey);
  let category = '';
  let search = '';
  let active = 'menu';
  let checkoutKey = null;
  let checkoutSignature = '';
  let checkoutTotal = 0;
  let checkoutBusy = false;
  const accountURL = '/login?restaurant=' + encodeURIComponent(slug) + '&next=' + encodeURIComponent('/restaurant/' + slug + '/table/' + code);
  shell('<main class="wrap guest"><section class="menu-head"><div><p class="overline">' + esc(data.branch) + ' · TABLE ' + esc(data.table) + (data.demo ? ' · DEMO MENU' : '') + '</p><h1>' + esc(data.name) + '</h1><p>' + esc(data.description) + '</p></div><button class="button light" data-guest="assistance">Request assistance</button></section>'
    + '<nav class="tabs" aria-label="Guest views"><button type="button" data-view="menu">Menu</button><button type="button" data-view="orders">Your orders</button></nav><section id="guest-content"></section><dialog id="guest-dialog"></dialog></main>',
    (data.hasAccount ? '<button class="text-button" data-guest="logout">Sign out</button>' : data.demo ? '' : '<a href="' + accountURL + '">Guest sign in</a>') + '<a href="/login">Staff</a>');
  const content = document.querySelector('#guest-content');
  const dialog = document.querySelector('#guest-dialog');
  const itemById = id => data.menu.find(item => item.id === id);
  const cartTotal = () => cart.reduce((sum, line) => { const item = itemById(line.id); return sum + (item ? amount(item, line) : 0); }, 0);
  function syncCart() { remember(cartKey, cart); }
  function refreshMenu() {
    const list = document.querySelector('#menu-list');
    if (!list) return;
    const found = data.menu.filter(item => (!category || item.category === category)
      && (item.name + ' ' + item.description + ' ' + item.dietary).toLowerCase().includes(search.toLowerCase()));
    list.innerHTML = found.length ? found.map(item => {
      const photo = item.image || photos[item.id];
      return '<article class="dish"><div class="dish-photo">' + (photo ? '<img src="' + esc(photo) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '') + '</div><div class="dish-details"><span class="dish-price">' + currency(item.price) + '</span><h3>' + esc(item.name) + '</h3><p>' + esc(item.description) + '</p>'
        + (item.dietary ? '<small>' + esc(item.dietary) + '</small>' : '') + '<button class="button light" data-item="' + esc(item.id) + '"' + (item.available ? '' : ' disabled') + '>' + (item.available ? 'Customize &amp; add' : 'Sold out') + '</button></div></article>';
    }).join('') : '<p class="empty">No dishes match your search.</p>';
    list.querySelectorAll('img').forEach(img => img.addEventListener('error', () => img.remove(), { once: true }));
    document.querySelectorAll('[data-category]').forEach(button => button.classList.toggle('active', button.dataset.category === category));
    const reco = document.querySelector('#recommendations');
    reco.innerHTML = data.recommendations.length ? '<h2>AI Recommends For You</h2><p>Based on menu pairings, popularity, and promotions.</p><div class="actions">'
      + data.recommendations.map(item => '<button class="button light" data-item="' + esc(item.id) + '">' + esc(item.name) + '</button>').join('') + '</div>' : '';
  }
  function showMenu() {
    content.innerHTML = '<div class="menu-tools"><div class="chips">' + [{ id: '', name: 'All dishes' }, ...data.categories].map(row => '<button data-category="' + esc(row.id) + '">' + esc(row.name) + '</button>').join('') + '</div>'
      + '<label class="search"><span class="sr-only">Search dishes</span><input id="search" type="search" placeholder="Search dishes" value="' + esc(search) + '"></label></div><div id="menu-list" class="dish-grid"></div><section id="recommendations" class="recommendations"></section><div class="cart-bar"></div>';
    document.querySelector('#search').addEventListener('input', event => { search = event.target.value; refreshMenu(); });
    refreshMenu();
    refreshCart();
  }
  function refreshCart() {
    const bar = document.querySelector('.cart-bar');
    if (bar) bar.innerHTML = '<button class="button" data-guest="cart"' + (cart.length ? '' : ' disabled') + '>View cart <span>' + cart.reduce((sum, line) => sum + line.quantity, 0) + ' items · ' + currency(cartTotal()) + '</span></button>';
  }
  function selectView(view) {
    active = view;
    document.querySelectorAll('[data-view]').forEach(tab => tab.setAttribute('aria-current', tab.dataset.view === view ? 'page' : 'false'));
    if (view === 'menu') showMenu(); else showOrders();
  }
  function modal(title, inner) {
    dialog.innerHTML = '<div class="modal-head"><h2>' + esc(title) + '</h2><button class="button light close" type="button" data-guest="close" aria-label="Close dialog">×</button></div>' + inner;
    if (!dialog.open) dialog.showModal();
  }
  function customize(item) {
    if (!item?.available) return;
    modal(item.name, '<p>' + esc(item.description) + '</p>' + (item.allergens ? '<p class="muted">Allergens · ' + esc(item.allergens) + '</p>' : '')
      + '<form id="customize" data-id="' + esc(item.id) + '">' + (item.options.length ? '<fieldset><legend>Add-ons</legend>' + item.options.map(option => '<label class="check"><input type="checkbox" name="option" value="' + esc(option.id) + '">' + esc(option.name) + ' · ' + currency(option.price) + '</label>').join('') + '</fieldset>' : '')
      + '<label>Quantity<input type="number" name="quantity" min="1" max="20" value="1" required></label><label>Kitchen notes<textarea name="notes" maxlength="250" rows="2"></textarea></label><button class="button">Add to cart · ' + currency(item.price) + '</button></form>');
    dialog.querySelector('form').addEventListener('input', event => {
      const current = new FormData(event.currentTarget);
      const price = amount(item, { quantity: Number(current.get('quantity')), options: current.getAll('option') });
      event.currentTarget.querySelector('button').textContent = 'Add to cart · ' + currency(price);
    });
  }
  function showCart() {
    modal('Your cart', cart.length ? '<div class="cart-lines">' + cart.map((line, index) => {
      const item = itemById(line.id);
      return '<div class="cart-line"><div><strong>' + esc(item?.name || 'Unavailable item') + '</strong><small>' + esc(item?.options.filter(option => line.options.includes(option.id)).map(option => option.name).join(', ')) + (line.notes ? ' · ' + esc(line.notes) : '') + '</small><button class="text-button" data-remove="' + index + '">Remove</button></div><label>Qty<input type="number" min="1" max="20" value="' + line.quantity + '" data-qty="' + index + '" aria-label="Quantity for ' + esc(item?.name || 'item') + '"></label><strong>' + currency(item ? amount(item, line) : 0) + '</strong></div>';
    }).join('') + '</div><div class="line-total"><strong>Subtotal</strong><strong>' + currency(cartTotal()) + '</strong></div><button class="button" data-guest="checkout">Review order</button>'
      : '<p class="empty">Your cart is empty. Add something from the menu.</p>');
  }
  async function checkout() {
    const signature = JSON.stringify(cart);
    const quote = await api('quote', { lines: cart }, 'POST');
    if (signature !== checkoutSignature) { checkoutKey = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join(''); checkoutSignature = signature; }
    checkoutTotal = quote.total;
    modal('Review your order', '<p>' + esc(data.name) + ' · Table ' + esc(data.table) + '</p>' + linesHTML(quote) + totals(quote)
      + '<form id="checkout"><fieldset><legend>Payment method</legend><label class="check"><input type="radio" name="method" value="cash" checked>Cash · Pay a staff member</label>'
      + (data.demo ? '<label class="check"><input type="radio" name="method" value="simulated">MannyPay simulation · Demo only</label>' : '')
      + '</fieldset>' + (data.demo ? '' : '<p class="muted">Pay a staff member after placing your order. The kitchen will receive it when payment is recorded.</p>')
      + '<div class="actions"><button class="button">Place order</button><button type="button" class="button light" data-guest="cart">Edit cart</button></div><p class="feedback" role="status"></p></form>');
  }
  function linesHTML(order) {
    return '<ul class="order-lines">' + order.items.map(item => '<li><div><strong>' + item.quantity + ' × ' + esc(item.name) + '</strong>'
      + (item.options.length || item.notes ? '<small>' + esc([...item.options.map(row => row.name), item.notes].filter(Boolean).join(' · ')) + '</small>' : '') + '</div><span>' + currency(item.amount) + '</span></li>').join('') + '</ul>';
  }
  function showOrders() {
    content.innerHTML = data.orders.length ? '<div class="tracking">' + data.orders.map(order => {
      const paid = ['paid', 'refunded'].includes(order.payment.status);
      const terminal = ['rejected', 'cancelled', 'completed'].includes(order.status);
      const splitRemaining = order.splits.filter(row => !row.paid);
      return '<article class="order-card"><div class="order-head"><div><p class="overline">TABLE ' + esc(order.tableName) + '</p><h2>Order #' + order.number + '</h2></div>' + badge(order.status) + '</div>'
        + '<ol class="timeline">' + order.history.map(row => '<li>' + esc(labels[row.status]) + ' <time>' + time(row.at) + '</time>' + (row.reason ? '<small>' + esc(row.reason) + '</small>' : '') + '</li>').join('') + '</ol>'
        + linesHTML(order) + totals(order) + '<p class="payment">Payment · ' + (order.payment.method === 'cash' ? 'Cash' : 'MannyPay simulation') + ' ' + badge(order.payment.status) + '</p>'
        + (order.splits.length ? '<ul class="split-list">' + order.splits.map(row => '<li><span>' + esc(row.name) + '</span><strong>' + currency(row.amount) + '</strong>' + badge(row.paid ? 'paid' : 'pending') + '</li>').join('') + '</ul><p>Remaining · ' + currency(splitRemaining.reduce((sum, row) => sum + row.amount, 0)) + '</p>' : '')
        + '<div class="actions"><button class="button light" data-reorder="' + order.id + '">Reorder</button>'
        + (!terminal && !paid && order.payment.status === 'pending' && !order.splits.some(row => row.paid) ? '<button class="button light" data-split="' + order.id + '">Split bill</button>' : '')
        + (!terminal && !paid && order.payment.method === 'simulated' ? (!order.splits.length ? '<button class="button" data-pay="' + order.id + '">Open payment simulator</button>'
          : splitRemaining.map(row => '<button class="button light" data-pay="' + order.id + '" data-share="' + row.id + '">Simulate for ' + esc(row.name) + '</button>').join('')) : '') + '</div></article>';
    }).join('') + '</div>' : '<p class="empty">No orders yet. Browse the menu to start an order.</p>';
  }
  function splitDialog(order) {
    modal('Split order #' + order.number, '<form id="split" data-id="' + order.id + '"><label>Diner names (one per line)<textarea name="diners" required rows="3">Diner 1\nDiner 2</textarea></label><label>Split method<select name="mode"><option value="equal">Equal amounts</option><option value="items">Assign items</option></select></label><section id="assignments"></section><button class="button">Save bill split</button><p class="feedback" role="status"></p></form>');
    const form = dialog.querySelector('#split');
    const names = () => form.elements.diners.value.split('\n').map(name => name.trim()).filter(Boolean);
    function assignments() {
      const section = form.querySelector('#assignments');
      section.innerHTML = form.elements.mode.value === 'items' ? order.items.map(item => '<label>' + item.quantity + ' × ' + esc(item.name)
        + '<select name="assignment" required><option value="">Choose a diner</option>' + names().map((name, index) => '<option value="' + index + '">' + esc(name) + '</option>').join('') + '</select></label>').join('') : '';
    }
    form.elements.mode.addEventListener('change', assignments);
    form.elements.diners.addEventListener('input', assignments);
  }
  let refreshing = false;
  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      const next = await api('menu', { cart: cart.map(row => row.id).join(',') });
      const changed = active === 'orders' && JSON.stringify(next.orders) !== JSON.stringify(data.orders);
      const menuChanged = JSON.stringify(next.menu) !== JSON.stringify(data.menu) || JSON.stringify(next.recommendations) !== JSON.stringify(data.recommendations);
      data = next;
      if (changed) showOrders();
      if (menuChanged && document.activeElement?.id !== 'search') refreshMenu();
    } finally { refreshing = false; }
  }
  function upsertOrder(order) {
    data.orders = [order, ...data.orders.filter(row => row.id !== order.id)].sort((a, b) => b.number - a.number);
    selectView('orders');
  }

  root.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    const d = button.dataset;
    try {
      if (d.view) selectView(d.view);
      if (d.category !== undefined) { category = d.category; refreshMenu(); }
      if (d.item) customize(itemById(d.item));
      if (d.remove !== undefined) { cart.splice(Number(d.remove), 1); syncCart(); showCart(); refreshCart(); }
      if (d.guest === 'close') dialog.close();
      if (d.guest === 'cart') showCart();
      if (d.guest === 'checkout') {
        button.disabled = true;
        try { await checkout(); } finally { button.disabled = false; }
      }
      if (d.guest === 'assistance') {
        button.disabled = true;
        try { await api('assistance', {}, 'POST'); notify('Staff have been notified.'); }
        finally { button.disabled = false; }
      }
      if (d.guest === 'logout') { await api('logout', {}, 'POST'); location.reload(); }
      if (d.reorder) {
        const order = data.orders.find(row => row.id === d.reorder);
        const available = order.items.filter(row => itemById(row.id)?.available);
        if (!available.length) return notify('The dishes from this order are unavailable.', true);
        const newLines = available.slice(0, 30 - cart.length).map(row => ({ id: row.id, quantity: row.quantity,
          options: row.options.filter(o => itemById(row.id).options.some(current => current.id === o.id)).map(o => o.id), notes: row.notes }));
        if (!newLines.length) return notify('Your cart is full.', true);
        cart.push(...newLines);
        syncCart(); selectView('menu'); showCart();
        if (newLines.length !== order.items.length) notify('Only available items that fit in the cart were added.');
      }
      if (d.split) splitDialog(data.orders.find(row => row.id === d.split));
      if (d.pay) {
        modal('MannyPay payment simulator', '<p>This is a demo. Choose the response the simulated provider should return. No money moves.</p>'
          + '<form id="pay" data-id="' + d.pay + '" data-share="' + esc(d.share) + '"><div class="actions"><button class="button" name="outcome" value="approve">Simulate approval</button>'
          + (d.share ? '' : '<button class="button light" name="outcome" value="fail">Simulate failure</button>') + '</div><p class="feedback" role="status"></p></form>');
      }
    } catch (error) { notify(error.message, true); }
  });
  dialog.addEventListener('change', event => {
    if (event.target.dataset.qty === undefined) return;
    if (!event.target.checkValidity()) return event.target.reportValidity();
    cart[Number(event.target.dataset.qty)].quantity = Number(event.target.value);
    syncCart(); showCart(); refreshCart();
  });
  dialog.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.target;
    const values = new FormData(form, event.submitter);
    if (form.id === 'customize') {
      if (cart.length >= 30) return notify('Your cart is full.', true);
      cart.push({ id: form.dataset.id, quantity: Number(values.get('quantity')), options: values.getAll('option'), notes: values.get('notes') });
      syncCart(); dialog.close(); refreshCart(); notify('Added to cart.'); return;
    }
    if (checkoutBusy) return;
    checkoutBusy = true;
    const buttons = form.querySelectorAll('button');
    buttons.forEach(button => { button.disabled = true; });
    const feedback = form.querySelector('.feedback');
    feedback.textContent = 'Saving…';
    try {
      let order;
      if (form.id === 'checkout') {
        order = await api('order', { method: values.get('method'), key: checkoutKey, lines: cart, expectedTotal: checkoutTotal }, 'POST');
        cart = []; syncCart(); checkoutSignature = '';
      } else if (form.id === 'split') {
        order = await api('split', { id: form.dataset.id, mode: values.get('mode'), diners: values.get('diners').split('\n').map(s => s.trim()).filter(Boolean),
          assignments: values.getAll('assignment').map(value => value === '' ? -1 : Number(value)) }, 'POST');
      } else {
        order = await api('pay', { id: form.dataset.id, split: form.dataset.share, outcome: values.get('outcome') }, 'POST');
      }
      dialog.close(); upsertOrder(order);
      notify(form.id === 'checkout' ? (order.payment.method === 'cash' ? 'Order placed. Pay a staff member to send it to the kitchen.' : 'Order placed. Complete the simulated payment to send it to the kitchen.') : 'Order updated.');
    } catch (error) { feedback.textContent = error.message; }
    finally { checkoutBusy = false; buttons.forEach(button => { button.disabled = false; }); }
  });
  document.addEventListener('cancel', event => { if (checkoutBusy) event.preventDefault(); }, true);
  selectView('menu');
  setInterval(() => { if (!document.hidden) refresh().catch(() => {}); }, 3500);
}

async function start() {
  const path = location.pathname.replace(/\/$/, '') || '/';
  const table = path.match(/^\/restaurant\/([a-z0-9-]+)\/table\/([a-zA-Z0-9_-]+)$/) || path.match(/^\/r\/([a-z0-9-]+)\/([a-zA-Z0-9_-]+)$/);
  const requestedStaff = path === '/kitchen' && restaurant ? '/staff/' + restaurant + '/kitchen'
    : path === '/admin/sales' && restaurant ? '/staff/' + restaurant + '/analytics' : path;
  const staff = requestedStaff.match(/^\/staff\/([a-z0-9-]+)(?:\/([a-z-]+))?$/);
  try {
    const code = new URLSearchParams(location.search).get('code');
    if (!localDemo && (path === '/' || path === '/reset-password') && code) {
      history.replaceState(null, '', '/reset-password');
      recoveryPage(code);
    } else if (!localDemo && (path === '/forgot-password' || path === '/reset-password')) recoveryPage();
    else if (table) await guestPage(table[1], table[2]);
    else if (staff) {
      context = { slug: staff[1] };
      await staffPage(staff[1], staff[2]);
    } else if (path === '/login' || path === '/register') authPage(path === '/register');
    else if (path === '/' || path === '/about' || path === '/features') {
      if (localDemo) landing(); else await restaurantHome();
    }
    else shell('<main class="wrap empty"><h1>Page unavailable</h1><a href="/">Return home</a></main>');
  } catch (error) {
    if (staff && error.status === 401) {
      history.replaceState(null, '', '/login?restaurant=' + encodeURIComponent(staff[1]) + '&next=' + encodeURIComponent(requestedStaff));
      authPage(false, true);
    } else shell('<main class="wrap empty"><h1>ScanServe is unavailable</h1><p>' + esc(error.message) + '</p><a class="button" href="/">Return home</a></main>');
  }
}
queueMicrotask(start);
