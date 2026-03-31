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

// Format work shift as JSON string
function formatWorkShift(name, start, end) {
  if (!name && !start && !end) return null;
  if (start && end) {
    return JSON.stringify({ name: name || '', start, end });
  }
  if (name) {
    return name;
  }
  return null;
}

// Get default permissions for each role
function getDefaultPermissions(role) {
  const basePermissions = ['view_alerts'];
  
  switch (role) {
    case 'super_admin':
      return [
        'access_pos', 'edit_products', 'edit_services', 'manage_sales',
        'manage_inventory', 'view_analytics', 'manage_expenses', 'manage_users',
        'manage_employees', 'manage_stores', 'edit_prices', 'access_admin',
        'manage_themes', 'view_alerts'
      ];
    case 'admin':
      return [
        'access_pos', 'edit_products', 'edit_services', 'manage_sales',
        'manage_inventory', 'view_analytics', 'manage_expenses', 'manage_employees',
        'edit_prices', 'access_admin', 'view_alerts'
      ];
    case 'manager':
      return [
        'access_pos', 'edit_products', 'edit_services', 'manage_sales',
        'manage_inventory', 'view_analytics', 'manage_expenses', 'edit_prices',
        'access_admin', 'view_alerts'
      ];
    case 'assistant_manager':
      return [
        'access_pos', 'edit_products', 'manage_sales', 'manage_inventory',
        'view_analytics', 'edit_prices', 'access_admin', 'view_alerts'
      ];
    case 'supervisor':
      return [
        'access_pos', 'edit_products', 'manage_sales', 'manage_inventory',
        'view_analytics', 'view_alerts'
      ];
    case 'cashier':
      return [
        'access_pos', 'manage_sales', 'view_alerts'
      ];
    case 'sales_associate':
      return [
        'access_pos', 'manage_sales', 'view_alerts'
      ];
    case 'inventory_clerk':
      return [
        'manage_inventory', 'edit_products', 'view_alerts'
      ];
    case 'security':
      return ['view_alerts'];
    case 'maintenance':
      return ['view_alerts'];
    default:
      return basePermissions;
  }
}

async function seedEmployees() {
  try {
    console.log('🌱 Seeding employees for all roles...');

    // Ensure permissions column exists and remove role constraint
    try {
      const userCols = db.prepare('PRAGMA table_info(users)').all();
      const hasPermissions = userCols.some(col => col.name === 'permissions');
      
      // Check if role constraint exists (SQLite doesn't allow direct modification of CHECK constraints)
      // We need to recreate the table without the constraint
      const tableInfo = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='users'`).get();
      if (tableInfo && tableInfo.sql && tableInfo.sql.includes("CHECK(role IN ('super_admin', 'admin', 'cashier'))")) {
        console.log('🔧 Removing role constraint from users table...');
        
        // Create new table without constraint
        db.exec(`
          CREATE TABLE users_new (
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
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            permissions TEXT
          )
        `);
        
        // Copy data
        db.exec(`
          INSERT INTO users_new (id, username, email, password_hash, full_name, role, salary, work_shift, hire_date, is_active, created_at, updated_at, permissions)
          SELECT id, username, email, password_hash, full_name, role, 
                 COALESCE(salary, 0), work_shift, hire_date, is_active, created_at, updated_at, NULL
          FROM users
        `);
        
        // Drop old table and rename new one
        db.exec('DROP TABLE users');
        db.exec('ALTER TABLE users_new RENAME TO users');
        
        console.log('✅ Removed role constraint from users table');
      } else if (!hasPermissions) {
        db.exec(`ALTER TABLE users ADD COLUMN permissions TEXT;`);
        console.log('✅ Added permissions column to users table');
      }
    } catch (error) {
      console.error('Could not check/add permissions column:', error);
      throw error;
    }

    // Get or create a default store
    let store = db.prepare('SELECT id FROM stores LIMIT 1').get();
    if (!store) {
      const storeResult = db.prepare(`
        INSERT INTO stores (name, address, phone, email, is_active)
        VALUES (?, ?, ?, ?, ?)
      `).run('Main Store', '123 Main Street', '+254700000000', 'store@example.com', 1);
      store = { id: storeResult.lastInsertRowid };
    }
    const storeId = store.id;
    console.log(`✅ Using store ID: ${storeId}`);

    // Check if employees already exist (excluding the default super_admin, admin, cashier from seed-auth.js)
    const existingEmployees = db.prepare(`
      SELECT COUNT(*) as count FROM users 
      WHERE role IN ('manager', 'supervisor', 'assistant_manager', 'sales_associate', 'inventory_clerk', 'security', 'maintenance')
    `).get();
    
    if (existingEmployees.count > 0) {
      console.log('📊 Employees for additional roles already exist, skipping seed');
      return;
    }

    const defaultPassword = await hashPassword('employee123');
    const defaultHireDate = new Date().toISOString();

    // Define employees for each role
    const employees = [
      // Manager
      {
        username: 'manager1',
        email: 'manager1@example.com',
        full_name: 'John Manager',
        role: 'manager',
        salary: 120000,
        workShift: formatWorkShift('Day Shift', '08:00', '17:00'),
        hireDate: new Date('2023-01-15').toISOString(),
        permissions: getDefaultPermissions('manager'),
        isActive: true
      },
      {
        username: 'manager2',
        email: 'manager2@example.com',
        full_name: 'Sarah Manager',
        role: 'manager',
        salary: 115000,
        workShift: formatWorkShift('Evening Shift', '14:00', '23:00'),
        hireDate: new Date('2023-03-20').toISOString(),
        permissions: getDefaultPermissions('manager'),
        isActive: true
      },
      
      // Assistant Manager
      {
        username: 'assistant_manager1',
        email: 'assistant1@example.com',
        full_name: 'Michael Assistant',
        role: 'assistant_manager',
        salary: 95000,
        workShift: formatWorkShift('Morning Shift', '06:00', '15:00'),
        hireDate: new Date('2023-02-10').toISOString(),
        permissions: getDefaultPermissions('assistant_manager'),
        isActive: true
      },
      {
        username: 'assistant_manager2',
        email: 'assistant2@example.com',
        full_name: 'Emily Assistant',
        role: 'assistant_manager',
        salary: 92000,
        workShift: formatWorkShift('Day Shift', '08:00', '17:00'),
        hireDate: new Date('2023-04-05').toISOString(),
        permissions: getDefaultPermissions('assistant_manager'),
        isActive: true
      },
      
      // Supervisor
      {
        username: 'supervisor1',
        email: 'supervisor1@example.com',
        full_name: 'David Supervisor',
        role: 'supervisor',
        salary: 75000,
        workShift: formatWorkShift('Day Shift', '08:00', '17:00'),
        hireDate: new Date('2023-05-12').toISOString(),
        permissions: getDefaultPermissions('supervisor'),
        isActive: true
      },
      {
        username: 'supervisor2',
        email: 'supervisor2@example.com',
        full_name: 'Lisa Supervisor',
        role: 'supervisor',
        salary: 73000,
        workShift: formatWorkShift('Evening Shift', '14:00', '23:00'),
        hireDate: new Date('2023-06-18').toISOString(),
        permissions: getDefaultPermissions('supervisor'),
        isActive: true
      },
      
      // Sales Associate
      {
        username: 'sales_associate1',
        email: 'sales1@example.com',
        full_name: 'James Sales',
        role: 'sales_associate',
        salary: 50000,
        workShift: formatWorkShift('Day Shift', '08:00', '17:00'),
        hireDate: new Date('2023-07-01').toISOString(),
        permissions: getDefaultPermissions('sales_associate'),
        isActive: true
      },
      {
        username: 'sales_associate2',
        email: 'sales2@example.com',
        full_name: 'Maria Sales',
        role: 'sales_associate',
        salary: 48000,
        workShift: formatWorkShift('Evening Shift', '14:00', '23:00'),
        hireDate: new Date('2023-08-15').toISOString(),
        permissions: getDefaultPermissions('sales_associate'),
        isActive: true
      },
      {
        username: 'sales_associate3',
        email: 'sales3@example.com',
        full_name: 'Robert Sales',
        role: 'sales_associate',
        salary: 52000,
        workShift: formatWorkShift('Morning Shift', '06:00', '15:00'),
        hireDate: new Date('2023-09-20').toISOString(),
        permissions: getDefaultPermissions('sales_associate'),
        isActive: true
      },
      
      // Inventory Clerk
      {
        username: 'inventory_clerk1',
        email: 'inventory1@example.com',
        full_name: 'Patricia Inventory',
        role: 'inventory_clerk',
        salary: 45000,
        workShift: formatWorkShift('Day Shift', '08:00', '17:00'),
        hireDate: new Date('2023-10-05').toISOString(),
        permissions: getDefaultPermissions('inventory_clerk'),
        isActive: true
      },
      {
        username: 'inventory_clerk2',
        email: 'inventory2@example.com',
        full_name: 'William Inventory',
        role: 'inventory_clerk',
        salary: 47000,
        workShift: formatWorkShift('Morning Shift', '06:00', '15:00'),
        hireDate: new Date('2023-11-10').toISOString(),
        permissions: getDefaultPermissions('inventory_clerk'),
        isActive: true
      },
      
      // Security
      {
        username: 'security1',
        email: 'security1@example.com',
        full_name: 'Thomas Security',
        role: 'security',
        salary: 40000,
        workShift: formatWorkShift('Night Shift', '22:00', '06:00'),
        hireDate: new Date('2023-12-01').toISOString(),
        permissions: getDefaultPermissions('security'),
        isActive: true
      },
      {
        username: 'security2',
        email: 'security2@example.com',
        full_name: 'Jennifer Security',
        role: 'security',
        salary: 42000,
        workShift: formatWorkShift('Day Shift', '08:00', '17:00'),
        hireDate: new Date('2024-01-15').toISOString(),
        permissions: getDefaultPermissions('security'),
        isActive: true
      },
      
      // Maintenance
      {
        username: 'maintenance1',
        email: 'maintenance1@example.com',
        full_name: 'Charles Maintenance',
        role: 'maintenance',
        salary: 43000,
        workShift: formatWorkShift('Day Shift', '08:00', '17:00'),
        hireDate: new Date('2024-02-20').toISOString(),
        permissions: getDefaultPermissions('maintenance'),
        isActive: true
      },
      {
        username: 'maintenance2',
        email: 'maintenance2@example.com',
        full_name: 'Nancy Maintenance',
        role: 'maintenance',
        salary: 41000,
        workShift: formatWorkShift('Evening Shift', '14:00', '23:00'),
        hireDate: new Date('2024-03-10').toISOString(),
        permissions: getDefaultPermissions('maintenance'),
        isActive: true
      },
      
      // Add one deactivated employee for testing
      {
        username: 'fired_employee1',
        email: 'fired1@example.com',
        full_name: 'Fired Employee',
        role: 'cashier',
        salary: 0,
        workShift: formatWorkShift('Day Shift', '08:00', '17:00'),
        hireDate: new Date('2023-01-01').toISOString(),
        permissions: getDefaultPermissions('cashier'),
        isActive: false
      }
    ];

    // Insert employees
    const insertUser = db.prepare(`
      INSERT INTO users (
        username, email, password_hash, full_name, role, 
        salary, work_shift, hire_date, permissions, is_active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertUserStore = db.prepare(`
      INSERT INTO user_stores (user_id, store_id, is_primary)
      VALUES (?, ?, ?)
    `);

    for (const employee of employees) {
      const permissionsJson = JSON.stringify(employee.permissions);
      
      const result = insertUser.run(
        employee.username,
        employee.email,
        defaultPassword,
        employee.full_name,
        employee.role,
        employee.salary,
        employee.workShift,
        employee.hireDate,
        permissionsJson,
        employee.isActive ? 1 : 0
      );

      const userId = result.lastInsertRowid;
      console.log(`✅ Created ${employee.role}: ${employee.full_name} (ID: ${userId}, username: ${employee.username})`);

      // Link employee to store
      insertUserStore.run(userId, storeId, 1);
      console.log(`   Linked to store ${storeId}`);
    }

    console.log(`\n✅ Successfully seeded ${employees.length} employees!`);
    console.log('\n📝 Default password for all employees: employee123');
    console.log('   (Super Admin, Admin, and Cashier from seed-auth.js use different passwords)');
  } catch (error) {
    console.error('❌ Error seeding employees:', error);
    throw error;
  }
}

seedEmployees()
  .then(() => {
    db.close();
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    db.close();
    process.exit(1);
  });

