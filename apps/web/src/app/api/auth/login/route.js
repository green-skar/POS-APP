import { verifyPassword, createSession, getUserByUsernameOrEmail, getUserStores, getAllStores } from '../../../../utils/auth.js';
import { getSessionCookieHeader } from '../../../../utils/cookies.js';
import sql from '@/app/api/utils/sql';

export async function POST(request) {
  try {
    const { username, password, storeId } = await request.json();

    if (!username || !password) {
      return Response.json({ error: 'Username and password are required' }, { status: 400 });
    }

    // Get user
    const user = getUserByUsernameOrEmail(username);
    
    if (!user) {
      return Response.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Verify password
    const isValid = await verifyPassword(password, user.password_hash);
    
    if (!isValid) {
      return Response.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Handle store selection based on role
    let selectedStoreId = null;
    
    // Roles that require store selection (all non-super_admin roles)
    const rolesRequiringStore = [
      'admin', 'cashier', 'manager', 'supervisor', 'assistant_manager',
      'sales_associate', 'inventory_clerk', 'security', 'maintenance'
    ];
    
    if (user.role === 'super_admin') {
      // Super admin can login without store or with any store
      selectedStoreId = storeId || null;
    } else if (rolesRequiringStore.includes(user.role)) {
      // All other roles must select a store
      if (!storeId) {
        // Get user's stores to return for selection
        const userStores = getUserStores(user.id);
        
        // If user has no stores linked, return all stores for super admin handling
        // or show error if no stores exist
        if (userStores.length === 0) {
          // Check if any stores exist
          const allStores = getAllStores();
          if (allStores.length === 0) {
            return Response.json({ 
              error: 'No stores available. Please contact an administrator.' 
            }, { status: 400 });
          }
          
          // If user has no stores but stores exist, return all stores for selection
          // This handles cases where users weren't properly linked to stores
          return Response.json({ 
            requiresStoreSelection: true,
            stores: allStores,
            user: {
              id: user.id,
              username: user.username,
              fullName: user.full_name,
              role: user.role,
            }
          }, { status: 200 });
        }
        
        return Response.json({ 
          requiresStoreSelection: true,
          stores: userStores,
          user: {
            id: user.id,
            username: user.username,
            fullName: user.full_name,
            role: user.role,
          }
        }, { status: 200 });
      }
      
      // Verify user has access to selected store
      const userStores = getUserStores(user.id);
      
      // If user has no stores linked, allow access to any store (for backward compatibility)
      // This handles cases where users weren't properly linked to stores
      if (userStores.length === 0) {
        const allStores = getAllStores();
        const hasAccess = allStores.some(store => store.id === storeId);
        if (!hasAccess) {
          return Response.json({ error: 'Invalid store selected' }, { status: 403 });
        }
      } else {
        const hasAccess = userStores.some(store => store.id === storeId);
        if (!hasAccess) {
          return Response.json({ error: 'You do not have access to this store' }, { status: 403 });
        }
      }
      
      selectedStoreId = storeId;
    }

    // Create session
    const session = await createSession(user.id, selectedStoreId);

    // Get store info if store is selected
    let storeInfo = null;
    if (selectedStoreId) {
      const stores = await sql(`
        SELECT id, name, address, phone, email FROM stores WHERE id = ?
      `, [selectedStoreId]);
      storeInfo = stores[0] || null;
    }

    // Create response with cookie header
    const response = Response.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
      },
      store: storeInfo,
      sessionToken: session.token,
    });

    // Set cookie as session cookie (no Max-Age or Expires) - expires when browser closes
    // Session in database still has expiry for cleanup purposes
    // Explicitly do NOT set Max-Age or Expires to make it a true session cookie
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieHeader = getSessionCookieHeader(session.token, isProduction);
    response.headers.set('Set-Cookie', cookieHeader);

    return response;

  } catch (error) {
    console.error('Login error:', error);
    return Response.json({ error: 'Failed to login' }, { status: 500 });
  }
}

