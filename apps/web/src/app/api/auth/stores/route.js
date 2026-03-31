import { getSession, getAllStores, getUserStores } from '../../../../utils/auth.js';

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

    let stores = [];

    if (session.role === 'super_admin') {
      // Super admin can see all stores
      stores = getAllStores();
    } else {
      // Admin and cashier can only see their assigned stores
      stores = getUserStores(session.userId);
    }

    return Response.json({ stores });

  } catch (error) {
    console.error('Get stores error:', error);
    return Response.json({ error: 'Failed to get stores' }, { status: 500 });
  }
}

