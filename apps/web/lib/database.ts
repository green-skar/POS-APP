import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create database in the project root for easy access
const dbPath = path.join(__dirname, '../pos_database.db');

export const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
export function initializeDatabase() {
  // Products table
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

  // Sales table
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

  // Sale items table
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

  // Alerts table
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

  // Add missing columns to existing tables
  try {
    // Add mpesa_transaction_id to sales table if it doesn't exist
    db.exec(`
      ALTER TABLE sales ADD COLUMN mpesa_transaction_id TEXT;
    `);
  } catch (error) {
    // Column might already exist, ignore error
  }

  try {
    // Add payment_status to sales table if it doesn't exist
    db.exec(`
      ALTER TABLE sales ADD COLUMN payment_status TEXT DEFAULT 'completed';
    `);
  } catch (error) {
    // Column might already exist, ignore error
  }

  try {
    // Add is_read to alerts table if it doesn't exist
    db.exec(`
      ALTER TABLE alerts ADD COLUMN is_read BOOLEAN DEFAULT FALSE;
    `);
  } catch (error) {
    // Column might already exist, ignore error
  }

  console.log('✅ Database initialized successfully');
}

// Initialize database on import
initializeDatabase();

// Sample data for development
export function seedDatabase() {
  // Check if products already exist
  const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };
  
  if (productCount.count === 0) {
    console.log('🌱 Seeding database with sample data...');
    
    // Insert sample products
    const insertProduct = db.prepare(`
      INSERT INTO products (name, barcode, price, stock_quantity, min_stock_level, category, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const sampleProducts = [
      ['Coca Cola 500ml', '1234567890123', 50.00, 100, 10, 'Beverages', 'Refreshing soft drink'],
      ['Bread Loaf', '1234567890124', 30.00, 50, 5, 'Food', 'Fresh white bread'],
      ['Milk 1L', '1234567890125', 80.00, 25, 5, 'Dairy', 'Fresh whole milk'],
      ['Chocolate Bar', '1234567890126', 25.00, 200, 20, 'Snacks', 'Milk chocolate bar'],
      ['Mineral Water 500ml', '1234567890127', 20.00, 150, 15, 'Beverages', 'Pure mineral water'],
      ['Rice 1kg', '1234567890128', 120.00, 30, 5, 'Food', 'Basmati rice'],
      ['Cooking Oil 1L', '1234567890129', 200.00, 15, 3, 'Cooking', 'Vegetable cooking oil'],
      ['Sugar 1kg', '1234567890130', 80.00, 40, 5, 'Food', 'White granulated sugar'],
      ['Tea Bags 50pcs', '1234567890131', 150.00, 20, 5, 'Beverages', 'Black tea bags'],
      ['Soap Bar', '1234567890132', 35.00, 60, 10, 'Personal Care', 'Antibacterial soap']
    ];

    for (const product of sampleProducts) {
      insertProduct.run(...product);
    }

    console.log('✅ Sample data added successfully');
  } else {
    console.log('📊 Database already has data, skipping seed');
  }
}

// Seed database on import
seedDatabase();

export default db;
