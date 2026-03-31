import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create database in the same location as seed-auth.js
const dbPath = path.join(__dirname, '../pos_database.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

console.log('🌱 Seeding database with demo data...');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    barcode TEXT UNIQUE,
    price REAL NOT NULL,
    stock_quantity INTEGER DEFAULT 0,
    min_stock_level INTEGER DEFAULT 5,
    category TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    total_amount REAL NOT NULL,
    payment_method TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    product_id INTEGER,
    service_name TEXT,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    total_price REAL NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales (id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    product_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
  )
`);

// Clear existing data (but keep user_activity_logs)
db.exec('DELETE FROM sale_items');
db.exec('DELETE FROM sales');
db.exec('DELETE FROM products');
db.exec('DELETE FROM alerts');

// Insert demo products
const insertProduct = db.prepare(`
  INSERT INTO products (name, barcode, price, stock_quantity, min_stock_level, category, description)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const demoProducts = [
  ['Coca Cola 500ml', '1234567890123', 50.00, 100, 10, 'Beverages', 'Refreshing soft drink'],
  ['Bread Loaf', '1234567890124', 30.00, 50, 5, 'Food', 'Fresh white bread'],
  ['Milk 1L', '1234567890125', 80.00, 25, 5, 'Dairy', 'Fresh whole milk'],
  ['Chocolate Bar', '1234567890126', 25.00, 200, 20, 'Snacks', 'Milk chocolate bar'],
  ['Mineral Water 500ml', '1234567890127', 20.00, 150, 15, 'Beverages', 'Pure mineral water'],
  ['Rice 1kg', '1234567890128', 120.00, 30, 5, 'Food', 'Basmati rice'],
  ['Cooking Oil 1L', '1234567890129', 200.00, 15, 3, 'Cooking', 'Vegetable cooking oil'],
  ['Sugar 1kg', '1234567890130', 80.00, 40, 5, 'Food', 'White granulated sugar'],
  ['Tea Bags 50pcs', '1234567890131', 150.00, 20, 5, 'Beverages', 'Black tea bags'],
  ['Soap Bar', '1234567890132', 35.00, 60, 10, 'Personal Care', 'Antibacterial soap'],
  ['Toothpaste', '1234567890133', 45.00, 30, 5, 'Personal Care', 'Mint toothpaste'],
  ['Shampoo 400ml', '1234567890134', 120.00, 25, 5, 'Personal Care', 'Hair care shampoo'],
  ['Coffee 250g', '1234567890135', 180.00, 15, 3, 'Beverages', 'Ground coffee beans'],
  ['Biscuits Pack', '1234567890136', 40.00, 80, 10, 'Snacks', 'Sweet biscuits'],
  ['Canned Beans', '1234567890137', 60.00, 40, 5, 'Food', 'Canned baked beans'],
  ['Apple Juice 1L', '1234567890138', 90.00, 20, 5, 'Beverages', 'Fresh apple juice'],
  ['Potato Chips', '1234567890139', 35.00, 50, 10, 'Snacks', 'Crispy potato chips'],
  ['Pasta 500g', '1234567890140', 70.00, 35, 5, 'Food', 'Spaghetti pasta'],
  ['Cheese 200g', '1234567890141', 110.00, 20, 3, 'Dairy', 'Cheddar cheese'],
  ['Bananas 1kg', '1234567890142', 50.00, 25, 5, 'Fruits', 'Fresh bananas']
];

// Check if products table has store_id column
const productCols = db.prepare('PRAGMA table_info(products)').all();
const hasProductStoreId = productCols.some((c) => c.name === 'store_id');

// Get store ID for products
const storeForProducts = db.prepare('SELECT id FROM stores LIMIT 1').get();
const storeIdForProducts = storeForProducts ? storeForProducts.id : null;

for (const product of demoProducts) {
  insertProduct.run(...product);
}

// Assign products to store if store_id column exists
if (hasProductStoreId && storeIdForProducts) {
  db.prepare('UPDATE products SET store_id = ? WHERE store_id IS NULL').run(storeIdForProducts);
  console.log('✅ Assigned products to store');
}

// Check if sales table has store_id and user_id columns
const salesCols = db.prepare('PRAGMA table_info(sales)').all();
const hasStoreId = salesCols.some((c) => c.name === 'store_id');
const hasUserId = salesCols.some((c) => c.name === 'user_id');

// Get store and user IDs for sales
const store = db.prepare('SELECT id FROM stores LIMIT 1').get();
const user = db.prepare('SELECT id FROM users WHERE role = ? LIMIT 1').get('cashier');
const storeId = store ? store.id : null;
const userId = user ? user.id : null;

// Build INSERT statement for sales based on available columns
let saleFields = 'total_amount, payment_method, payment_status';
let salePlaceholders = '?, ?, ?';
if (hasStoreId && storeId) {
  saleFields += ', store_id';
  salePlaceholders += ', ?';
}
if (hasUserId && userId) {
  saleFields += ', user_id';
  salePlaceholders += ', ?';
}

const insertSale = db.prepare(`
  INSERT INTO sales (${saleFields})
  VALUES (${salePlaceholders})
`);

// Check if sale_items table has service_id column
const saleItemsCols = db.prepare('PRAGMA table_info(sale_items)').all();
const hasServiceId = saleItemsCols.some((c) => c.name === 'service_id');

const insertSaleItem = db.prepare(`
  INSERT INTO sale_items (sale_id, product_id, service_id, quantity, unit_price, total_price)
  VALUES (?, ?, ?, ?, ?, ?)
`);

// Create some demo sales with products
const demoSales = [
  {
    total: 150.00,
    payment_method: 'cash',
    payment_status: 'completed',
    items: [
      { product_name: 'Coca Cola 500ml', quantity: 2, unit_price: 50.00 },
      { product_name: 'Bread Loaf', quantity: 1, unit_price: 30.00 },
      { product_name: 'Chocolate Bar', quantity: 2, unit_price: 25.00 }
    ]
  },
  {
    total: 200.00,
    payment_method: 'mpesa',
    payment_status: 'completed',
    items: [
      { product_name: 'Milk 1L', quantity: 1, unit_price: 80.00 },
      { product_name: 'Rice 1kg', quantity: 1, unit_price: 120.00 }
    ]
  },
  {
    total: 85.00,
    payment_method: 'cash',
    payment_status: 'completed',
    items: [
      { product_name: 'Mineral Water 500ml', quantity: 3, unit_price: 20.00 },
      { product_name: 'Tea Bags 50pcs', quantity: 1, unit_price: 25.00 }
    ]
  }
];

// Create demo sales with services
const demoServiceSales = [
  {
    total: 4300.00,
    payment_method: 'cash',
    payment_status: 'completed',
    items: [
      { service_name: 'Network Penetration Testing', quantity: 1, unit_price: 1500.00 },
      { service_name: 'Vulnerability Assessment', quantity: 1, unit_price: 800.00 },
      { service_name: 'Security Consulting', quantity: 1, unit_price: 2000.00 }
    ]
  },
  {
    total: 2500.00,
    payment_method: 'cash',
    payment_status: 'completed',
    items: [
      { service_name: 'Web Application Security Audit', quantity: 1, unit_price: 2500.00 }
    ]
  },
  {
    total: 5000.00,
    payment_method: 'mpesa',
    payment_status: 'completed',
    items: [
      { service_name: 'Incident Response Services', quantity: 1, unit_price: 3500.00 },
      { service_name: 'Security Training', quantity: 1, unit_price: 1200.00 },
      { service_name: 'Malware Analysis', quantity: 1, unit_price: 1800.00 }
    ]
  },
  {
    total: 2200.00,
    payment_method: 'cash',
    payment_status: 'completed',
    items: [
      { service_name: 'Network Security Hardening', quantity: 1, unit_price: 2200.00 }
    ]
  },
  {
    total: 4300.00,
    payment_method: 'cash',
    payment_status: 'completed',
    items: [
      { service_name: 'Data Protection Assessment', quantity: 1, unit_price: 1500.00 },
      { service_name: 'Compliance Assessment', quantity: 1, unit_price: 2800.00 }
    ]
  }
];

// Insert product sales
for (const sale of demoSales) {
  const saleParams = [sale.total, sale.payment_method, sale.payment_status];
  if (hasStoreId && storeId) saleParams.push(storeId);
  if (hasUserId && userId) saleParams.push(userId);
  
  const saleResult = insertSale.run(...saleParams);
  const saleId = saleResult.lastInsertRowid;
  
  for (const item of sale.items) {
    const product = db.prepare('SELECT id FROM products WHERE name = ?').get(item.product_name);
    if (product) {
      insertSaleItem.run(saleId, product.id, null, item.quantity, item.unit_price, item.quantity * item.unit_price);
    }
  }
}

// Insert service sales
if (hasServiceId) {
  for (const sale of demoServiceSales) {
    const saleParams = [sale.total, sale.payment_method, sale.payment_status];
    if (hasStoreId && storeId) saleParams.push(storeId);
    if (hasUserId && userId) saleParams.push(userId);
    
    const saleResult = insertSale.run(...saleParams);
    const saleId = saleResult.lastInsertRowid;
    
    for (const item of sale.items) {
      const service = db.prepare('SELECT id FROM services WHERE name = ?').get(item.service_name);
      if (service) {
        insertSaleItem.run(saleId, null, service.id, item.quantity, item.unit_price, item.quantity * item.unit_price);
      }
    }
  }
  console.log('✅ Added service sales to database');
}

// Create some low stock alerts
const insertAlert = db.prepare(`
  INSERT INTO alerts (type, message, product_id)
  VALUES (?, ?, ?)
`);

// Get product IDs for alerts
const cookingOil = db.prepare('SELECT id FROM products WHERE name = ?').get('Cooking Oil 1L');
const coffee = db.prepare('SELECT id FROM products WHERE name = ?').get('Coffee 250g');
const cheese = db.prepare('SELECT id FROM products WHERE name = ?').get('Cheese 200g');

if (cookingOil) {
  insertAlert.run('low_stock', 'Cooking Oil is running low (15 units remaining)', cookingOil.id);
}
if (coffee) {
  insertAlert.run('low_stock', 'Coffee is running low (15 units remaining)', coffee.id);
}
if (cheese) {
  insertAlert.run('low_stock', 'Cheese is running low (20 units remaining)', cheese.id);
}

console.log('✅ Demo data added successfully!');
console.log(`📊 Added ${demoProducts.length} products`);
console.log(`📊 Added ${demoSales.length} product sales`);
if (hasServiceId) {
  console.log(`📊 Added ${demoServiceSales.length} service sales`);
}

// Ensure sales table has user_id column
console.log('📝 Ensuring sales table has user_id column...');
try {
  const salesCols = db.prepare('PRAGMA table_info(sales)').all();
  const hasUserId = salesCols.some((c) => c.name === 'user_id');
  if (!hasUserId) {
    db.exec('ALTER TABLE sales ADD COLUMN user_id INTEGER');
    console.log('✅ Added user_id column to sales table');
  }
} catch (e) {
  console.log('⚠️  Could not add user_id to sales:', e.message);
}

// Seed user activity logs
console.log('📝 Seeding user activity logs...');

// Create user_activity_logs table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS user_activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    action_type TEXT NOT NULL,
    action_description TEXT NOT NULL,
    entity_type TEXT,
    entity_id INTEGER,
    metadata TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  )
`);

// Get users from database (check if table exists first)
let users = [];
try {
  const usersTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (usersTable) {
    users = db.prepare('SELECT id, username, role FROM users').all();
  } else {
    console.log('⚠️  Users table does not exist, skipping activity logs seeding');
    users = [];
  }
} catch (e) {
  console.log('⚠️  Error checking users table, skipping activity logs seeding:', e.message);
  users = [];
}

if (users.length > 0) {
  const insertActivityLog = db.prepare(`
    INSERT INTO user_activity_logs (user_id, action_type, action_description, entity_type, entity_id, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const activityTypes = [
    { type: 'sale', desc: 'Completed sale', entity: 'sale' },
    { type: 'sale', desc: 'Processed payment', entity: 'sale' },
    { type: 'product', desc: 'Viewed product details', entity: 'product' },
    { type: 'product', desc: 'Added product to cart', entity: 'product' },
    { type: 'service', desc: 'Processed service', entity: 'service' },
    { type: 'login', desc: 'Logged into system', entity: null },
    { type: 'logout', desc: 'Logged out of system', entity: null },
    { type: 'price_negotiation', desc: 'Negotiated price for service', entity: 'service' },
    { type: 'cart', desc: 'Updated cart items', entity: null },
    { type: 'payment', desc: 'Initiated M-Pesa payment', entity: 'sale' },
  ];

  // Get recent sales for activity logs
  let recentSales = [];
  try {
    const salesTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sales'").get();
    if (salesTable) {
      const salesCols = db.prepare('PRAGMA table_info(sales)').all();
      const hasUserId = salesCols.some((c) => c.name === 'user_id');
      if (hasUserId) {
        recentSales = db.prepare('SELECT id, total_amount, payment_method, payment_status, user_id, created_at FROM sales ORDER BY created_at DESC LIMIT 20').all();
      } else {
        recentSales = db.prepare('SELECT id, total_amount, payment_method, payment_status, created_at FROM sales ORDER BY created_at DESC LIMIT 20').all();
        recentSales = recentSales.map(s => ({ ...s, user_id: null }));
      }
    }
  } catch (e) {
    console.log('No sales table found, skipping sales-based activity logs');
  }
  const recentProducts = db.prepare('SELECT id FROM products LIMIT 10').all();
  const recentServices = db.prepare('SELECT id FROM services LIMIT 5').all().length > 0 
    ? db.prepare('SELECT id FROM services LIMIT 5').all()
    : [];

  // Generate activity logs for each user
  users.forEach((user, userIdx) => {
    // Login activity
    const loginDate = new Date();
    loginDate.setDate(loginDate.getDate() - Math.floor(Math.random() * 7));
    insertActivityLog.run(
      user.id,
      'login',
      `Logged into system`,
      null,
      null,
      JSON.stringify({ ip: '192.168.1.100', user_agent: 'Mozilla/5.0' })
    );

    // Sales activities for cashiers
    if (user.role === 'cashier') {
      // First, try to assign user_id to existing sales if the column exists
      try {
        const salesCols = db.prepare('PRAGMA table_info(sales)').all();
        const hasUserId = salesCols.some((c) => c.name === 'user_id');
        
        if (hasUserId) {
          // Assign some existing sales to this cashier
          const unassignedSales = db.prepare('SELECT id, total_amount, payment_method, payment_status FROM sales WHERE user_id IS NULL LIMIT 5').all();
          unassignedSales.forEach((sale) => {
            db.prepare('UPDATE sales SET user_id = ? WHERE id = ?').run(user.id, sale.id);
          });
        }
      } catch (e) {
        console.log('Could not update sales with user_id:', e.message);
      }

      // Get sales for this user (either from existing or newly assigned)
      let userSales = [];
      try {
        const salesCols = db.prepare('PRAGMA table_info(sales)').all();
        const hasUserId = salesCols.some((c) => c.name === 'user_id');
        if (hasUserId) {
          userSales = db.prepare('SELECT id, total_amount, payment_method, payment_status FROM sales WHERE user_id = ? LIMIT 10').all(user.id);
        }
        
        // If no sales assigned yet, use unassigned sales for activity logs
        if (userSales.length === 0 && recentSales.length > 0) {
          userSales = recentSales.slice(0, 5).map(s => ({
            id: s.id,
            total_amount: s.total_amount,
            payment_method: s.payment_method,
            payment_status: s.payment_status || 'completed'
          }));
        }
      } catch (e) {
        if (recentSales.length > 0) {
          userSales = recentSales.slice(0, 5).map(s => ({
            id: s.id,
            total_amount: s.total_amount,
            payment_method: s.payment_method,
            payment_status: s.payment_status || 'completed'
          }));
        }
      }

      // Create sale activity logs for each sale
      userSales.forEach((sale, idx) => {
        const saleAmount = sale.total_amount || (Math.random() * 1000 + 100);
        const paymentMethod = sale.payment_method || (idx % 2 === 0 ? 'cash' : 'mpesa');
        const paymentStatus = sale.payment_status || 'completed';
        
        insertActivityLog.run(
          user.id,
          'sale',
          `Completed sale #${sale.id || idx + 1}`,
          'sale',
          sale.id || null,
          JSON.stringify({ amount: parseFloat(saleAmount).toFixed(2), payment_method: paymentMethod, payment_status: paymentStatus })
        );

        // Payment activity
        if (idx % 2 === 0) {
          insertActivityLog.run(
            user.id,
            'payment',
            `Processed payment for sale #${sale.id || idx + 1}`,
            'sale',
            sale.id || null,
            JSON.stringify({ payment_method: paymentMethod, amount: parseFloat(saleAmount).toFixed(2), status: paymentStatus })
          );
        }
      });

      // Product activities
      recentProducts.slice(0, 5).forEach((product) => {
        insertActivityLog.run(
          user.id,
          'product',
          `Added ${db.prepare('SELECT name FROM products WHERE id = ?').get(product.id)?.name || 'product'} to cart`,
          'product',
          product.id,
          JSON.stringify({ quantity: Math.floor(Math.random() * 5) + 1 })
        );
      });

      // Price negotiation for services
      if (recentServices.length > 0 && Math.random() > 0.5) {
        const service = recentServices[Math.floor(Math.random() * recentServices.length)];
        insertActivityLog.run(
          user.id,
          'price_negotiation',
          `Negotiated price for service`,
          'service',
          service.id,
          JSON.stringify({ original_price: 100, negotiated_price: 85, approved: true })
        );
      }

      // Cart activities
      for (let i = 0; i < 3; i++) {
        insertActivityLog.run(
          user.id,
          'cart',
          `Updated cart items`,
          null,
          null,
          JSON.stringify({ items_count: Math.floor(Math.random() * 10) + 1 })
        );
      }
    }

    // Admin activities
    if (user.role === 'admin' || user.role === 'super_admin') {
      insertActivityLog.run(
        user.id,
        'login',
        `Logged into admin dashboard`,
        null,
        null,
        JSON.stringify({ ip: '192.168.1.100', user_agent: 'Mozilla/5.0' })
      );

      // View product details
      recentProducts.slice(0, 3).forEach((product) => {
        insertActivityLog.run(
          user.id,
          'product',
          `Viewed product details`,
          'product',
          product.id,
          JSON.stringify({ action: 'view' })
        );
      });
    }

    // Logout activity
    const logoutDate = new Date();
    logoutDate.setHours(logoutDate.getHours() - Math.floor(Math.random() * 8));
    insertActivityLog.run(
      user.id,
      'logout',
      `Logged out of system`,
      null,
      null,
      JSON.stringify({ ip: '192.168.1.100' })
    );
  });

  console.log(`✅ Seeded activity logs for ${users.length} users`);
} else {
  console.log('⚠️  No users found, skipping activity logs seeding');
}
console.log(`💰 Added ${demoSales.length} sales`);
console.log(`⚠️  Added 3 low stock alerts`);
console.log(`📁 Database created at: ${dbPath}`);

db.close();
