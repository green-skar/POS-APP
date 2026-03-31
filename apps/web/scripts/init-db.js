import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'pos_database.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

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
    cost_price REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    total_amount REAL NOT NULL,
    payment_method TEXT NOT NULL,
    payment_status TEXT DEFAULT 'completed',
    mpesa_transaction_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// --- Canonical sale_items migration ---
try {
  const saleItemsCols = db.prepare('PRAGMA table_info(sale_items)').all();
  const hasServiceName = saleItemsCols.some((c) => c.name === 'service_name');
  if (!hasServiceName) {
    // Upgrade: create new table, copy data, drop old/rename new
    db.exec(`
      CREATE TABLE IF NOT EXISTS sale_items_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL,
        product_id INTEGER,
        service_name TEXT,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        total_price REAL NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES sales (id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
      );
    `);
    const exists = db.prepare('SELECT name FROM sqlite_master WHERE type="table" AND name="sale_items"').get();
    if (exists) {
      // Copy previous product sales (service_name=NULL)
      db.exec(`
        INSERT INTO sale_items_new (id, sale_id, product_id, service_name, quantity, unit_price, total_price)
        SELECT id, sale_id, product_id, NULL, quantity, unit_price, total_price FROM sale_items;
      `);
      db.exec('DROP TABLE sale_items');
    }
    db.exec('ALTER TABLE sale_items_new RENAME TO sale_items');
    console.log('✅ Canonical sale_items schema: product_id or service_name');
  }
} catch (err) {
  console.error('Could not upgrade sale_items:', err);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    product_id INTEGER,
    is_read BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL,
    price_type TEXT DEFAULT 'fixed',
    price_config TEXT,
    description TEXT,
    duration INTEGER,
    features TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    date DATETIME NOT NULL,
    receipt_url TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS product_costs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    purchase_cost REAL NOT NULL,
    purchase_date DATETIME NOT NULL,
    supplier TEXT,
    batch_number TEXT,
    quantity INTEGER NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
  )
`);

// Check if products already exist
const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get();

if (productCount.count === 0) {
  console.log('🌱 Seeding database with sample data...');
  
  // Insert sample products with cost_price
  const insertProduct = db.prepare(`
    INSERT INTO products (name, barcode, price, stock_quantity, min_stock_level, category, description, cost_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const sampleProducts = [
    ['Coca Cola 500ml', '1234567890123', 50.00, 100, 10, 'Beverages', 'Refreshing soft drink', 25.00],
    ['Bread Loaf', '1234567890124', 30.00, 50, 5, 'Food', 'Fresh white bread', 15.00],
    ['Milk 1L', '1234567890125', 80.00, 25, 5, 'Dairy', 'Fresh whole milk', 50.00],
    ['Chocolate Bar', '1234567890126', 25.00, 200, 20, 'Snacks', 'Milk chocolate bar', 12.00],
    ['Mineral Water 500ml', '1234567890127', 20.00, 150, 15, 'Beverages', 'Pure mineral water', 10.00],
    ['Rice 1kg', '1234567890128', 120.00, 30, 5, 'Food', 'Basmati rice', 70.00],
    ['Cooking Oil 1L', '1234567890129', 200.00, 15, 3, 'Cooking', 'Vegetable cooking oil', 130.00],
    ['Sugar 1kg', '1234567890130', 80.00, 40, 5, 'Food', 'White granulated sugar', 45.00],
    ['Tea Bags 50pcs', '1234567890131', 150.00, 20, 5, 'Beverages', 'Black tea bags', 90.00],
    ['Soap Bar', '1234567890132', 35.00, 60, 10, 'Personal Care', 'Antibacterial soap', 18.00]
  ];

  for (const product of sampleProducts) {
    insertProduct.run(...product);
  }

  console.log('✅ Sample products added successfully');
}

// Check if expenses already exist
const expenseCount = db.prepare('SELECT COUNT(*) as count FROM expenses').get();

if (expenseCount.count === 0) {
  console.log('🌱 Seeding database with sample expenses...');
  
  const insertExpense = db.prepare(`
    INSERT INTO expenses (title, description, category, amount, date, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const sampleExpenses = [
    ['Rent Payment', 'Monthly shop rent', 'Rent', 5000.00, new Date().toISOString(), 'Monthly payment'],
    ['Electricity Bill', 'January electricity', 'Utilities', 300.00, new Date().toISOString(), 'Power consumption'],
    ['Water Bill', 'January water', 'Utilities', 150.00, new Date().toISOString(), 'Water usage'],
    ['Internet Service', 'Monthly internet subscription', 'Utilities', 50.00, new Date().toISOString(), 'ISP monthly fee'],
    ['Staff Salary', 'January staff payment', 'Salary', 3000.00, new Date().toISOString(), 'Monthly wages'],
    ['Marketing Campaign', 'Social media ads', 'Marketing', 500.00, new Date().toISOString(), 'Online advertising'],
    ['Equipment Maintenance', 'Printing machine repair', 'Maintenance', 200.00, new Date().toISOString(), 'Service call'],
  ];

  for (const expense of sampleExpenses) {
    insertExpense.run(...expense);
  }

  console.log('✅ Sample expenses added successfully');
}

console.log('✅ Database initialized successfully');
db.close();
