import { getSession } from '../../../../utils/auth.js';
import { getCookie, getClearSessionCookieHeader } from '../../../../utils/cookies.js';

export async function GET(request) {
  try {
    // Get token from cookie header
    const cookieHeader = request.headers.get('cookie') || '';
    const token = getCookie(cookieHeader, 'session_token');

    if (!token) {
      return Response.json({ authenticated: false }, { status: 200 });
    }

    const session = getSession(token);

    if (!session) {
      // Clear cookie if session is invalid
      const response = Response.json({ authenticated: false }, { status: 200 });
      response.headers.set('Set-Cookie', getClearSessionCookieHeader());
      return response;
    }

    return Response.json({
      authenticated: true,
      user: {
        id: session.userId,
        username: session.username,
        email: session.email,
        fullName: session.fullName,
        role: session.role,
      },
      store: session.storeId ? {
        id: session.storeId,
        name: session.storeName,
      } : null,
    });

  } catch (error) {
    console.error('Session check error:', error);
    return Response.json({ authenticated: false }, { status: 200 });
  }
}

