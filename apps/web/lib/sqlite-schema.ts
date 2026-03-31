import type Database from 'better-sqlite3';

/**
 * Canonical SQLite DDL and migrations for the POS app.
 * Call once per Database connection that uses resolvePosDatabasePath().
 */
export function applyDatabaseSchema(database: Database): void {
  // Products table
  database.exec(`
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
  database.exec(`
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
  database.exec(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      product_id INTEGER,
      service_id INTEGER,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      FOREIGN KEY (sale_id) REFERENCES sales (id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services (id) ON DELETE CASCADE
    )
  `);

  // Alerts table
  database.exec(`
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

  // Services table
  database.exec(`
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

  // Expenses table
  database.exec(`
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

  // Product costs table (to track purchase costs)
  database.exec(`
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

  // Returns table (to track returned items from completed sales)
  database.exec(`
    CREATE TABLE IF NOT EXISTS returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      sale_item_id INTEGER NOT NULL,
      product_id INTEGER,
      service_id INTEGER,
      quantity INTEGER NOT NULL,
      return_reason TEXT,
      return_amount REAL,
      return_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sale_id) REFERENCES sales (id) ON DELETE CASCADE,
      FOREIGN KEY (sale_item_id) REFERENCES sale_items (id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL,
      FOREIGN KEY (service_id) REFERENCES services (id) ON DELETE SET NULL
    )
  `);

  // M-Pesa checkout mapping table (to map checkout request IDs to sales)
  database.exec(`
    CREATE TABLE IF NOT EXISTS mpesa_checkout_mapping (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      checkout_request_id TEXT UNIQUE NOT NULL,
      sale_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sale_id) REFERENCES sales (id) ON DELETE CASCADE
    )
  `);

  // Stores table
  database.exec(`
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

  // Users table
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL,
      salary REAL DEFAULT 0,
      work_shift TEXT,
      hire_date DATETIME,
      is_active BOOLEAN DEFAULT TRUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // User stores table (many-to-many relationship for admins and cashiers)
  database.exec(`
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

  // Sessions table for authentication
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      store_id INTEGER,
      session_token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE SET NULL
    )
  `);
  
  // Add last_activity column if it doesn't exist (for existing databases)
  try {
    database.exec(`ALTER TABLE sessions ADD COLUMN last_activity DATETIME DEFAULT CURRENT_TIMESTAMP`);
  } catch (error) {
    // Column might already exist, ignore error
  }

  // Add store_id to sales table
  try {
    database.exec(`
      ALTER TABLE sales ADD COLUMN store_id INTEGER;
    `);
  } catch (error) {
    // Column might already exist, ignore error
  }

  try {
    database.exec(`
      ALTER TABLE sales ADD COLUMN user_id INTEGER;
    `);
  } catch (error) {
    // Column might already exist, ignore error
  }

  // Add store_id to products table
  try {
    const productCols = database.prepare('PRAGMA table_info(products)').all() as any[];
    const hasProductStoreId = productCols.some(col => col.name === 'store_id');
    const hasExpiryDate = productCols.some(col => col.name === 'expiry_date');
    if (!hasProductStoreId) {
      database.exec(`ALTER TABLE products ADD COLUMN store_id INTEGER;`);
      console.log('✅ Added store_id column to products table');
    }
    if (!hasExpiryDate) {
      database.exec(`ALTER TABLE products ADD COLUMN expiry_date TEXT;`);
      console.log('✅ Added expiry_date column to products table');
    }
  } catch (error) {
    console.error('Could not add store_id to products:', error);
  }

  // Add store_id to services table
  try {
    const serviceCols = database.prepare('PRAGMA table_info(services)').all() as any[];
    const hasServiceStoreId = serviceCols.some(col => col.name === 'store_id');
    if (!hasServiceStoreId) {
      database.exec(`ALTER TABLE services ADD COLUMN store_id INTEGER;`);
      console.log('✅ Added store_id column to services table');
    }
  } catch (error) {
    console.error('Could not add store_id to services:', error);
  }

  // Add salary, work_shift, hire_date, permissions to users table
  try {
    const userCols = database.prepare('PRAGMA table_info(users)').all() as any[];
    const hasSalary = userCols.some(col => col.name === 'salary');
    const hasWorkShift = userCols.some(col => col.name === 'work_shift');
    const hasHireDate = userCols.some(col => col.name === 'hire_date');
    const hasPermissions = userCols.some(col => col.name === 'permissions');
    
    if (!hasSalary) {
      database.exec(`ALTER TABLE users ADD COLUMN salary REAL DEFAULT 0;`);
      console.log('✅ Added salary column to users table');
    }
    if (!hasWorkShift) {
      database.exec(`ALTER TABLE users ADD COLUMN work_shift TEXT;`);
      console.log('✅ Added work_shift column to users table');
    }
    if (!hasHireDate) {
      database.exec(`ALTER TABLE users ADD COLUMN hire_date DATETIME;`);
      console.log('✅ Added hire_date column to users table');
    }
    if (!hasPermissions) {
      database.exec(`ALTER TABLE users ADD COLUMN permissions TEXT;`);
      console.log('✅ Added permissions column to users table');
    }
  } catch (error) {
    console.error('Could not add employee fields to users:', error);
  }

  // Add store_id to sales table (if not exists)
  try {
    const salesCols = database.prepare('PRAGMA table_info(sales)').all() as any[];
    const hasSalesStoreId = salesCols.some(col => col.name === 'store_id');
    if (!hasSalesStoreId) {
      database.exec(`ALTER TABLE sales ADD COLUMN store_id INTEGER;`);
      console.log('✅ Added store_id column to sales table');
    }
  } catch (error) {
    console.error('Could not add store_id to sales:', error);
  }

  // Add missing columns to existing tables
  try {
    // Add mpesa_transaction_id to sales table if it doesn't exist
    database.exec(`
      ALTER TABLE sales ADD COLUMN mpesa_transaction_id TEXT;
    `);
  } catch (error) {
    // Column might already exist, ignore error
  }

  try {
    // Add payment_status to sales table if it doesn't exist
    database.exec(`
      ALTER TABLE sales ADD COLUMN payment_status TEXT DEFAULT 'completed';
    `);
  } catch (error) {
    // Column might already exist, ignore error
  }

  try {
    database.exec(`ALTER TABLE sales ADD COLUMN mpesa_payer_name TEXT;`);
  } catch (error) {
    // Column might already exist
  }

  try {
    // Add is_read to alerts table if it doesn't exist
    database.exec(`
      ALTER TABLE alerts ADD COLUMN is_read BOOLEAN DEFAULT FALSE;
    `);
  } catch (error) {
    // Column might already exist, ignore error
  }

  // Add price_type and price_config to services table if it exists
  try {
    database.exec(`
      ALTER TABLE services ADD COLUMN price_type TEXT DEFAULT 'fixed';
    `);
  } catch (error) {
    // Column might already exist, ignore error
  }

  try {
    database.exec(`
      ALTER TABLE services ADD COLUMN price_config TEXT;
    `);
  } catch (error) {
    // Column might already exist, ignore error
  }

  // Add cost_price to products table if it doesn't exist
  try {
    database.exec(`
      ALTER TABLE products ADD COLUMN cost_price REAL;
    `);
  } catch (error) {
    // Column might already exist, ignore error
  }

  // Add period_start and period_end to expenses table if they don't exist
  try {
    database.exec(`
      ALTER TABLE expenses ADD COLUMN period_start DATETIME;
    `);
  } catch (error) {
    // Column might already exist, ignore error
  }

  try {
    database.exec(`
      ALTER TABLE expenses ADD COLUMN period_end DATETIME;
    `);
  } catch (error) {
    // Column might already exist, ignore error
  }

  // --- sale_items migration: Ensure service_id column exists and product_id/service_id can be NULL ---
  try {
    const saleItemsCols = database.prepare('PRAGMA table_info(sale_items)').all();
    const hasServiceId = saleItemsCols.some((c) => c.name === 'service_id');
    const hasServiceName = saleItemsCols.some((c) => c.name === 'service_name');
    
    // Check if product_id has NOT NULL constraint
    const productIdCol = saleItemsCols.find((c) => c.name === 'product_id');
    const productIdNotNull = productIdCol && (productIdCol as any).notnull === 1;
    
    // If product_id is NOT NULL or service_id doesn't exist, we need to recreate the table
    if (productIdNotNull || !hasServiceId) {
      console.log(`🔧 Migrating sale_items table: productIdNotNull=${productIdNotNull}, hasServiceId=${hasServiceId}`);
      const tableExists = database.prepare('SELECT name FROM sqlite_master WHERE type="table" AND name="sale_items"').get();
      if (tableExists) {
        // Create new table with correct schema (both product_id and service_id nullable)
        database.exec(`
          CREATE TABLE sale_items_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sale_id INTEGER NOT NULL,
            product_id INTEGER,
            service_id INTEGER,
            quantity INTEGER NOT NULL,
            unit_price REAL NOT NULL,
            total_price REAL NOT NULL,
            FOREIGN KEY (sale_id) REFERENCES sales (id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
            FOREIGN KEY (service_id) REFERENCES services (id) ON DELETE CASCADE
          )
        `);
        
        // Migrate existing data
        if (hasServiceName) {
          // Migrate from service_name to service_id
          database.exec(`
            INSERT INTO sale_items_new (id, sale_id, product_id, service_id, quantity, unit_price, total_price)
            SELECT id, sale_id, product_id, NULL, quantity, unit_price, total_price FROM sale_items
          `);
        } else if (hasServiceId) {
          // Just copy existing data
          database.exec(`
            INSERT INTO sale_items_new (id, sale_id, product_id, service_id, quantity, unit_price, total_price)
            SELECT id, sale_id, product_id, service_id, quantity, unit_price, total_price FROM sale_items
          `);
        } else {
          // Copy existing data without service_id (will be NULL)
          database.exec(`
            INSERT INTO sale_items_new (id, sale_id, product_id, service_id, quantity, unit_price, total_price)
            SELECT id, sale_id, product_id, NULL, quantity, unit_price, total_price FROM sale_items
          `);
        }
        
        // Replace old table
        database.exec('DROP TABLE sale_items');
        database.exec('ALTER TABLE sale_items_new RENAME TO sale_items');
        console.log('✅ Migrated sale_items table - product_id and service_id are now nullable');
      }
    } else if (!hasServiceId) {
      // Just add service_id column if it doesn't exist
      database.exec('ALTER TABLE sale_items ADD COLUMN service_id INTEGER');
      console.log('✅ Added service_id column to sale_items');
    }
  } catch (err) {
    console.error('Could not upgrade sale_items:', err);
    // If migration fails, try to ensure the column exists at least
    try {
      const cols = database.prepare('PRAGMA table_info(sale_items)').all();
      const hasServiceId = cols.some((c) => c.name === 'service_id');
      if (!hasServiceId) {
        database.exec('ALTER TABLE sale_items ADD COLUMN service_id INTEGER');
      }
    } catch (e) {
      console.error('Failed to add service_id column:', e);
    }
  }

  // User activity logs table
  database.exec(`
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

  // Create index for faster queries
  try {
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_id ON user_activity_logs(user_id);
    `);
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_user_activity_logs_created_at ON user_activity_logs(created_at);
    `);
  } catch (error) {
    // Index might already exist, ignore error
  }

  // Activity log table for tracking deleted and modified items
  database.exec(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      action_data TEXT,
      deleted_data TEXT,
      modified_data TEXT,
      performed_by INTEGER,
      performed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      permanent_delete_at DATETIME,
      is_undone BOOLEAN DEFAULT 0,
      undone_at DATETIME,
      FOREIGN KEY (performed_by) REFERENCES users(id)
    )
  `);

  // Settings table for activity log configuration
  database.exec(`
    CREATE TABLE IF NOT EXISTS activity_log_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_key TEXT UNIQUE NOT NULL,
      setting_value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Initialize default settings if not exists
  try {
    const defaultRetentionDays = database.prepare('SELECT * FROM activity_log_settings WHERE setting_key = ?').get('retention_days');
    if (!defaultRetentionDays) {
      database.prepare('INSERT INTO activity_log_settings (setting_key, setting_value) VALUES (?, ?)').run('retention_days', '30');
      database.prepare('INSERT INTO activity_log_settings (setting_key, setting_value) VALUES (?, ?)').run('alert_days_before', '7');
    }
  } catch (error) {
    // Settings might already exist, ignore error
  }

  // FIFO-style inventory cost layers (buying price per receipt batch)
  database.exec(`
    CREATE TABLE IF NOT EXISTS inventory_lots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      quantity_remaining INTEGER NOT NULL,
      unit_cost REAL NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
    )
  `);

  try {
    database.exec(`ALTER TABLE sale_items ADD COLUMN cogs_amount REAL`);
  } catch {
    /* column exists */
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS network_workstations (
      workstation_id TEXT PRIMARY KEY NOT NULL,
      workstation_name TEXT,
      hostname TEXT,
      role TEXT,
      last_ip TEXT,
      last_url TEXT,
      mac_address TEXT,
      suspended INTEGER DEFAULT 0,
      suspend_reason TEXT,
      first_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('✅ Database initialized successfully');
}
