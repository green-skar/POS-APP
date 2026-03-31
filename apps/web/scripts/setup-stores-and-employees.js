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

async function setupStoresAndEmployees() {
  try {
    console.log('🏪 Setting up stores and distributing employees...');

    // Get or create stores
    let store1 = db.prepare('SELECT id FROM stores WHERE name = ?').get('Main Store');
    let store2 = db.prepare('SELECT id FROM stores WHERE name = ?').get('Downtown Branch');
    let store3 = db.prepare('SELECT id FROM stores WHERE name = ?').get('Mall Location');

    // Create store 1 if it doesn't exist
    if (!store1) {
      const result = db.prepare(`
        INSERT INTO stores (name, address, phone, email, is_active)
        VALUES (?, ?, ?, ?, ?)
      `).run('Main Store', '123 Main Street, City Center', '+1-555-0100', 'mainstore@example.com', 1);
      store1 = { id: result.lastInsertRowid };
      console.log(`✅ Created Store 1: Main Store (ID: ${store1.id})`);
    } else {
      console.log(`✅ Store 1 exists: Main Store (ID: ${store1.id})`);
    }

    // Create store 2
    if (!store2) {
      const result = db.prepare(`
        INSERT INTO stores (name, address, phone, email, is_active)
        VALUES (?, ?, ?, ?, ?)
      `).run('Downtown Branch', '456 Commerce Avenue, Downtown', '+1-555-0101', 'downtown@example.com', 1);
      store2 = { id: result.lastInsertRowid };
      console.log(`✅ Created Store 2: Downtown Branch (ID: ${store2.id})`);
    } else {
      console.log(`✅ Store 2 exists: Downtown Branch (ID: ${store2.id})`);
    }

    // Create store 3
    if (!store3) {
      const result = db.prepare(`
        INSERT INTO stores (name, address, phone, email, is_active)
        VALUES (?, ?, ?, ?, ?)
      `).run('Mall Location', '789 Shopping Plaza, West Mall', '+1-555-0102', 'mall@example.com', 1);
      store3 = { id: result.lastInsertRowid };
      console.log(`✅ Created Store 3: Mall Location (ID: ${store3.id})`);
    } else {
      console.log(`✅ Store 3 exists: Mall Location (ID: ${store3.id})`);
    }

    const defaultPassword = await hashPassword('employee123');

    // Delete existing user-store links (except super_admin)
    db.prepare('DELETE FROM user_stores WHERE user_id IN (SELECT id FROM users WHERE role != ?)').run('super_admin');
    console.log('✅ Cleared existing user-store links');

    // Employee distribution across 3 stores
    const employees = [
      // Store 1: Main Store
      { store: store1.id, role: 'admin', username: 'admin_main', email: 'admin.main@example.com', fullName: 'Sarah Johnson', salary: 85000, workShift: formatWorkShift('Day Shift', '08:00', '17:00'), hireDate: '2023-01-15', permissions: getDefaultPermissions('admin') },
      { store: store1.id, role: 'manager', username: 'manager1', email: 'john.manager@example.com', fullName: 'John Martinez', salary: 120000, workShift: formatWorkShift('Day Shift', '08:00', '17:00'), hireDate: '2023-01-15', permissions: getDefaultPermissions('manager') },
      { store: store1.id, role: 'assistant_manager', username: 'assistant_manager1', email: 'michael.assistant@example.com', fullName: 'Michael Chen', salary: 95000, workShift: formatWorkShift('Morning Shift', '06:00', '15:00'), hireDate: '2023-02-10', permissions: getDefaultPermissions('assistant_manager') },
      { store: store1.id, role: 'supervisor', username: 'supervisor1', email: 'david.supervisor@example.com', fullName: 'David Williams', salary: 75000, workShift: formatWorkShift('Day Shift', '08:00', '17:00'), hireDate: '2023-05-12', permissions: getDefaultPermissions('supervisor') },
      { store: store1.id, role: 'sales_associate', username: 'sales_associate1', email: 'james.sales@example.com', fullName: 'James Anderson', salary: 50000, workShift: formatWorkShift('Day Shift', '08:00', '17:00'), hireDate: '2023-07-01', permissions: getDefaultPermissions('sales_associate') },
      { store: store1.id, role: 'inventory_clerk', username: 'inventory_clerk1', email: 'patricia.inventory@example.com', fullName: 'Patricia Garcia', salary: 45000, workShift: formatWorkShift('Day Shift', '08:00', '17:00'), hireDate: '2023-10-05', permissions: getDefaultPermissions('inventory_clerk') },
      { store: store1.id, role: 'security', username: 'security1', email: 'thomas.security@example.com', fullName: 'Thomas Brown', salary: 40000, workShift: formatWorkShift('Night Shift', '22:00', '06:00'), hireDate: '2023-12-01', permissions: getDefaultPermissions('security') },
      { store: store1.id, role: 'maintenance', username: 'maintenance1', email: 'charles.maintenance@example.com', fullName: 'Charles Davis', salary: 43000, workShift: formatWorkShift('Day Shift', '08:00', '17:00'), hireDate: '2024-02-20', permissions: getDefaultPermissions('maintenance') },
      { store: store1.id, role: 'cashier', username: 'cashier_main', email: 'lisa.cashier@example.com', fullName: 'Lisa Taylor', salary: 45000, workShift: formatWorkShift('Day Shift', '08:00', '17:00'), hireDate: '2023-06-01', permissions: getDefaultPermissions('cashier') },

      // Store 2: Downtown Branch
      { store: store2.id, role: 'admin', username: 'admin_downtown', email: 'admin.downtown@example.com', fullName: 'Robert Wilson', salary: 88000, workShift: formatWorkShift('Day Shift', '08:00', '17:00'), hireDate: '2023-03-20', permissions: getDefaultPermissions('admin') },
      { store: store2.id, role: 'manager', username: 'manager2', email: 'sarah.manager@example.com', fullName: 'Sarah Thompson', salary: 115000, workShift: formatWorkShift('Evening Shift', '14:00', '23:00'), hireDate: '2023-03-20', permissions: getDefaultPermissions('manager') },
      { store: store2.id, role: 'assistant_manager', username: 'assistant_manager2', email: 'emily.assistant@example.com', fullName: 'Emily Rodriguez', salary: 92000, workShift: formatWorkShift('Day Shift', '08:00', '17:00'), hireDate: '2023-04-05', permissions: getDefaultPermissions('assistant_manager') },
      { store: store2.id, role: 'supervisor', username: 'supervisor2', email: 'lisa.supervisor@example.com', fullName: 'Lisa Martinez', salary: 73000, workShift: formatWorkShift('Evening Shift', '14:00', '23:00'), hireDate: '2023-06-18', permissions: getDefaultPermissions('supervisor') },
      { store: store2.id, role: 'sales_associate', username: 'sales_associate2', email: 'maria.sales@example.com', fullName: 'Maria Lopez', salary: 48000, workShift: formatWorkShift('Evening Shift', '14:00', '23:00'), hireDate: '2023-08-15', permissions: getDefaultPermissions('sales_associate') },
      { store: store2.id, role: 'inventory_clerk', username: 'inventory_clerk2', email: 'william.inventory@example.com', fullName: 'William Lee', salary: 47000, workShift: formatWorkShift('Morning Shift', '06:00', '15:00'), hireDate: '2023-11-10', permissions: getDefaultPermissions('inventory_clerk') },
      { store: store2.id, role: 'security', username: 'security2', email: 'jennifer.security@example.com', fullName: 'Jennifer White', salary: 42000, workShift: formatWorkShift('Day Shift', '08:00', '17:00'), hireDate: '2024-01-15', permissions: getDefaultPermissions('security') },
      { store: store2.id, role: 'maintenance', username: 'maintenance2', email: 'nancy.maintenance@example.com', fullName: 'Nancy Harris', salary: 41000, workShift: formatWorkShift('Evening Shift', '14:00', '23:00'), hireDate: '2024-03-10', permissions: getDefaultPermissions('maintenance') },
      { store: store2.id, role: 'cashier', username: 'cashier_downtown', email: 'robert.cashier@example.com', fullName: 'Robert Clark', salary: 46000, workShift: formatWorkShift('Day Shift', '08:00', '17:00'), hireDate: '2023-07-15', permissions: getDefaultPermissions('cashier') },

      // Store 3: Mall Location
      { store: store3.id, role: 'admin', username: 'admin_mall', email: 'admin.mall@example.com', fullName: 'Jennifer Adams', salary: 90000, workShift: formatWorkShift('Day Shift', '08:00', '17:00'), hireDate: '2023-05-01', permissions: getDefaultPermissions('admin') },
      { store: store3.id, role: 'manager', username: 'manager3', email: 'manager3@example.com', fullName: 'Christopher Moore', salary: 125000, workShift: formatWorkShift('Day Shift', '08:00', '17:00'), hireDate: '2023-05-01', permissions: getDefaultPermissions('manager') },
      { store: store3.id, role: 'assistant_manager', username: 'assistant_manager3', email: 'assistant3@example.com', fullName: 'Amanda Jackson', salary: 98000, workShift: formatWorkShift('Day Shift', '08:00', '17:00'), hireDate: '2023-06-01', permissions: getDefaultPermissions('assistant_manager') },
      { store: store3.id, role: 'supervisor', username: 'supervisor3', email: 'supervisor3@example.com', fullName: 'Daniel Lewis', salary: 78000, workShift: formatWorkShift('Day Shift', '08:00', '17:00'), hireDate: '2023-08-01', permissions: getDefaultPermissions('supervisor') },
      { store: store3.id, role: 'sales_associate', username: 'sales_associate3', email: 'robert.sales3@example.com', fullName: 'Robert Walker', salary: 52000, workShift: formatWorkShift('Morning Shift', '06:00', '15:00'), hireDate: '2023-09-20', permissions: getDefaultPermissions('sales_associate') },
      { store: store3.id, role: 'inventory_clerk', username: 'inventory_clerk3', email: 'inventory3@example.com', fullName: 'Jessica Hall', salary: 48000, workShift: formatWorkShift('Day Shift', '08:00', '17:00'), hireDate: '2023-11-15', permissions: getDefaultPermissions('inventory_clerk') },
      { store: store3.id, role: 'security', username: 'security3', email: 'security3@example.com', fullName: 'Matthew Allen', salary: 44000, workShift: formatWorkShift('Night Shift', '22:00', '06:00'), hireDate: '2024-02-01', permissions: getDefaultPermissions('security') },
      { store: store3.id, role: 'maintenance', username: 'maintenance3', email: 'maintenance3@example.com', fullName: 'Michelle Young', salary: 45000, workShift: formatWorkShift('Day Shift', '08:00', '17:00'), hireDate: '2024-04-01', permissions: getDefaultPermissions('maintenance') },
      { store: store3.id, role: 'cashier', username: 'cashier_mall', email: 'cashier.mall@example.com', fullName: 'Kevin King', salary: 47000, workShift: formatWorkShift('Day Shift', '08:00', '17:00'), hireDate: '2023-08-01', permissions: getDefaultPermissions('cashier') },
    ];

    // Check which employees already exist and update them, or create new ones
    const insertUser = db.prepare(`
      INSERT INTO users (
        username, email, password_hash, full_name, role, 
        salary, work_shift, hire_date, permissions, is_active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateUser = db.prepare(`
      UPDATE users 
      SET email = ?, full_name = ?, salary = ?, work_shift = ?, hire_date = ?, permissions = ?
      WHERE username = ?
    `);

    const insertUserStore = db.prepare(`
      INSERT INTO user_stores (user_id, store_id, is_primary)
      VALUES (?, ?, ?)
    `);

    for (const employee of employees) {
      const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(employee.username);
      const permissionsJson = JSON.stringify(employee.permissions);
      
      let userId;
      if (existingUser) {
        // Update existing user
        updateUser.run(
          employee.email,
          employee.fullName,
          employee.salary,
          employee.workShift,
          employee.hireDate,
          permissionsJson,
          employee.username
        );
        userId = existingUser.id;
        console.log(`✅ Updated ${employee.role}: ${employee.fullName} (ID: ${userId}, username: ${employee.username})`);
      } else {
        // Create new user
        const result = insertUser.run(
          employee.username,
          employee.email,
          defaultPassword,
          employee.fullName,
          employee.role,
          employee.salary,
          employee.workShift,
          employee.hireDate,
          permissionsJson,
          1
        );
        userId = result.lastInsertRowid;
        console.log(`✅ Created ${employee.role}: ${employee.fullName} (ID: ${userId}, username: ${employee.username})`);
      }

      // Link employee to store
      insertUserStore.run(userId, employee.store, 1);
      console.log(`   Linked to store ${employee.store}`);
    }

    // Update the original admin and cashier users to Store 1
    const originalAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
    const originalCashier = db.prepare('SELECT id FROM users WHERE username = ?').get('cashier');
    
    if (originalAdmin) {
      // Check if link exists
      const existingLink = db.prepare('SELECT id FROM user_stores WHERE user_id = ? AND store_id = ?').get(originalAdmin.id, store1.id);
      if (!existingLink) {
        insertUserStore.run(originalAdmin.id, store1.id, 1);
        console.log(`✅ Linked original admin to Store 1`);
      }
    }
    
    if (originalCashier) {
      const existingLink = db.prepare('SELECT id FROM user_stores WHERE user_id = ? AND store_id = ?').get(originalCashier.id, store1.id);
      if (!existingLink) {
        insertUserStore.run(originalCashier.id, store1.id, 1);
        console.log(`✅ Linked original cashier to Store 1`);
      }
    }

    // Update the deactivated employee to Store 1
    const firedEmployee = db.prepare('SELECT id FROM users WHERE username = ?').get('fired_employee1');
    if (firedEmployee) {
      const existingLink = db.prepare('SELECT id FROM user_stores WHERE user_id = ? AND store_id = ?').get(firedEmployee.id, store1.id);
      if (!existingLink) {
        insertUserStore.run(firedEmployee.id, store1.id, 1);
        console.log(`✅ Linked deactivated employee to Store 1`);
      }
    }

    // Summary
    const store1Count = db.prepare('SELECT COUNT(*) as count FROM user_stores WHERE store_id = ?').get(store1.id);
    const store2Count = db.prepare('SELECT COUNT(*) as count FROM user_stores WHERE store_id = ?').get(store2.id);
    const store3Count = db.prepare('SELECT COUNT(*) as count FROM user_stores WHERE store_id = ?').get(store3.id);

    console.log(`\n✅ Setup complete!`);
    console.log(`\n📊 Employee Distribution:`);
    console.log(`   Store 1 (Main Store): ${store1Count.count} employees`);
    console.log(`   Store 2 (Downtown Branch): ${store2Count.count} employees`);
    console.log(`   Store 3 (Mall Location): ${store3Count.count} employees`);
    console.log(`\n📝 Default password for all employees: employee123`);
  } catch (error) {
    console.error('❌ Error setting up stores and employees:', error);
    throw error;
  }
}

setupStoresAndEmployees()
  .then(() => {
    db.close();
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    db.close();
    process.exit(1);
  });

