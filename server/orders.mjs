import { randomUUID } from 'node:crypto';

export class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function requireThat(condition, message, status) {
  if (!condition) throw new InputError(message, status);
}

export function clean(value, max = 160) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export const roles = ['admin', 'kitchen', 'service'];
export const transitions = {
  received: { confirmed: ['admin', 'kitchen'], rejected: ['admin', 'kitchen'], cancelled: ['admin'] },
  confirmed: { preparing: ['admin', 'kitchen'], cancelled: ['admin'] },
  preparing: { ready: ['admin', 'kitchen'] },
  ready: { served: ['admin', 'service'] },
  served: { completed: ['admin', 'service'] },
  completed: {}, rejected: {}, cancelled: {}
};

export function makeQuote(state, lines) {
  requireThat(Array.isArray(lines) && lines.length > 0 && lines.length <= 30, 'Add between 1 and 30 cart lines.');
  const items = lines.map(line => {
    const item = state.menu.find(row => row.id === line?.id && row.available && !row.archived);
    requireThat(item, 'A dish in your cart is no longer available.');
    requireThat(Number.isInteger(line.quantity) && line.quantity >= 1 && line.quantity <= 20, 'Choose a quantity between 1 and 20.');
    const optionIds = line.options ?? [];
    requireThat(Array.isArray(optionIds) && new Set(optionIds).size === optionIds.length, 'Choose valid add-ons.');
    const options = optionIds.map(id => {
      const option = item.options.find(row => row.id === id);
      requireThat(option, 'An add-on in your cart is no longer available.');
      return option;
    });
    const unit = item.price + options.reduce((sum, option) => sum + option.price, 0);
    return { id: item.id, name: item.name, quantity: line.quantity, options, notes: clean(line.notes, 250), amount: unit * line.quantity };
  });
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const tax = Math.round(subtotal * state.taxBps / 10000);
  const service = Math.round(subtotal * state.serviceBps / 10000);
  return { items, subtotal, tax, service, total: subtotal + tax + service };
}

export function placeOrder(state, { table, session, method, key, lines, expectedTotal }) {
  requireThat(typeof key === 'string' && /^[a-z0-9-]{16,64}$/i.test(key), 'Refresh checkout and try again.');
  const prior = state.orders.find(order => order.session === session.id && order.key === key);
  if (prior) return prior;
  requireThat(method === 'cash' || method === 'simulated', 'Choose a payment method.');
  const quote = makeQuote(state, lines);
  requireThat(Number.isInteger(expectedTotal) && expectedTotal === quote.total, 'Your total changed. Review the order again.', 409);
  const now = new Date().toISOString();
  const order = { ...quote, id: randomUUID(), number: state.nextNumber++, key, session: session.id,
    table: table.code, tableName: table.name, branch: table.branch,
    status: 'received', history: [{ status: 'received', at: now }], createdAt: now,
    payment: { method, status: 'pending', paidAt: null }, splits: [] };
  state.orders.push(order);
  return order;
}

export function updateStatus(order, role, status, reason) {
  const choices = transitions[order.status];
  requireThat(typeof status === 'string' && choices && Object.hasOwn(choices, status) && choices[status].includes(role), 'This status change is unavailable for your role or order stage.', 403);
  if (status === 'rejected') requireThat(clean(reason), 'Enter a rejection reason.');
  if (status === 'completed') requireThat(['paid', 'refunded'].includes(order.payment.status), 'Record payment before completing the order.');
  if (status === 'rejected' || status === 'cancelled') requireThat(order.payment.status !== 'paid' && !order.splits.some(split => split.paid), 'Resolve payments before cancelling this order.');
  order.status = status;
  order.history.push({ status, at: new Date().toISOString(), reason: clean(reason) });
}

function share(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) return weights.map((_, index) => index ? 0 : total);
  let used = 0;
  let accumulated = 0;
  return weights.map(weight => {
    accumulated += weight;
    const next = Math.floor(total * accumulated / sum);
    const amount = next - used;
    used = next;
    return amount;
  });
}

export function splitOrder(order, input) {
  requireThat(order.payment.status === 'pending' && !['rejected', 'cancelled'].includes(order.status) && !order.splits.some(split => split.paid), 'This order can no longer be split.');
  requireThat(Array.isArray(input.diners) && input.diners.length >= 2 && input.diners.length <= 12, 'Enter between 2 and 12 diners.');
  const diners = input.diners.map(name => clean(name, 45));
  requireThat(diners.every(Boolean), 'Enter a name for each diner.');
  let weights = diners.map(() => 1);
  if (input.mode === 'items') {
    requireThat(Array.isArray(input.assignments) && input.assignments.length === order.items.length, 'Assign every line to a diner.');
    weights = diners.map(() => 0);
    input.assignments.forEach((diner, index) => {
      requireThat(Number.isInteger(diner) && diner >= 0 && diner < diners.length, 'Assign every line to a diner.');
      weights[diner] += order.items[index].amount;
    });
    requireThat(weights.every(weight => weight > 0), 'Assign at least one priced item to each diner.');
  } else requireThat(input.mode === 'equal', 'Choose a split method.');
  const amounts = share(order.total, weights);
  order.splits = diners.map((name, index) => ({
    id: randomUUID(), name, amount: amounts[index], paid: amounts[index] === 0,
    items: input.mode === 'items' ? input.assignments.flatMap((diner, line) => diner === index ? [line] : []) : []
  }));
}

export function payOrder(order, actor, input, demo) {
  requireThat(!['rejected', 'cancelled'].includes(order.status) && order.payment.status !== 'refunded', 'This order cannot be paid.');
  if (actor === 'guest') {
    requireThat(demo && order.payment.method === 'simulated', 'Only staff can record cash payments.', 403);
    if (input.outcome === 'fail') {
      requireThat(!order.splits.some(split => split.paid) && order.payment.status !== 'paid', 'Payment has already been recorded.');
      order.payment.status = 'failed';
      return;
    }
    requireThat(input.outcome === 'approve', 'Choose a simulation result.');
  } else requireThat(['admin', 'service'].includes(actor) && order.payment.method === 'cash', 'You cannot record this payment.', 403);
  if (order.payment.status === 'paid') return;
  if (order.splits.length) {
    const split = order.splits.find(row => row.id === input.split);
    requireThat(split, 'Choose a bill share to pay.');
    if (!split.paid) {
      split.paid = true;
      split.paidAt = new Date().toISOString();
    }
  }
  order.payment.status = order.splits.every(split => split.paid) ? 'paid' : 'pending';
  if (order.payment.status === 'paid') order.payment.paidAt = new Date().toISOString();
}

export function refundOrder(order, role, reason) {
  requireThat(role === 'admin', 'Only administrators can record refunds.', 403);
  requireThat(order.payment.status === 'paid' && order.status === 'completed', 'Only paid, completed orders can be refunded.');
  requireThat(clean(reason), 'Enter a refund reason.');
  order.payment.status = 'refunded';
  order.payment.refundedAt = new Date().toISOString();
  order.payment.refundReason = clean(reason, 250);
}

export function recommendations(state, ids = [], history = []) {
  const selected = new Set(ids);
  const pairs = new Set(state.menu.filter(item => selected.has(item.id)).flatMap(item => item.pairs));
  const popularity = new Map();
  for (const order of state.orders.filter(o => !['rejected', 'cancelled'].includes(o.status))) {
    for (const item of order.items) popularity.set(item.id, (popularity.get(item.id) || 0) + item.quantity);
    if (order.items.some(item => selected.has(item.id))) order.items.forEach(item => pairs.add(item.id));
  }
  const recent = new Set(history.flatMap(order => order.items.map(item => item.id)));
  const promos = new Set(state.promotions.filter(p => p.active).map(p => p.item));
  const hour = (new Date().getUTCHours() + 8) % 24;
  const score = item => (pairs.has(item.id) ? 60 : 0) + (promos.has(item.id) ? 30 : 0)
    + (item.featured ? 12 : 0) + (recent.has(item.id) ? 6 : 0)
    + (hour >= 13 && hour < 17 && ['drinks', 'sweets'].includes(item.category) ? 4 : 0)
    + Math.min(10, popularity.get(item.id) || 0);
  return state.menu.filter(item => item.available && !item.archived && !selected.has(item.id))
    .sort((a, b) => score(b) - score(a)).slice(0, 3);
}

export function analytics(orders, now = Date.now()) {
  const offset = 8 * 3600000;
  const day = instant => Number.isFinite(instant) ? new Date(instant + offset).toISOString().slice(0, 10) : '';
  const today = day(now);
  const first = days => day(now - (days - 1) * 86400000);
  const activity = [];
  const [items, branches, dailySales] = Array.from({ length: 3 }, () => Object.create(null));
  for (const order of orders) {
    const add = (timestamp, amount, type) => {
      const date = day(Date.parse(timestamp));
      if (!date || date < first(30) || date > today || !amount) return;
      activity.push({ timestamp, date, amount, type, number: order.number, method: order.payment.method, branch: order.branch });
      const signed = type === 'refund' ? -amount : amount;
      dailySales[date] = (dailySales[date] || 0) + signed;
      branches[order.branch] = (branches[order.branch] || 0) + signed;
    };
    if (order.splits.length) {
      for (const share of order.splits.filter(row => row.paid)) {
        add(share.paidAt || order.payment.paidAt, share.amount, 'payment');
      }
    } else add(order.payment.paidAt, order.total, 'payment');
    if (order.payment.status === 'refunded') add(order.payment.refundedAt, order.total, 'refund');
    const paidOn = day(Date.parse(order.payment.paidAt));
    if (order.payment.status === 'paid' && paidOn >= first(30) && paidOn <= today) {
      for (const item of order.items) items[item.name] = (items[item.name] || 0) + item.quantity;
    }
  }
  const sum = (days, type) => activity.filter(row => row.date >= first(days) && row.type === type)
    .reduce((total, row) => total + row.amount, 0);
  const net = days => sum(days, 'payment') - sum(days, 'refund');
  return {
    today: orders.filter(order => day(Date.parse(order.createdAt)) === today).length,
    daily: net(1), weekly: net(7), monthly: net(30),
    collected: sum(30, 'payment'), refunded: sum(30, 'refund'),
    paidOrders: orders.filter(order => {
      const paidOn = day(Date.parse(order.payment.paidAt));
      return !!paidOn && paidOn >= first(30) && paidOn <= today;
    }).length,
    items, branches,
    dailySales,
    activity: activity.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  };
}
