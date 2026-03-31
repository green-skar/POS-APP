import { getSession } from '../../../utils/auth.js';
import { db } from '../../../../lib/database.ts';

// Get all stores
export async function GET(request) {
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

    // Only super_admin can view all stores
    if (session.role !== 'super_admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const stores = db.prepare(`
      SELECT s.*, 
             COUNT(DISTINCT us.user_id) as user_count,
             COUNT(DISTINCT p.id) as product_count
      FROM stores s
      LEFT JOIN user_stores us ON s.id = us.store_id
      LEFT JOIN products p ON s.id = p.store_id
      GROUP BY s.id
      ORDER BY s.name ASC
    `).all();

    return Response.json({ stores });

  } catch (error) {
    console.error('Get stores error:', error);
    return Response.json({ error: 'Failed to get stores' }, { status: 500 });
  }
}

// Create a new store
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

    // Only super_admin can create stores
    if (session.role !== 'super_admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { name, address, phone, email } = await request.json();

    if (!name) {
      return Response.json({ error: 'Store name is required' }, { status: 400 });
    }

    // Create store
    const result = db.prepare(`
      INSERT INTO stores (name, address, phone, email)
      VALUES (?, ?, ?, ?)
    `).run(name, address || null, phone || null, email || null);

    const storeId = result.lastInsertRowid;

    // Get created store
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId);

    return Response.json({ success: true, store });

  } catch (error) {
    console.error('Create store error:', error);
    if (error.message?.includes('UNIQUE')) {
      return Response.json({ error: 'Store name already exists' }, { status: 400 });
    }
    return Response.json({ error: 'Failed to create store' }, { status: 500 });
  }
}

// Update store
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

    // Only super_admin can update stores
    if (session.role !== 'super_admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { id, name, address, phone, email, isActive } = await request.json();

    if (!id) {
      return Response.json({ error: 'Store ID is required' }, { status: 400 });
    }

    // Update store
    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (address !== undefined) {
      updates.push('address = ?');
      params.push(address);
    }
    if (phone !== undefined) {
      updates.push('phone = ?');
      params.push(phone);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      params.push(email);
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(isActive);
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);

      db.prepare(`
        UPDATE stores SET ${updates.join(', ')} WHERE id = ?
      `).run(...params);
    }

    // Get updated store
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(id);

    return Response.json({ success: true, store });

  } catch (error) {
    console.error('Update store error:', error);
    if (error.message?.includes('UNIQUE')) {
      return Response.json({ error: 'Store name already exists' }, { status: 400 });
    }
    return Response.json({ error: 'Failed to update store' }, { status: 500 });
  }
}

// Delete store
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

    // Only super_admin can delete stores
    if (session.role !== 'super_admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return Response.json({ error: 'Store ID is required' }, { status: 400 });
    }

    // Delete store (cascade will handle related records)
    db.prepare('DELETE FROM stores WHERE id = ?').run(id);

    return Response.json({ success: true });

  } catch (error) {
    console.error('Delete store error:', error);
    return Response.json({ error: 'Failed to delete store' }, { status: 500 });
  }
}

