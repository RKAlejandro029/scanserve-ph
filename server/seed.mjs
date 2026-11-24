export const demoRoles = {
  'admin@scanserve.demo': 'admin',
  'kitchen@scanserve.demo': 'kitchen',
  'service@scanserve.demo': 'service'
};

export function demoRestaurant() {
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const sampleItems = [{ id: 'adobo', name: 'Chicken Adobo Bowl', quantity: 1, options: [], notes: '', amount: 21500 }];
  return {
    slug: 'mesa-demo', name: 'Mesa at Bayan', demo: true,
    description: 'Filipino favorites for the whole table.',
    taxBps: 0, serviceBps: 0, targetMinutes: 20, nextNumber: 101,
    branches: [{ id: 'qc', name: 'Quezon City' }, { id: 'makati', name: 'Makati' }],
    tables: [{ code: 'demo-table-12', name: '12', branch: 'qc', active: true },
      { code: 'demo-table-04', name: '04', branch: 'qc', active: true },
      { code: 'demo-table-08', name: '08', branch: 'makati', active: true }],
    categories: [{ id: 'mains', name: 'Mains' }, { id: 'sides', name: 'Sides' }, { id: 'drinks', name: 'Drinks' }, { id: 'sweets', name: 'Desserts' }],
    menu: [
      { id: 'sisig', name: 'Sizzling Pork Sisig', category: 'mains', price: 26500, description: 'Crisp pork, onions and chilies with a squeeze of calamansi.', allergens: 'Soy, eggs', featured: true, pairs: ['rice', 'tea'],
        options: [{ id: 'egg', name: 'Add fried egg', price: 3000 }, { id: 'spicy', name: 'Extra chili', price: 0 }] },
      { id: 'adobo', name: 'Chicken Adobo Bowl', category: 'mains', price: 21500, description: 'Soy and vinegar-braised chicken over garlic rice.', allergens: 'Soy', featured: true, pairs: ['tea'],
        options: [{ id: 'egg', name: 'Add fried egg', price: 3000 }] },
      { id: 'pancit', name: 'Pancit Canton', category: 'mains', price: 19500, description: 'Wok-tossed egg noodles with vegetables and calamansi.', allergens: 'Eggs, wheat, soy', pairs: ['tea'] },
      { id: 'rice', name: 'Garlic Rice', category: 'sides', price: 5500, description: 'Sinangag with toasted garlic.', allergens: '', dietary: 'Plant-based' },
      { id: 'lumpia', name: 'Lumpiang Shanghai', category: 'sides', price: 13500, description: 'Six crisp pork spring rolls with sweet chili sauce.', allergens: 'Wheat' },
      { id: 'tea', name: 'Calamansi Iced Tea', category: 'drinks', price: 8500, description: 'House-brewed tea with fresh calamansi.', allergens: '', dietary: 'Plant-based' },
      { id: 'halo', name: 'Halo-Halo', category: 'sweets', price: 15500, description: 'Shaved ice, sweet beans, leche flan and ube ice cream.', allergens: 'Milk, eggs' }
    ].map(item => ({ available: true, featured: false, options: [], pairs: [], image: '', dietary: '', ...item })),
    employees: [], orders: [{ id: 'example-order-100', number: 100, table: 'demo-table-04', tableName: '04', branch: 'qc',
      status: 'completed', createdAt: yesterday, items: sampleItems, subtotal: 21500, tax: 0, service: 0, total: 21500,
      history: [{ status: 'completed', at: yesterday }], payment: { method: 'cash', status: 'paid', paidAt: yesterday }, splits: [] }],
    sessions: [], assistance: [], promotions: [], audit: [], rates: []
  };
}
