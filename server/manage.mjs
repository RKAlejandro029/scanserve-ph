import { randomBytes, randomUUID } from 'node:crypto';
import { clean, requireThat, roles } from './orders.mjs';

function text(value, label, length = 100) {
  const result = clean(value, length);
  requireThat(result, 'Enter ' + label + '.');
  return result;
}

function number(value, min, max, label) {
  requireThat(Number.isInteger(value) && value >= min && value <= max, 'Enter a valid ' + label + '.');
  return value;
}

function upsert(list, id, value) {
  const current = list.find(row => row.id === id);
  if (id) requireThat(current, 'Record not found.', 404);
  if (current) Object.assign(current, value);
  else list.push({ id: randomUUID(), ...value });
}

export function manage(state, action, input) {
  if (action === 'settings') {
    state.name = text(input.name, 'a restaurant name');
    state.description = clean(input.description, 250);
    state.taxBps = number(input.taxBps, 0, 10000, 'tax rate');
    state.serviceBps = number(input.serviceBps, 0, 10000, 'service rate');
    state.targetMinutes = number(input.targetMinutes, 1, 240, 'preparation target');
  } else if (action === 'branch') {
    upsert(state.branches, input.id, { name: text(input.name, 'a branch name') });
  } else if (action === 'category') {
    if (input.archive) {
      requireThat(state.categories.some(row => row.id === input.id), 'Category not found.', 404);
      requireThat(!state.menu.some(item => item.category === input.id && !item.archived), 'Move or archive dishes in this category first.');
      state.categories = state.categories.filter(row => row.id !== input.id);
    } else upsert(state.categories, input.id, { name: text(input.name, 'a category name') });
  } else if (action === 'menu-item') {
    if (input.archive || input.toggle) {
      const item = state.menu.find(row => row.id === input.id && !row.archived);
      requireThat(item, 'Dish not found.', 404);
      if (input.archive) { item.archived = true; item.available = false; }
      else item.available = !item.available;
      return;
    }
    requireThat(state.categories.some(row => row.id === input.category), 'Choose a category.');
    requireThat(Array.isArray(input.options) && input.options.length <= 12, 'Enter up to 12 add-ons.');
    const existing = state.menu.find(row => row.id === input.id);
    const optionNames = new Set();
    const options = input.options.map(option => {
      const name = text(option?.name, 'an add-on name', 60);
      requireThat(!optionNames.has(name.toLowerCase()), 'Use a unique name for each add-on.');
      optionNames.add(name.toLowerCase());
      const old = existing?.options.find(row => row.name === name);
      return { id: old?.id ?? randomUUID(), name, price: number(option.price, 0, 1000000, 'add-on price') };
    });
    const rawImage = typeof input.image === 'string' ? input.image : '';
    requireThat(!rawImage || /^https:\/\//i.test(rawImage) && rawImage.length <= 400
      || /^data:image\/(jpeg|webp|png);base64,[a-z0-9+/=]+$/i.test(rawImage) && rawImage.length <= 210000,
      'Use an HTTPS image or a JPEG, WebP or PNG under 150 KB.');
    upsert(state.menu, input.id, { name: text(input.name, 'a dish name'), category: input.category,
      price: number(input.price, 0, 10000000, 'price'), options, image: rawImage || existing?.image || '',
      description: clean(input.description, 250), allergens: clean(input.allergens), dietary: clean(input.dietary),
      featured: input.featured === true, available: input.available === true,
      pairs: Array.isArray(input.pairs) ? state.menu.filter(row => input.pairs.includes(row.id) && row.id !== input.id).map(row => row.id) : []
    });
  } else if (action === 'table') {
    const name = text(input.name, 'a table number', 28);
    requireThat(state.branches.some(row => row.id === input.branch), 'Choose a branch.');
    const current = state.tables.find(row => row.code === input.code);
    if (input.code) requireThat(current, 'Table not found.', 404);
    if (current && current.branch !== input.branch) requireThat(!state.sessions.some(s => s.table === current.code && !s.closed), 'Close all sessions before changing the branch.');
    requireThat(!state.tables.some(row => row !== current && row.branch === input.branch && row.name.toLowerCase() === name.toLowerCase()), 'This table number already exists at that branch.');
    if (current) Object.assign(current, { name, branch: input.branch, active: input.active === true });
    else state.tables.push({ code: randomBytes(9).toString('base64url'), name, branch: input.branch, active: input.active === true });
  } else if (action === 'employee') {
    const id = text(input.id, 'the Supabase user ID', 45);
    requireThat(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id), 'Enter a valid Supabase user ID.');
    const current = state.employees.find(row => row.id === id.toLowerCase());
    requireThat(roles.includes(input.role) || input.role === 'revoked', 'Choose a staff role.');
    requireThat(!(current?.role === 'admin' && input.role !== 'admin' && !state.demo
      && state.employees.filter(row => row.role === 'admin').length <= 1), 'Keep at least one administrator.');
    const row = { id: id.toLowerCase(), name: text(input.name, 'an employee name'), role: input.role };
    if (current) Object.assign(current, row);
    else state.employees.push(row);
  } else if (action === 'promotion') {
    requireThat(state.menu.some(row => row.id === input.item && !row.archived), 'Choose a menu item.');
    upsert(state.promotions, input.id, { name: text(input.name, 'a promotion title'), item: input.item, active: input.active === true });
  } else requireThat(false, 'Action not found.', 404);
}
