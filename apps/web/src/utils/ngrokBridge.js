const N_AUTOSTART = 'ngrok:autoStartTunnel';
const N_AUTOAPPLY = 'ngrok:autoApplyCallback';
const N_PORT = 'ngrok:tunnelPort';
const N_LAST_PUBLIC = 'ngrok:lastPublicUrl';

export function isTauriDesktop() {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
}

export function getNgrokAutoConfig() {
  if (typeof window === 'undefined') {
    return { autoStartTunnel: false, autoApplyCallback: false, tunnelPort: 4000 };
  }
  try {
    const autoStartTunnel = localStorage.getItem(N_AUTOSTART) === '1';
    const autoApplyCallback = localStorage.getItem(N_AUTOAPPLY) === '1';
    const rawPort = parseInt(localStorage.getItem(N_PORT) || '4000', 10);
    const tunnelPort = Number.isFinite(rawPort) && rawPort > 0 && rawPort < 65536 ? rawPort : 4000;
    return { autoStartTunnel, autoApplyCallback, tunnelPort };
  } catch {
    return { autoStartTunnel: false, autoApplyCallback: false, tunnelPort: 4000 };
  }
}

export function saveNgrokAutoConfig(cfg) {
  if (typeof window === 'undefined') return;
  const autoStartTunnel = Boolean(cfg?.autoStartTunnel);
  const autoApplyCallback = Boolean(cfg?.autoApplyCallback);
  const p = parseInt(String(cfg?.tunnelPort ?? 4000), 10);
  const tunnelPort = Number.isFinite(p) && p > 0 && p < 65536 ? p : 4000;
  localStorage.setItem(N_AUTOSTART, autoStartTunnel ? '1' : '0');
  localStorage.setItem(N_AUTOAPPLY, autoApplyCallback ? '1' : '0');
  localStorage.setItem(N_PORT, String(tunnelPort));
}

export function setLastNgrokPublicUrl(url) {
  if (typeof window === 'undefined') return;
  const clean = String(url || '').trim().replace(/\/+$/, '');
  if (clean) localStorage.setItem(N_LAST_PUBLIC, clean);
  else localStorage.removeItem(N_LAST_PUBLIC);
}

export function getLastNgrokPublicUrl() {
  if (typeof window === 'undefined') return '';
  return (localStorage.getItem(N_LAST_PUBLIC) || '').trim();
}

async function invokeNgrok(command, payload = {}) {
  if (!isTauriDesktop()) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke(command, payload);
}

export async function getNgrokStatus() {
  try {
    const s = await invokeNgrok('ngrok_status');
    return s || null;
  } catch {
    return null;
  }
}

export async function setNgrokAuthToken(token) {
  return invokeNgrok('ngrok_set_authtoken', { token });
}

export async function startNgrokTunnel(port) {
  const p = parseInt(String(port || 4000), 10);
  const status = await invokeNgrok('ngrok_start_tunnel', {
    port: Number.isFinite(p) ? p : 4000,
  });
  const url = status?.public_url || status?.publicUrl || '';
  if (url) setLastNgrokPublicUrl(url);
  return status || null;
}

export async function stopNgrokTunnel() {
  return invokeNgrok('ngrok_stop_tunnel');
}
