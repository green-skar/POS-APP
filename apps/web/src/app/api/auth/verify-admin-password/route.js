import { verifyPassword } from '../../../../utils/auth.js';
import { getSession } from '../../../../utils/auth.js';
import { db } from '../../../../../lib/database.ts';

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

    // Only cashiers can use this endpoint (to verify admin password)
    if (session.role !== 'cashier') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { password } = await request.json();

    if (!password) {
      return Response.json({ error: 'Password is required' }, { status: 400 });
    }

    // Get admin user from the same store
    const admin = db.prepare(`
      SELECT u.* 
      FROM users u
      JOIN user_stores us ON u.id = us.user_id
      WHERE u.role IN ('admin', 'super_admin') 
      AND us.store_id = ?
      AND u.is_active = 1
      LIMIT 1
    `).get(session.storeId);

    if (!admin) {
      return Response.json({ error: 'No admin found for this store' }, { status: 404 });
    }

    // Verify password
    const isValid = await verifyPassword(password, admin.password_hash);

    if (!isValid) {
      return Response.json({ error: 'Invalid admin password' }, { status: 401 });
    }

    return Response.json({ success: true });

  } catch (error) {
    console.error('Verify admin password error:', error);
    return Response.json({ error: 'Failed to verify password' }, { status: 500 });
  }
}
















