import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { hash } from 'argon2';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create database connection
const dbPath = path.join(__dirname, '../pos_database.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Hash password function
async function hashPassword(password) {
  return await hash(password);
}

async function seedAuth() {
  try {
    console.log('🌱 Seeding authentication data...');

    // Initialize database tables first
    console.log('📦 Initializing database tables...');
    
    // Create stores table
    db.exec(`
      CREATE TABLE IF NOT EXISTS stores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        address TEXT,
        phone TEXT,
        email TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create users table
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create user_stores table
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_stores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        store_id INTEGER NOT NULL,
        is_primary BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE,
        UNIQUE(user_id, store_id)
      )
    `);

    // Create sessions table
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        store_id INTEGER,
        session_token TEXT UNIQUE NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE SET NULL
      )
    `);

    console.log('✅ Database tables initialized');

    // Check if users already exist
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
    
    if (userCount.count > 0) {
      console.log('📊 Users already exist, skipping seed');
      return;
    }

    // Create a default store
    const storeResult = db.prepare(`
      INSERT INTO stores (name, address, phone, email, is_active)
      VALUES (?, ?, ?, ?, ?)
    `).run('Main Store', '123 Main Street', '+254700000000', 'store@example.com', 1);

    const storeId = storeResult.lastInsertRowid;
    console.log(`✅ Created store: ${storeId}`);

    // Create super admin user
    const superAdminPassword = await hashPassword('admin123');
    const superAdminResult = db.prepare(`
      INSERT INTO users (username, email, password_hash, full_name, role, salary, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('superadmin', 'superadmin@example.com', superAdminPassword, 'Super Admin', 'super_admin', 150000, 1);

    const superAdminId = superAdminResult.lastInsertRowid;
    console.log(`✅ Created super admin: ${superAdminId} (username: superadmin, password: admin123)`);

    // Create admin user for the store
    const adminPassword = await hashPassword('admin123');
    const adminResult = db.prepare(`
      INSERT INTO users (username, email, password_hash, full_name, role, salary, work_shift, hire_date, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('admin', 'admin@example.com', adminPassword, 'Store Admin', 'admin', 80000, 'Day Shift', new Date().toISOString(), 1);

    const adminId = adminResult.lastInsertRowid;
    console.log(`✅ Created admin: ${adminId} (username: admin, password: admin123)`);

    // Link admin to store
    db.prepare(`
      INSERT INTO user_stores (user_id, store_id, is_primary)
      VALUES (?, ?, ?)
    `).run(adminId, storeId, 1);
    console.log(`✅ Linked admin to store`);

    // Create cashier user for the store
    const cashierPassword = await hashPassword('cashier123');
    const cashierResult = db.prepare(`
      INSERT INTO users (username, email, password_hash, full_name, role, salary, work_shift, hire_date, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('cashier', 'cashier@example.com', cashierPassword, 'Cashier User', 'cashier', 45000, 'Day Shift', new Date().toISOString(), 1);

    const cashierId = cashierResult.lastInsertRowid;
    console.log(`✅ Created cashier: ${cashierId} (username: cashier, password: cashier123)`);

    // Link cashier to store
    db.prepare(`
      INSERT INTO user_stores (user_id, store_id, is_primary)
      VALUES (?, ?, ?)
    `).run(cashierId, storeId, 1);
    console.log(`✅ Linked cashier to store`);

    console.log('✅ Authentication data seeded successfully!');
    console.log('\n📝 Default credentials:');
    console.log('   Super Admin: username=superadmin, password=admin123');
    console.log('   Admin: username=admin, password=admin123');
    console.log('   Cashier: username=cashier, password=cashier123');
  } catch (error) {
    console.error('❌ Error seeding authentication data:', error);
    throw error;
  }
}

seedAuth()
  .then(() => {
    db.close();
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    db.close();
    process.exit(1);
  });

