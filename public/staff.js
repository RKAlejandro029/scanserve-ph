import { api, badge, currency, esc, labels, notify, qrURL, root, shell, time } from './app.js';

const sections = {
  admin: ['Overview', 'Orders', 'Kitchen', 'Service', 'Menu', 'Tables', 'People', 'Payments', 'Analytics', 'Promotions', 'Settings'],
  kitchen: ['Kitchen', 'Orders'], service: ['Service', 'Tables', 'Orders']
};
const orderSteps = {
  received: [['confirmed', 'Accept order', 'admin kitchen'], ['rejected', 'Reject order', 'admin kitchen'], ['cancelled', 'Cancel order', 'admin']],
  confirmed: [['preparing', 'Start preparing', 'admin kitchen'], ['cancelled', 'Cancel order', 'admin']],
  preparing: [['ready', 'Mark ready', 'admin kitchen']],
  ready: [['served', 'Mark served', 'admin service']],
  served: [['completed', 'Complete order', 'admin service']]
};
const field = (name, title, value = '', attrs = '') => '<label>' + title + '<input name="' + name + '" value="' + esc(value) + '" ' + attrs + '></label>';
const area = (name, title, value = '') => '<label>' + title + '<textarea name="' + name + '" rows="3">' + esc(value) + '</textarea></label>';
const check = (name, title, enabled) => '<label class="check"><input type="checkbox" name="' + name + '"' + (enabled ? ' checked' : '') + '>' + title + '</label>';
const select = (name, title, options, chosen) => '<label>' + title + '<select name="' + name + '" required>' + options.map(([value, label]) =>
  '<option value="' + esc(value) + '"' + (value === chosen ? ' selected' : '') + '>' + esc(label) + '</option>').join('') + '</select></label>';
const empty = copy => '<p class="empty">' + copy + '</p>';
const edit = (type, id, title = 'Edit') => '<button class="button light small" data-edit="' + type + '" data-id="' + esc(id) + '">' + title + '</button>';
const command = (task, id, title, extra = '') => '<button class="button light small" data-task="' + task + '" data-id="' + esc(id) + '" ' + extra + '>' + title + '</button>';

function table(head, rows, fallback) {
  return rows.length ? '<div class="table-scroll"><table role="table"><thead role="rowgroup"><tr role="row">' + head.map(label => '<th scope="col" role="columnheader">' + esc(label) + '</th>').join('') + '</tr></thead><tbody role="rowgroup">'
    + rows.map(cells => '<tr role="row">' + cells.map((cell, i) => '<td role="cell"><span class="cell-label" aria-hidden="true">' + esc(head[i]) + '</span><div>' + cell + '</div></td>').join('') + '</tr>').join('') + '</tbody></table></div>' : empty(fallback);
}

async function asDataURL(file) {
  if (!file?.size) return '';
  if (file.size > 150 * 1024) throw new Error('Choose a photo under 150 KB.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.readAsDataURL(file);
  });
}

export async function staffPage(slug, view) {
  let data = await api('staff');
  const allowed = sections[data.role];
  const active = allowed.find(name => name.toLowerCase() === view) || allowed[0];
  const title = active === 'Analytics' ? 'Sales' : active;
  let orderSearch = '', orderStatus = '', orderDate = '';
  shell('<main class="wrap staff"><section class="board-title"><div><p class="overline">' + esc(data.name) + (data.demo ? ' · DEMO RESTAURANT' : '') + '</p><h1>' + title + '</h1></div><span class="role">' + esc(data.role) + '</span></section>'
    + '<nav class="tabs" aria-label="Staff sections">' + allowed.map(name => '<a href="/staff/' + slug + '/' + name.toLowerCase() + '"' + (active === name ? ' aria-current="page"' : '') + '>' + (name === 'Analytics' ? 'Sales' : name) + '</a>').join('') + '</nav>'
    + '<section id="staff-content"></section><dialog id="staff-dialog"></dialog></main>', '<button class="text-button" data-logout>Sign out</button>');
  const activeTab = document.querySelector('.staff .tabs [aria-current="page"]');
  activeTab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const content = document.querySelector('#staff-content');
  const dialog = document.querySelector('#staff-dialog');
  const branch = id => data.branches.find(row => row.id === id)?.name || id;
  const menuItem = id => data.menu.find(row => row.id === id);
  const guestUrl = code => location.origin + '/r/' + slug + '/' + code;

  function showModal(title, body) {
    dialog.innerHTML = '<div class="modal-head"><h2>' + title + '</h2><button class="button light close" aria-label="Close dialog" data-close>×</button></div>' + body;
    if (!dialog.open) dialog.showModal();
  }
  function form(type, title, input, id = '') {
    showModal(title, '<form data-form="' + type + '" data-id="' + esc(id) + '">' + input
      + '<button class="button">Save ' + (type === 'menu-item' ? 'dish' : type) + '</button><p class="feedback" role="status"></p></form>');
  }
  function toolbar(title, button = '') { return '<div class="section-head"><h2>' + title + '</h2>' + button + '</div>'; }

  function orderActions(order) {
    const status = (orderSteps[order.status] || []).filter(([next, , roles]) => {
      if (!roles.split(' ').includes(data.role)) return false;
      if (['rejected', 'cancelled'].includes(next)) return order.payment.status !== 'paid' && !order.splits.some(share => share.paid);
      return order.payment.status === 'paid';
    })
      .map(([next, title]) => command('status', order.id, title, 'data-status="' + next + '"' + (next === 'completed' && order.payment.status !== 'paid' ? ' disabled title="Record payment first"' : ''))).join('');
    const canPay = data.role !== 'kitchen' && order.payment.method === 'cash' && !['paid', 'refunded'].includes(order.payment.status) && !['rejected', 'cancelled'].includes(order.status);
    const pay = canPay ? order.splits.length ? order.splits.filter(share => !share.paid).map(share =>
      command('payment', order.id, 'Cash received · ' + esc(share.name), 'data-share="' + esc(share.id) + '"')).join('') : command('payment', order.id, 'Record cash payment') : '';
    const refund = data.role === 'admin' && active === 'Payments' && order.payment.status === 'paid' && order.status === 'completed'
      ? command('refund', order.id, order.payment.method === 'cash' ? 'Record refund' : 'Simulate refund') : '';
    return '<div class="actions">' + status + pay + refund + '</div>';
  }
  function ticket(order) {
    const prep = order.history.find(row => row.status === 'preparing');
    const ready = order.history.find(row => row.status === 'ready');
    const minutes = prep ? Math.max(0, Math.floor((Date.parse(ready?.at) || Date.now()) / 60000 - Date.parse(prep.at) / 60000)) : null;
    const delayed = order.status === 'preparing' && minutes >= data.targetMinutes;
    return '<article class="ticket"><div class="order-head"><div><p class="overline">' + esc(branch(order.branch)) + ' · ' + time(order.createdAt) + '</p><h3>Table ' + esc(order.tableName) + ' <small>#' + order.number + '</small></h3></div>' + badge(order.status) + '</div>'
      + (minutes === null ? '' : '<p class="' + (delayed ? 'attention' : 'muted') + '">Prep time · ' + minutes + ' min' + (delayed ? ' · delayed' : '') + '</p>')
      + '<ul class="ticket-lines">' + order.items.map(line => '<li><strong>' + line.quantity + ' × ' + esc(line.name) + '</strong>'
        + (line.options.length ? '<small>' + esc(line.options.map(option => option.name).join(', ')) + '</small>' : '')
        + (line.notes ? '<small class="attention">Kitchen note · ' + esc(line.notes) + '</small>' : '') + '</li>').join('') + '</ul>'
      + '<p>Payment · ' + currency(order.total) + ' ' + badge(order.payment.status) + '</p>' + orderActions(order) + '</article>';
  }
  function kitchen() {
    const columns = [['received', 'New orders'], ['confirmed', 'Confirmed'], ['preparing', 'Preparing'], ['ready', 'Ready'], ['completed', 'Completed']];
    const paidOnly = '<p class="muted">Orders appear here after full payment is recorded.</p>';
    return paidOnly + '<div class="kitchen-grid">' + columns.map(([status, title]) => {
      const orders = data.orders.filter(order => order.status === status && order.payment.status === 'paid').reverse();
      return '<section class="kitchen-column"><h2>' + title + ' <span>' + orders.length + '</span></h2>' + (orders.length ? orders.map(ticket).join('') : '<p class="muted">No tickets</p>') + '</section>';
    }).join('') + '</div>';
  }
  function orderResults() {
    const dateString = instant => new Date(Date.parse(instant) + 8 * 3600000).toISOString().slice(0, 10);
    const found = data.orders.filter(order => (!orderStatus || order.status === orderStatus) && (!orderDate || dateString(order.createdAt) === orderDate)
      && ('#' + order.number + ' table ' + order.tableName + ' ' + branch(order.branch)).toLowerCase().includes(orderSearch.toLowerCase())).reverse();
    const results = document.querySelector('#order-results');
    results.innerHTML = found.length ? '<div class="ticket-grid">' + found.map(ticket).join('') + '</div>' : empty('No orders match these filters. New orders will appear here.');
  }
  function service() {
    const ready = data.orders.filter(order => ['ready', 'served'].includes(order.status));
    const awaiting = data.orders.filter(order => order.payment.method === 'cash' && order.payment.status === 'pending'
      && !['rejected', 'cancelled'].includes(order.status));
    return toolbar('Awaiting cash payment')
      + (awaiting.length ? '<div class="ticket-grid">' + awaiting.map(ticket).join('') + '</div>' : empty('No orders awaiting payment.'))
      + toolbar('Assistance requests') + table(['Table', 'Branch', 'Requested', 'Action'], data.assistance.map(row =>
      [esc(row.tableName), esc(branch(row.branch)), time(row.createdAt), command('assist', row.id, 'Mark resolved')]), 'No open requests for assistance.')
      + toolbar('Ready and served') + (ready.length ? '<div class="ticket-grid">' + ready.map(ticket).join('') + '</div>' : empty('No orders are ready to serve.'))
      + toolbar('Active dining sessions') + table(['Table', 'Opened', 'Orders', 'Action'], data.sessions.map(session => [
        esc(data.tables.find(row => row.code === session.table)?.name), time(session.createdAt), data.orders.filter(row => row.session === session.id).length,
        command('close', session.id, 'Close session')
      ]), 'Active guest sessions will appear here.');
  }
  function menu() {
    return toolbar('Dishes', edit('menu-item', '', 'Add menu item'))
      + table(['Dish', 'Category', 'Price', 'Availability', 'Actions'], data.menu.map(item => [
        '<strong>' + esc(item.name) + '</strong>' + (item.featured ? '<small>Featured</small>' : ''),
        esc(data.categories.find(row => row.id === item.category)?.name), currency(item.price), item.available ? 'Available' : 'Sold out',
        '<div class="actions">' + edit('menu-item', item.id) + command('menu-item', item.id, item.available ? 'Mark sold out' : 'Make available', 'data-toggle="true"')
          + command('menu-item', item.id, 'Archive', 'data-archive="true"') + '</div>'
      ]), 'No menu items yet. Add your first dish.')
      + toolbar('Categories', edit('category', '', 'Add category'))
      + table(['Name', 'Actions'], data.categories.map(row => [esc(row.name), '<div class="actions">' + edit('category', row.id)
        + command('category', row.id, 'Archive', 'data-archive="true"') + '</div>']), 'Add a category before creating a dish.');
  }
  function tables() {
    return toolbar('Restaurant tables', data.role === 'admin' ? edit('table', '', 'Add table') : '')
      + table(['Table', 'Branch', 'Availability', 'Sessions', 'Actions'], data.tables.map(row => [
        '<strong>Table ' + esc(row.name) + '</strong>', esc(branch(row.branch)), row.active ? 'Open' : 'Disabled',
        data.sessions.filter(session => session.table === row.code).length,
        '<div class="actions">' + (data.role === 'admin' ? edit('table', row.code) : '')
          + '<button class="button light small" data-qr="' + esc(row.code) + '">Table QR</button></div>'
      ]), 'No tables yet. Add a table to generate its QR code.')
      + (data.role === 'admin' ? toolbar('Branches', edit('branch', '', 'Add branch'))
      + table(['Branch', 'Tables', 'Action'], data.branches.map(row => [esc(row.name), data.tables.filter(t => t.branch === row.id).length, edit('branch', row.id)]), 'No branches yet.') : '');
  }
  function analytics() {
    const stats = data.analytics;
    const items = Object.entries(stats.items).sort((a, b) => b[1] - a[1]);
    const withChart = (title, values, format = String) => toolbar(title)
      + (values.length ? '<div class="chart">' + values.map(([name, value]) => '<div class="chart-row"><span>' + esc(name) + '</span><meter min="0" max="'
        + Math.max(1, ...values.map(row => Math.abs(row[1]))) + '" value="' + Math.abs(value) + '"></meter><strong>' + format(value) + '</strong></div>').join('') + '</div>'
        : empty('Insights will appear once orders are recorded.'));
    return '<p class="muted">Philippine time. Net sales equal recorded payments minus recorded refunds.</p>'
      + '<div class="metrics">' + [['Net sales today', currency(stats.daily)], ['Net sales · 7 days', currency(stats.weekly)], ['Net sales · 30 days', currency(stats.monthly)],
      ['Collected · 30 days', currency(stats.collected)], ['Refunded · 30 days', currency(stats.refunded)], ['Fully paid orders · 30 days', stats.paidOrders]].map(([label, value]) => '<article><span>' + label + '</span><strong>' + value + '</strong></article>').join('') + '</div>'
      + '<div class="actions"><button class="button light" data-export>Export last 30 days CSV</button></div>'
      + withChart('Daily net sales · 30 days', Object.entries(stats.dailySales).sort(([a], [b]) => b.localeCompare(a)), currency)
      + withChart('Net sales by branch · 30 days', Object.entries(stats.branches).map(([id, value]) => [branch(id), value]), currency)
      + withChart('Best-selling dishes · 30 days', items);
  }
  function overview() {
    const stats = data.analytics;
    const counts = Object.fromEntries(['received', 'preparing', 'ready', 'completed'].map(status => [status, data.orders.filter(row => row.status === status).length]));
    return '<div class="metrics">' + [['Orders today', stats.today], ['Sales today', currency(stats.daily)], ['Awaiting confirmation', counts.received], ['Preparing', counts.preparing], ['Ready', counts.ready], ['Completed', counts.completed]]
      .map(([title, value]) => '<article><span>' + title + '</span><strong>' + value + '</strong></article>').join('') + '</div>'
      + toolbar('Needs attention', '<a class="button light small" href="/staff/' + slug + '/orders">View orders</a>')
      + (counts.received ? '<div class="ticket-grid">' + data.orders.filter(row => row.status === 'received').map(ticket).join('') + '</div>' : empty('No orders awaiting confirmation.'))
      + toolbar('Sales and ordering trends', '<a class="button light small" href="/staff/' + slug + '/analytics">View analytics</a>');
  }
  function render() {
    if (active === 'Orders') {
      if (!document.querySelector('#order-results')) {
        content.innerHTML = '<div class="filters"><label>Find an order<input type="search" id="order-search" placeholder="Order number or table"></label>'
          + select('order-status', 'Status', [['', 'All statuses'], ...Object.entries(labels).filter(([key]) => !['paid', 'failed', 'pending', 'refunded'].includes(key))], orderStatus)
          + '<label>Date (Philippine time)<input type="date" id="order-date"></label></div><div id="order-results"></div>';
        document.querySelector('#order-search').oninput = e => { orderSearch = e.target.value; orderResults(); };
        document.querySelector('[name="order-status"]').onchange = e => { orderStatus = e.target.value; orderResults(); };
        document.querySelector('#order-date').onchange = e => { orderDate = e.target.value; orderResults(); };
      }
      orderResults(); return;
    }
    if (active === 'Kitchen') content.innerHTML = kitchen();
    if (active === 'Service') content.innerHTML = service();
    if (active === 'Menu') content.innerHTML = menu();
    if (active === 'Tables') content.innerHTML = tables();
    if (active === 'Overview') content.innerHTML = overview();
    if (active === 'Analytics') content.innerHTML = analytics();
    if (active === 'People') content.innerHTML = toolbar('Restaurant employees', edit('employee', '', 'Assign staff role'))
      + table(['Employee', 'Supabase user ID', 'Role', 'Action'], data.employees.map(row => [esc(row.name), esc(row.id), esc(row.role), edit('employee', row.id)]), 'No employees have been assigned roles.');
    if (active === 'Promotions') content.innerHTML = toolbar('Menu promotions', edit('promotion', '', 'Add promotion'))
      + table(['Promotion', 'Dish', 'Status', 'Action'], data.promotions.map(row => [esc(row.name), esc(menuItem(row.item)?.name), row.active ? 'Active' : 'Inactive', edit('promotion', row.id)]), 'No promotions have been added.');
    if (active === 'Payments') content.innerHTML = toolbar('Payment records') + table(['Order', 'Method', 'Total', 'Status', 'Recorded', 'Action'],
      [...data.orders].reverse().map(row => ['#' + row.number, row.payment.method === 'cash' ? 'Cash' : 'MannyPay simulation', currency(row.total),
        badge(row.payment.status), row.payment.paidAt ? new Date(row.payment.paidAt).toLocaleString('en-PH') : '—', orderActions(row)]), 'No payments or orders have been recorded.');
    if (active === 'Settings') content.innerHTML = toolbar('Restaurant settings', edit('settings', '', 'Edit restaurant'))
      + '<dl class="settings"><dt>Restaurant</dt><dd>' + esc(data.settings.name) + '</dd><dt>Tax</dt><dd>' + data.settings.taxBps / 100 + '%</dd><dt>Service charge</dt><dd>' + data.settings.serviceBps / 100
      + '%</dd><dt>Preparation target</dt><dd>' + data.settings.targetMinutes + ' minutes</dd></dl>'
      + (data.demo ? toolbar('Demo data') + '<button class="button light" data-reset>Reset demo restaurant</button>' : '');
  }
  function editForm(type, id) {
    if (type === 'menu-item') {
      const row = menuItem(id) || {};
      if (!data.categories.length) return notify('Create a menu category first.', true);
      form(type, id ? 'Edit menu item' : 'Add menu item', field('name', 'Dish name', row.name, 'required maxlength="100"')
        + select('category', 'Category', data.categories.map(c => [c.id, c.name]), row.category)
        + field('price', 'Price (₱)', row.price !== undefined ? row.price / 100 : '', 'type="number" min="0" step="0.01" required')
        + area('description', 'Description', row.description) + field('allergens', 'Allergens', row.allergens) + field('dietary', 'Dietary information', row.dietary)
        + '<label>HTTPS image URL<input type="url" name="image" value="' + esc(row.image?.startsWith('https://') ? row.image : '') + '"></label>'
        + '<label>Upload food image (up to 150 KB)<input type="file" name="photo" accept="image/jpeg,image/png,image/webp"></label>'
        + area('options', 'Add-ons (one per line, name | price in pesos)', row.options?.map(o => o.name + ' | ' + o.price / 100).join('\n'))
        + '<label>Suggested pairings<select name="pairs" multiple>' + data.menu.filter(item => item.id !== id).map(item => '<option value="' + esc(item.id) + '"'
          + (row.pairs?.includes(item.id) ? ' selected' : '') + '>' + esc(item.name) + '</option>').join('') + '</select></label>'
        + check('available', 'Available for ordering', row.available ?? true) + check('featured', 'Feature this dish', row.featured), id);
    }
    if (type === 'table') {
      const row = data.tables.find(t => t.code === id) || {};
      if (!data.branches.length) return notify('Create a branch before adding a table.', true);
      form(type, id ? 'Edit table' : 'Add table', field('name', 'Table number', row.name, 'required maxlength="28"')
        + select('branch', 'Branch', data.branches.map(b => [b.id, b.name]), row.branch)
        + check('active', 'Accept orders', row.active ?? true), id);
    }
    if (type === 'category' || type === 'branch') {
      const row = (type === 'category' ? data.categories : data.branches).find(r => r.id === id);
      form(type, (id ? 'Edit ' : 'Add ') + type, field('name', 'Name', row?.name, 'required maxlength="100"'), id);
    }
    if (type === 'employee') {
      const row = data.employees.find(r => r.id === id) || {};
      form(type, 'Assign staff role', field('user', 'Supabase user ID', row.id, id ? 'required readonly' : 'required maxlength="36"')
        + field('name', 'Employee name', row.name, 'required') + select('role', 'Role', ['admin', 'kitchen', 'service', 'revoked'].map(role => [role, role]), row.role));
    }
    if (type === 'promotion') {
      const row = data.promotions.find(r => r.id === id) || {};
      if (!data.menu.length) return notify('Add a menu item first.', true);
      form(type, id ? 'Edit promotion' : 'Add promotion', field('name', 'Promotion name', row.name, 'required')
        + select('item', 'Promoted dish', data.menu.map(item => [item.id, item.name]), row.item) + check('active', 'Active promotion', row.active ?? true), id);
    }
    if (type === 'settings') {
      const row = data.settings;
      form(type, 'Edit restaurant', field('name', 'Restaurant name', row.name, 'required')
        + area('description', 'Guest menu description', row.description)
        + field('taxBps', 'Tax (%)', row.taxBps / 100, 'type="number" min="0" max="100" step="0.01" required')
        + field('serviceBps', 'Service charge (%)', row.serviceBps / 100, 'type="number" min="0" max="100" step="0.01" required')
        + field('targetMinutes', 'Preparation target (minutes)', row.targetMinutes, 'type="number" min="1" max="240" required'));
    }
  }
  let refreshId = 0;
  async function refresh(manual = false) {
    const id = ++refreshId;
    const next = await api('staff');
    if (id !== refreshId) return;
    if (next.role !== data.role) { location.reload(); return; }
    const changed = manual || JSON.stringify(next) !== JSON.stringify(data) || active === 'Kitchen';
    data = next;
    if (changed && (manual || !dialog.open && !content.contains(document.activeElement))) render();
  }
  async function send(task, input) {
    await api('staff/' + task, input, 'POST');
    await refresh(true);
    notify('Saved.');
  }
  root.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;
    const d = button.dataset;
    try {
      if (d.close !== undefined) dialog.close();
      if (d.logout !== undefined) { await api('logout', {}, 'POST'); location.assign('/login?restaurant=' + slug); }
      if (d.edit) editForm(d.edit, d.id);
      if (d.qr) {
        const row = data.tables.find(t => t.code === d.qr);
        const link = guestUrl(d.qr);
        showModal('Table ' + esc(row.name) + ' QR', '<div class="qr-print"><img width="230" height="230" src="' + qrURL(link) + '" alt="Scannable table QR code">'
          + '<p>' + esc(data.name) + ' · Table ' + esc(row.name) + '</p><a href="' + esc(link) + '">Open table menu</a></div><div class="actions">'
          + '<a class="button" href="' + qrURL(link) + '" download="scanserve-table-qr.svg">Download QR code</a><button class="button light" data-print>Print QR code</button></div>');
      }
      if (d.print !== undefined) window.print();
      if (d.reset !== undefined) {
        showModal('Reset demo restaurant?', '<p>Orders, sessions, and menu changes for the demo restaurant will be cleared.</p><form data-form="reset"><button class="button">Reset demo data</button><p role="status" class="feedback"></p></form>');
      }
      if (d.task) {
        if (d.status === 'rejected' || d.archive || d.task === 'payment' || d.task === 'refund') {
          showModal(button.textContent, '<form data-form="' + d.task + '" data-id="' + esc(d.id) + '">' + (d.status === 'rejected'
            ? '<input name="status" type="hidden" value="rejected">' + area('reason', 'Rejection reason') : '')
            + (d.archive ? '<input name="archive" type="hidden" value="true"><p>Remove this record from the active menu?</p>' : '')
            + (d.task === 'payment' ? '<p>Confirm that you received the cash for this order or share.</p><input type="hidden" name="split" value="' + esc(d.share) + '">' : '')
            + (d.task === 'refund' ? '<p>Record a cash refund after returning the money. Demo digital refunds are simulated.</p>' + area('reason', 'Refund reason') : '')
            + '<button class="button">Confirm</button><p class="feedback" role="status"></p></form>');
        } else {
          button.disabled = true;
          try { await send(d.task, { id: d.id, status: d.status, toggle: !!d.toggle }); }
          finally { button.disabled = false; }
        }
      }
      if (d.export !== undefined) {
        const csv = rows => rows.map(row => row.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(',')).join('\r\n');
        const rows = [['Order', 'Philippine date', 'Timestamp (UTC)', 'Type', 'Method', 'Amount (PHP)'], ...data.analytics.activity.map(row =>
          [row.number, row.date, row.timestamp, row.type, row.method, ((row.type === 'refund' ? -row.amount : row.amount) / 100).toFixed(2)])];
        const url = URL.createObjectURL(new Blob([csv(rows)], { type: 'text/csv' }));
        const a = document.createElement('a'); a.href = url; a.download = 'scanserve-sales.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) { notify(error.message, true); }
  });
  dialog.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.target;
    const values = new FormData(form);
    const task = form.dataset.form;
    const id = form.dataset.id;
    const input = { ...Object.fromEntries(values), ...(id ? { id } : {}) };
    const feedback = form.querySelector('.feedback');
    const button = form.querySelector('button');
    button.disabled = true;
    feedback.textContent = 'Saving…';
    try {
      if (task === 'menu-item' && !input.archive) {
        input.image = await asDataURL(values.get('photo')) || input.image;
        delete input.photo;
        input.price = Math.round(Number(input.price) * 100);
        input.options = input.options.split('\n').filter(s => s.trim()).map(s => {
          const [name, price] = s.split('|');
          return { name, price: price?.trim() ? Math.round(Number(price) * 100) : null };
        });
        input.pairs = values.getAll('pairs');
        input.available = values.has('available'); input.featured = values.has('featured');
      }
      if (task === 'table') { delete input.id; input.code = id; input.active = values.has('active'); }
      if (task === 'employee') input.id = input.user;
      if (task === 'promotion') input.active = values.has('active');
      if (task === 'settings') {
        input.taxBps = Math.round(Number(input.taxBps) * 100);
        input.serviceBps = Math.round(Number(input.serviceBps) * 100);
        input.targetMinutes = Number(input.targetMinutes);
      }
      await send(task, input);
      dialog.close();
    } catch (error) { feedback.textContent = error.message; }
    finally { button.disabled = false; }
  });
  render();
  setInterval(() => {
    if (!document.hidden) refresh().catch(error => {
      if (error.status === 401) location.assign('/login?restaurant=' + slug);
    });
  }, 3500);
}
