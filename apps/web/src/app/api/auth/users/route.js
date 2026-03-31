import { getSession } from '../../../../utils/auth.js';
import { db } from '../../../../../lib/database.ts';
import { hashPassword } from '../../../../utils/auth.js';

// Get all users (employees with admin dashboard access or POS price edit permissions)
export async function GET(request) {
  console.log('[API] ===== GET /api/auth/users called =====');
  try {
    // Get token from cookie header
    const cookieHeader = request.headers.get('cookie') || '';
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map(c => c.trim().split('='))
    );
    const token = cookies.session_token;

    if (!token) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const session = getSession(token);

    if (!session) {
      return Response.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Only super_admin and admin can view users
    if (session.role !== 'super_admin' && session.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Filter by store if not super admin, and filter by permissions (access_admin or edit_prices)
    let users = [];
    try {
      console.log('[API] Session role:', session.role, 'Store ID:', session.storeId, 'Store Name:', session.storeName);
      if (session.role === 'super_admin') {
        // Super admin can see all users (employees with access_admin or edit_prices permissions)
        // First get all employees, then filter by permissions
        const allEmployees = db.prepare(`
          SELECT u.*, 
                 GROUP_CONCAT(DISTINCT s.name) as store_names,
                 GROUP_CONCAT(DISTINCT s.id) as store_ids
          FROM users u
          LEFT JOIN user_stores us ON u.id = us.user_id
          LEFT JOIN stores s ON us.store_id = s.id
          WHERE u.role != 'super_admin'
          GROUP BY u.id
          ORDER BY u.created_at DESC
        `).all();
        
        // Filter employees by permissions: must have access_admin or edit_prices
        const filteredEmployees = allEmployees.filter(emp => {
          if (!emp.permissions) return false;
          
          let permissions = [];
          try {
            permissions = JSON.parse(emp.permissions);
          } catch (e) {
            // If not JSON, try comma-separated
            permissions = emp.permissions.split(',').map(p => p.trim()).filter(p => p);
          }
          
          // Check if employee has access_admin or edit_prices permission
          const hasAccessAdmin = permissions.includes('access_admin');
          const hasEditPrices = permissions.includes('edit_prices');
          
          return hasAccessAdmin || hasEditPrices;
        });
        
        // Ensure store information is properly formatted
        users = filteredEmployees.map(emp => ({
          ...emp,
          store_names: emp.store_names || '',
          store_ids: emp.store_ids || ''
        }));
        
        console.log('[API] Super admin - Found employees:', allEmployees.length);
        console.log('[API] Super admin - Employees with admin/POS permissions:', users.length);
      } else {
        // Admin can only see users from their store (all roles except super admins)
        if (!session.storeId) {
          console.log('[API] No storeId in session for admin user');
          return Response.json({ error: 'Store ID required for admin users' }, { status: 400 });
        }
        console.log('[API] Session role:', session.role, 'Store ID:', session.storeId, 'Type:', typeof session.storeId);
        const storeId = parseInt(session.storeId);
        console.log('[API] Parsed store ID:', storeId, 'Is NaN:', isNaN(storeId));
        
        if (isNaN(storeId)) {
          console.error('[API] Invalid store ID:', session.storeId);
          return Response.json({ error: 'Invalid store ID' }, { status: 400 });
        }
        
        // Verify store exists
        const store = db.prepare('SELECT id, name FROM stores WHERE id = ?').get(storeId);
        if (!store) {
          console.error('[API] Store not found:', storeId);
          return Response.json({ error: 'Store not found' }, { status: 404 });
        }
        console.log('[API] Store found:', store.name);
        
        // First, let's check what users are linked to this store (diagnostic query)
        const linkedUsers = db.prepare(`
          SELECT us.user_id, us.store_id, u.username, u.role
          FROM user_stores us
          JOIN users u ON us.user_id = u.id
          WHERE us.store_id = ? AND u.role != 'super_admin'
        `).all(storeId);
        console.log('[API] Users linked to store', storeId, ':', linkedUsers.length);
        linkedUsers.forEach(u => console.log(`[API]   User ${u.user_id}: ${u.username} (${u.role})`));
        
        // Main query: Get all employees from this store, then filter by permissions
        try {
          // First get all employees with a simple query
          const allEmployees = db.prepare(`
            SELECT u.*
            FROM users u
            INNER JOIN user_stores us ON u.id = us.user_id
            WHERE us.store_id = ? AND u.role != 'super_admin'
            ORDER BY u.created_at DESC
          `).all(storeId);
          
          console.log('[API] Simple query returned:', allEmployees.length, 'employees');
          allEmployees.forEach(e => console.log(`[API]   Employee ${e.id}: ${e.username} (${e.role})`));
          
          // Verify we got all expected employees
          if (allEmployees.length !== linkedUsers.length) {
            console.error(`[API] ERROR: Simple query returned ${allEmployees.length} employees, but diagnostic query found ${linkedUsers.length} linked users!`);
            console.error('[API] Missing employees:', linkedUsers.filter(lu => !allEmployees.find(ae => ae.id === lu.user_id)).map(lu => `${lu.username} (${lu.role})`));
          }
          
          // Count roles in query result
          const roleCounts = {};
          allEmployees.forEach(e => {
            roleCounts[e.role] = (roleCounts[e.role] || 0) + 1;
          });
          console.log('[API] Role distribution in query result:', roleCounts);
          
          // Filter employees by permissions: must have access_admin or edit_prices
          const employeesWithPermissions = allEmployees.filter(emp => {
            if (!emp.permissions) return false;
            
            let permissions = [];
            try {
              permissions = JSON.parse(emp.permissions);
            } catch (e) {
              // If not JSON, try comma-separated
              permissions = emp.permissions.split(',').map(p => p.trim()).filter(p => p);
            }
            
            // Check if employee has access_admin or edit_prices permission
            const hasAccessAdmin = permissions.includes('access_admin');
            const hasEditPrices = permissions.includes('edit_prices');
            
            return hasAccessAdmin || hasEditPrices;
          });
          
          console.log('[API] Employees with admin/POS permissions:', employeesWithPermissions.length);
          employeesWithPermissions.forEach(e => console.log(`[API]   User ${e.id}: ${e.username} (${e.role})`));
          
          // Now add store information for each user
          users = employeesWithPermissions.map(user => {
            // Get store names and IDs for this user
            const userStores = db.prepare(`
              SELECT s.id, s.name
              FROM stores s
              INNER JOIN user_stores us ON s.id = us.store_id
              WHERE us.user_id = ?
            `).all(user.id);
            
            return {
              ...user,
              store_names: userStores.map(s => s.name).join(','),
              store_ids: userStores.map(s => s.id).join(',')
            };
          });
          
          console.log('[API] Admin - Found users (with permissions) for store', storeId, ':', users.length);
          console.log('[API] Admin - Users:', users.map(u => `${u.username} (${u.role})`));
          
          // Verify we got the expected number of users
          if (linkedUsers.length !== allEmployees.length) {
            console.warn(`[API] WARNING: Linked users count (${linkedUsers.length}) doesn't match query result (${allEmployees.length})`);
            console.warn('[API] Using linked users count as reference');
          }
        } catch (queryError) {
          console.error('[API] Query execution error:', queryError);
          // Fallback to simple query
          const allEmployees = db.prepare(`
            SELECT u.*
            FROM users u
            INNER JOIN user_stores us ON u.id = us.user_id
            WHERE us.store_id = ? AND u.role != 'super_admin'
          `).all(storeId);
          
          // Filter by permissions
          const employeesWithPermissions = allEmployees.filter(emp => {
            if (!emp.permissions) return false;
            let permissions = [];
            try {
              permissions = JSON.parse(emp.permissions);
            } catch (e) {
              permissions = emp.permissions.split(',').map(p => p.trim()).filter(p => p);
            }
            return permissions.includes('access_admin') || permissions.includes('edit_prices');
          });
          
          // Add store information for each user
          users = employeesWithPermissions.map(user => {
            // Get store names and IDs for this user
            const userStores = db.prepare(`
              SELECT s.id, s.name
              FROM stores s
              INNER JOIN user_stores us ON s.id = us.store_id
              WHERE us.user_id = ?
            `).all(user.id);
            
            return {
              ...user,
              store_names: userStores.map(s => s.name).join(','),
              store_ids: userStores.map(s => s.id).join(',')
            };
          });
          
          console.log('[API] Fallback query returned:', users.length, 'users');
        }
      }
    } catch (queryError) {
      console.error('Query error:', queryError);
      return Response.json({ error: 'Failed to query users', details: queryError.message }, { status: 500 });
    }

    // Final verification - ensure we have an array
    if (!Array.isArray(users)) {
      console.error('[API] ERROR: users is not an array! Type:', typeof users);
      users = [];
    }
    
    // Log final role distribution
    const finalRoleCounts = {};
    users.forEach(u => {
      finalRoleCounts[u.role] = (finalRoleCounts[u.role] || 0) + 1;
    });
    console.log('[API] Final role distribution:', finalRoleCounts);
    console.log('[API] Found users:', users.length);
    console.log('[API] ===== END GET /api/auth/users =====');
    
    // Add debug headers
    const response = Response.json({ users: users || [] });
    response.headers.set('X-Debug-User-Count', (users?.length || 0).toString());
    response.headers.set('X-Debug-Store-Id', session.storeId?.toString() || 'N/A');
    response.headers.set('X-Debug-Role', session.role || 'N/A');
    response.headers.set('X-Debug-Role-Distribution', JSON.stringify(finalRoleCounts));
    return response;

  } catch (error) {
    console.error('Get users error:', error);
    return Response.json({ error: 'Failed to get users' }, { status: 500 });
  }
}

// Create a new user
export async function POST(request) {
  try {
    // Get token from cookie header
    const cookieHeader = request.headers.get('cookie') || '';
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map(c => c.trim().split('='))
    );
    const token = cookies.session_token;

    if (!token) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const session = getSession(token);

    if (!session) {
      return Response.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Only super_admin and admin can create users
    if (session.role !== 'super_admin' && session.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { username, email, password, fullName, role, storeIds, salary, workShift, hireDate, permissions } = await request.json();

    if (!username || !password || !fullName || !role) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate role
    if (!['super_admin', 'admin', 'cashier'].includes(role)) {
      return Response.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Super admin can create any role, admin can only create cashiers
    if (session.role === 'admin' && role !== 'cashier') {
      return Response.json({ error: 'Admins can only create cashiers' }, { status: 403 });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Check if users table has salary, work_shift, hire_date, permissions columns
    const userColumns = db.prepare("PRAGMA table_info(users)").all();
    const hasSalary = userColumns.some(col => col.name === 'salary');
    const hasWorkShift = userColumns.some(col => col.name === 'work_shift');
    const hasHireDate = userColumns.some(col => col.name === 'hire_date');
    const hasPermissions = userColumns.some(col => col.name === 'permissions');

    // Build INSERT statement based on available columns
    let insertFields = 'username, email, password_hash, full_name, role';
    let insertValues = [username, email || null, passwordHash, fullName, role];
    let placeholders = '?, ?, ?, ?, ?';

    if (hasSalary && salary !== undefined && salary !== null) {
      insertFields += ', salary';
      insertValues.push(salary);
      placeholders += ', ?';
    }
    if (hasWorkShift && workShift) {
      insertFields += ', work_shift';
      insertValues.push(workShift);
      placeholders += ', ?';
    }
    if (hasHireDate && hireDate) {
      insertFields += ', hire_date';
      insertValues.push(hireDate);
      placeholders += ', ?';
    }
    if (hasPermissions && permissions) {
      insertFields += ', permissions';
      insertValues.push(typeof permissions === 'string' ? permissions : JSON.stringify(permissions));
      placeholders += ', ?';
    }

    // Create user
    const result = db.prepare(`
      INSERT INTO users (${insertFields})
      VALUES (${placeholders})
    `).run(...insertValues);

    const userId = result.lastInsertRowid;

    // Assign stores (required for admin and cashier)
    if (role !== 'super_admin' && storeIds && storeIds.length > 0) {
      // Filter storeIds based on user's access
      let validStoreIds = storeIds;
      
      if (session.role === 'admin') {
        // Admin can only assign their store
        validStoreIds = storeIds.filter(id => id === session.storeId);
      }

      // Insert user-store relationships
      const insertUserStore = db.prepare(`
        INSERT INTO user_stores (user_id, store_id, is_primary)
        VALUES (?, ?, ?)
      `);

      for (let i = 0; i < validStoreIds.length; i++) {
        insertUserStore.run(userId, validStoreIds[i], i === 0);
      }
    }

    // Get created user
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

    return Response.json({ success: true, user });

  } catch (error) {
    console.error('Create user error:', error);
    if (error.message?.includes('UNIQUE')) {
      return Response.json({ error: 'Username or email already exists' }, { status: 400 });
    }
    return Response.json({ error: 'Failed to create user' }, { status: 500 });
  }
}

// Update user
export async function PUT(request) {
  try {
    // Get token from cookie header
    const cookieHeader = request.headers.get('cookie') || '';
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map(c => c.trim().split('='))
    );
    const token = cookies.session_token;

    if (!token) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const session = getSession(token);

    if (!session) {
      return Response.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Only super_admin and admin can update users
    if (session.role !== 'super_admin' && session.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { id, username, email, fullName, role, isActive, storeIds, password, salary, workShift, hireDate, permissions } = await request.json();

    if (!id) {
      return Response.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Check if user exists and user has access
    const existingUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    
    if (!existingUser) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    // Admin can only update users from their store
    if (session.role === 'admin') {
      const userStore = db.prepare(`
        SELECT COUNT(*) as count FROM user_stores WHERE user_id = ? AND store_id = ?
      `).get(id, session.storeId);
      
      if (userStore.count === 0) {
        return Response.json({ error: 'Unauthorized' }, { status: 403 });
      }
    }

    // Check if users table has salary, work_shift, hire_date, permissions columns
    const userColumns = db.prepare("PRAGMA table_info(users)").all();
    const hasSalary = userColumns.some(col => col.name === 'salary');
    const hasWorkShift = userColumns.some(col => col.name === 'work_shift');
    const hasHireDate = userColumns.some(col => col.name === 'hire_date');
    const hasPermissions = userColumns.some(col => col.name === 'permissions');

    // Update user
    const updates = [];
    const params = [];

    if (username !== undefined) {
      updates.push('username = ?');
      params.push(username);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      params.push(email);
    }
    if (fullName !== undefined) {
      updates.push('full_name = ?');
      params.push(fullName);
    }
    if (role !== undefined) {
      // Super admin can change any role, admin can only change to cashier
      if (session.role === 'admin' && role !== 'cashier') {
        return Response.json({ error: 'Admins can only assign cashier role' }, { status: 403 });
      }
      updates.push('role = ?');
      params.push(role);
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(isActive);
    }
    if (password !== undefined && password !== '') {
      const passwordHash = await hashPassword(password);
      updates.push('password_hash = ?');
      params.push(passwordHash);
    }
    if (hasSalary && salary !== undefined) {
      updates.push('salary = ?');
      params.push(salary !== null && salary !== '' ? salary : 0);
    }
    if (hasWorkShift && workShift !== undefined) {
      updates.push('work_shift = ?');
      params.push(workShift || null);
    }
    if (hasHireDate && hireDate !== undefined) {
      updates.push('hire_date = ?');
      params.push(hireDate || null);
    }
    if (hasPermissions && permissions !== undefined) {
      updates.push('permissions = ?');
      params.push(typeof permissions === 'string' ? permissions : JSON.stringify(permissions));
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);

      db.prepare(`
        UPDATE users SET ${updates.join(', ')} WHERE id = ?
      `).run(...params);
    }

    // Update store assignments if provided
    if (storeIds !== undefined && role !== 'super_admin') {
      // Delete existing assignments
      db.prepare('DELETE FROM user_stores WHERE user_id = ?').run(id);

      // Add new assignments
      if (storeIds.length > 0) {
        let validStoreIds = storeIds;
        
        if (session.role === 'admin') {
          // Admin can only assign their store
          validStoreIds = storeIds.filter(storeId => storeId === session.storeId);
        }

        const insertUserStore = db.prepare(`
          INSERT INTO user_stores (user_id, store_id, is_primary)
          VALUES (?, ?, ?)
        `);

        for (let i = 0; i < validStoreIds.length; i++) {
          insertUserStore.run(id, validStoreIds[i], i === 0);
        }
      }
    }

    // Get updated user
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);

    return Response.json({ success: true, user });

  } catch (error) {
    console.error('Update user error:', error);
    if (error.message?.includes('UNIQUE')) {
      return Response.json({ error: 'Username or email already exists' }, { status: 400 });
    }
    return Response.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

// Delete user
export async function DELETE(request) {
  try {
    // Get token from cookie header
    const cookieHeader = request.headers.get('cookie') || '';
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map(c => c.trim().split('='))
    );
    const token = cookies.session_token;

    if (!token) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const session = getSession(token);

    if (!session) {
      return Response.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Only super_admin can delete users
    if (session.role !== 'super_admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return Response.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Prevent deleting own account
    if (parseInt(id) === session.userId) {
      return Response.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    // Delete user (cascade will handle related records)
    db.prepare('DELETE FROM users WHERE id = ?').run(id);

    return Response.json({ success: true });

  } catch (error) {
    console.error('Delete user error:', error);
    return Response.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}

1