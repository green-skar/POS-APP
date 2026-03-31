/**
 * Cookie utility functions to eliminate code duplication
 */

/**
 * Parse cookies from cookie header string
 * @param {string} cookieHeader - Cookie header string
 * @returns {Object} - Object with cookie key-value pairs
 */
export function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.trim().split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const value = parts.slice(1).join('=').trim();
      cookies[key] = value;
    }
  });
  
  return cookies;
}

/**
 * Get a specific cookie value from cookie header
 * @param {string} cookieHeader - Cookie header string
 * @param {string} cookieName - Name of the cookie to get
 * @returns {string|null} - Cookie value or null if not found
 */
export function getCookie(cookieHeader, cookieName) {
  const cookies = parseCookies(cookieHeader);
  return cookies[cookieName] || null;
}

/**
 * Clear session cookie header string
 * @returns {string} - Set-Cookie header value to clear the cookie
 */
export function getClearSessionCookieHeader() {
  const expiresDate = new Date(0).toUTCString(); // Thu, 01 Jan 1970 00:00:00 GMT
  return `session_token=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0; Expires=${expiresDate}`;
}

/**
 * Clear session cookie in browser (client-side)
 */
export function clearSessionCookieClient() {
  const expiresDate = new Date(0).toUTCString();
  document.cookie = `session_token=; Path=/; SameSite=Lax; Max-Age=0; Expires=${expiresDate}`;
}

/**
 * Create session cookie header string
 * @param {string} token - Session token
 * @param {boolean} isProduction - Whether in production environment
 * @returns {string} - Set-Cookie header value
 */
export function getSessionCookieHeader(token, isProduction = false) {
  const secure = isProduction ? '; Secure' : '';
  return `session_token=${token}; HttpOnly; Path=/; SameSite=Lax${secure}`;
}





