import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create database in the project root
const dbPath = path.join(__dirname, '../../pos_database.db');
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
    product_id INTEGER NOT NULL,
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

// Clear existing data
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

for (const product of demoProducts) {
  insertProduct.run(...product);
}

// Insert some demo sales
const insertSale = db.prepare(`
  INSERT INTO sales (total_amount, payment_method)
  VALUES (?, ?)
`);

const insertSaleItem = db.prepare(`
  INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price)
  VALUES (?, ?, ?, ?, ?)
`);

// Create some demo sales
const demoSales = [
  {
    total: 150.00,
    payment_method: 'cash',
    items: [
      { product_name: 'Coca Cola 500ml', quantity: 2, unit_price: 50.00 },
      { product_name: 'Bread Loaf', quantity: 1, unit_price: 30.00 },
      { product_name: 'Chocolate Bar', quantity: 2, unit_price: 25.00 }
    ]
  },
  {
    total: 200.00,
    payment_method: 'mpesa',
    items: [
      { product_name: 'Milk 1L', quantity: 1, unit_price: 80.00 },
      { product_name: 'Rice 1kg', quantity: 1, unit_price: 120.00 }
    ]
  },
  {
    total: 85.00,
    payment_method: 'cash',
    items: [
      { product_name: 'Mineral Water 500ml', quantity: 3, unit_price: 20.00 },
      { product_name: 'Tea Bags 50pcs', quantity: 1, unit_price: 25.00 }
    ]
  }
];

for (const sale of demoSales) {
  const saleResult = insertSale.run(sale.total, sale.payment_method);
  const saleId = saleResult.lastInsertRowid;
  
  for (const item of sale.items) {
    // Use the actual product IDs from the inserted products
    const product = await db.prepare('SELECT id FROM products WHERE name = ?').get(item.product_name);
    if (product) {
      insertSaleItem.run(saleId, product.id, item.quantity, item.unit_price, item.quantity * item.unit_price);
    }
  }
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
console.log(`💰 Added ${demoSales.length} sales`);
console.log(`⚠️  Added 3 low stock alerts`);
console.log(`📁 Database created at: ${dbPath}`);

db.close();
