/**
 * Best-effort logout when the app window is closing (Tauri, browser tab, etc.).
 */
import { apiFetch } from '@/utils/apiClient';
import { clearSessionCookieClient } from './cookies.js';

function clearClientSessionMarkers() {
  const currentStartTime = sessionStorage.getItem('app_start_time');
  if (currentStartTime) {
    sessionStorage.setItem('previous_start_time', currentStartTime);
  }
  sessionStorage.removeItem('app_start_time');
  sessionStorage.setItem('browser_closing', 'true');
  sessionStorage.removeItem('session_active');
  sessionStorage.removeItem('pending_close');
  sessionStorage.removeItem('visibility_hidden');

  clearSessionCookieClient();
}

/**
 * Sync path for unload: notify server first (while cookie still present), then clear client.
 */
export function logoutOnAppExit() {
  try {
    const fd = new FormData();
    navigator.sendBeacon('/api/auth/logout', fd);
    clearClientSessionMarkers();
  } catch {
    try {
      clearClientSessionMarkers();
    } catch {
      // ignore
    }
  }
}

/**
 * When the window is still alive (e.g. Tauri `onCloseRequested`): await server logout, then clear client.
 */
export async function logoutOnAppExitAsync() {
  try {
    await apiFetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
    });
  } catch {
    try {
      navigator.sendBeacon('/api/auth/logout', new FormData());
    } catch {
      // ignore
    }
  }
  clearClientSessionMarkers();
}

function parseDocumentCookies() {
  const cookieHeader = typeof document !== 'undefined' ? document.cookie : '';
  return Object.fromEntries(
    cookieHeader.split(';').map((c) => c.trim().split('='))
  );
}

export function hasActiveSessionMarkers() {
  const hasSessionMarker = sessionStorage.getItem('session_active');
  const cookies = parseDocumentCookies();
  return !!(cookies.session_token || hasSessionMarker);
}
