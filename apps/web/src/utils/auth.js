import { hash, verify } from 'argon2';
import { db } from '../../lib/database.ts';
import crypto from 'crypto';

/**
 * Hash a password using argon2
 */
export async function hashPassword(password) {
  return await hash(password);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password, hash) {
  try {
    return await verify(hash, password);
  } catch (error) {
    return false;
  }
}

/**
 * Generate a secure session token
 */
export function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create a session for a user
 */
export async function createSession(userId, storeId = null) {
  const token = generateSessionToken();
  // Set expiry to 24 hours for database cleanup (cookie is session-based and expires on browser close)
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  const now = new Date().toISOString();
  // created_at is set automatically by DEFAULT CURRENT_TIMESTAMP in the schema
  // last_activity tracks when the session was last used

  db.prepare(`
    INSERT INTO sessions (user_id, store_id, session_token, expires_at, last_activity)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, storeId, token, expiresAt.toISOString(), now);

  return { token, expiresAt };
}

/**
 * Get session by token
 */
export function getSession(token) {
  if (!token) return null;
  
  const session = db.prepare(`
    SELECT s.*, u.username, u.email, u.full_name, u.role, u.is_active as user_active,
           st.name as store_name, st.id as store_id
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    LEFT JOIN stores st ON s.store_id = st.id
    WHERE s.session_token = ? AND s.expires_at > datetime('now')
  `).get(token);

  if (!session) {
    return null;
  }

  // Check if user is active (SQLite returns 1 for true, 0 for false)
  if (session.user_active !== 1 && session.user_active !== true) {
    return null;
  }

  // Check last activity with a practical inactivity timeout.
  // 5 seconds caused valid sessions to be invalidated during normal navigation.
  const now = new Date();
  const lastActivity = session.last_activity ? new Date(session.last_activity) : new Date(session.created_at);
  const inactivityLimitMs = 30 * 60 * 1000; // 30 minutes
  const staleThreshold = new Date(now.getTime() - inactivityLimitMs);
  
  const timeDiff = Math.round((now.getTime() - lastActivity.getTime()) / 1000);
  
  if (lastActivity < staleThreshold) {
    // Session is stale due to extended inactivity.
    console.log('⚠️ Session stale - invalidating. Last activity was', timeDiff, 'seconds ago');
    deleteSession(token);
    return null;
  }
  
  console.log('✅ Session active - last activity', timeDiff, 'seconds ago');

  // Update last_activity to current time (session is being used)
  const nowISO = now.toISOString();
  db.prepare('UPDATE sessions SET last_activity = ? WHERE session_token = ?').run(nowISO, token);

  return {
    id: session.id,
    userId: session.user_id,
    storeId: session.store_id,
    storeName: session.store_name,
    username: session.username,
    email: session.email,
    fullName: session.full_name,
    role: session.role,
    expiresAt: session.expires_at,
  };
}

/**
 * Delete a session
 */
export function deleteSession(token) {
  db.prepare('DELETE FROM sessions WHERE session_token = ?').run(token);
}

/**
 * Delete all sessions for a user
 */
export function deleteUserSessions(userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

/**
 * Clean expired sessions
 */
export function cleanExpiredSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
}

/**
 * Get user by username or email
 */
export function getUserByUsernameOrEmail(identifier) {
  const result = db.prepare(`
    SELECT id, username, email, password_hash, full_name, role, is_active
    FROM users
    WHERE (username = ? OR email = ?) AND is_active = 1
  `).get(identifier, identifier);
  return result;
}

/**
 * Get user stores
 */
export function getUserStores(userId) {
  return db.prepare(`
    SELECT s.*, us.is_primary
    FROM stores s
    JOIN user_stores us ON s.id = us.store_id
    WHERE us.user_id = ? AND s.is_active = 1
    ORDER BY us.is_primary DESC, s.name ASC
  `).all(userId);
}

/**
 * Get all stores (for super admin)
 */
export function getAllStores() {
  return db.prepare(`
    SELECT * FROM stores WHERE is_active = 1 ORDER BY name ASC
  `).all();
}

/**
 * Check if user can access store
 */
export function canUserAccessStore(userId, storeId) {
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
  
  if (!user) return false;
  
  // Super admin can access all stores
  if (user.role === 'super_admin') return true;
  
  // Check if user has access to this store
  const access = db.prepare(`
    SELECT COUNT(*) as count
    FROM user_stores
    WHERE user_id = ? AND store_id = ?
  `).get(userId, storeId);
  
  return access.count > 0;
}

