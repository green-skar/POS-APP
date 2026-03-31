import { deleteSession } from '../../../../utils/auth.js';
import { getCookie, getClearSessionCookieHeader } from '../../../../utils/cookies.js';

export async function POST(request) {
  try {
    // Get token from cookie header
    // Handle both JSON body and FormData/Blob from sendBeacon
    const cookieHeader = request.headers.get('cookie') || '';
    const token = getCookie(cookieHeader, 'session_token');

    if (token) {
      deleteSession(token);
    }

    // Create response to clear cookie
    // Use both Max-Age=0 and Expires to ensure cookie is cleared in all browsers
    const response = Response.json({ success: true });
    response.headers.set('Set-Cookie', getClearSessionCookieHeader());

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    // Still clear cookie even on error
    const response = Response.json({ error: 'Failed to logout' }, { status: 500 });
    response.headers.set('Set-Cookie', getClearSessionCookieHeader());
    return response;
  }
}

