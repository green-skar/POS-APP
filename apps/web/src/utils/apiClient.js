/**
 * LAN / distributed deployment: all `/api/*` requests can target a remote POS server.
 * Empty base = same origin (standalone: embedded server on this machine).
 *
 * @see apps/web/NETWORK_SETUP.md
 */

export const POS_API_BASE_STORAGE_KEY = "POS_API_BASE_URL";
export const POS_WORKSTATION_NAME_KEY = "POS_WORKSTATION_NAME";
export const POS_WORKSTATION_ID_KEY = "POS_WORKSTATION_ID";
export const POS_NETWORK_DEVICES_KEY = "POS_NETWORK_DEVICE_REGISTRY"; // JSON array of { id, name, url?, addedAt }
export const POS_SUSPENDED_DEVICES_KEY = "POS_SUSPENDED_DEVICE_IDS"; // JSON array of device ids/origins

/** `server` = this install hosts API+DB (same-origin). `client` = use remote API base URL. */
export const POS_DEPLOYMENT_MODE_KEY = "POS_DEPLOYMENT_MODE";

/** LAN client mode: UI origin ≠ API origin — session cookie may not attach; Bearer matches server `getPosSessionToken`. */
export const POS_SESSION_TOKEN_STORAGE_KEY = "POS_SESSION_TOKEN";

/** Default HTTP port for LAN scan / discovery UI (matches vite `server.port` in dev). */
export const POS_DISCOVERY_HTTP_PORT_KEY = "POS_DISCOVERY_HTTP_PORT";

export const DEPLOYMENT_SERVER = "server";
export const DEPLOYMENT_CLIENT = "client";

/** @returns {string} Base URL without trailing slash, or "" for same-origin */
export function getApiBaseUrl() {
  if (typeof window === "undefined") return "";
  try {
    const raw = localStorage.getItem(POS_API_BASE_STORAGE_KEY);
    if (!raw || !String(raw).trim()) return "";
    return String(raw).trim().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

/**
 * @param {string} path - Must start with `/` (e.g. `/api/products`)
 * @returns {string} Full URL for fetch
 */
export function persistPosSessionToken(token) {
  if (typeof window === "undefined") return;
  try {
    if (token) sessionStorage.setItem(POS_SESSION_TOKEN_STORAGE_KEY, String(token));
    else sessionStorage.removeItem(POS_SESSION_TOKEN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function clearPosSessionToken() {
  persistPosSessionToken(null);
}

export function apiUrl(path) {
  if (!path) return path;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const base = getApiBaseUrl();
  if (!base) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

/**
 * Same as fetch() but resolves `/api/...` against configured API base.
 * Uses credentials: 'include' for session cookies (merge with init).
 */
export function apiFetch(input, init = {}) {
  const url =
    typeof input === "string"
      ? apiUrl(input)
      : input;
  const existingHeaders = new Headers(init.headers || {});
  const wsId = getWorkstationId();
  const wsName = getWorkstationName();
  if (wsId) existingHeaders.set("X-Workstation-Id", wsId);
  if (wsName) existingHeaders.set("X-Workstation-Name", wsName);
  existingHeaders.set("X-Deployment-Mode", getDeploymentMode());
  if (typeof window !== "undefined") {
    existingHeaders.set("X-Client-Origin", window.location.origin);
    try {
      const st = sessionStorage.getItem(POS_SESSION_TOKEN_STORAGE_KEY);
      if (st && !existingHeaders.has("Authorization")) {
        existingHeaders.set("Authorization", `Bearer ${st}`);
      }
    } catch {
      /* ignore */
    }
  }
  const merged = {
    credentials: "include",
    ...init,
    credentials: init.credentials ?? "include",
    headers: existingHeaders,
  };

  return fetch(url, merged);
}

export function setApiBaseUrl(url) {
  const trimmed = url == null ? "" : String(url).trim().replace(/\/+$/, "");
  if (typeof window !== "undefined") {
    if (trimmed) {
      localStorage.setItem(POS_API_BASE_STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(POS_API_BASE_STORAGE_KEY);
    }
    window.dispatchEvent(new CustomEvent("pos-api-base-changed", { detail: { base: trimmed } }));
  }
}

/** @returns {"server"|"client"} */
export function getDeploymentMode() {
  if (typeof window === "undefined") return DEPLOYMENT_SERVER;
  try {
    const v = localStorage.getItem(POS_DEPLOYMENT_MODE_KEY);
    if (v === DEPLOYMENT_CLIENT) return DEPLOYMENT_CLIENT;
    return DEPLOYMENT_SERVER;
  } catch {
    return DEPLOYMENT_SERVER;
  }
}

/**
 * @param {"server"|"client"} mode
 */
export function setDeploymentMode(mode) {
  if (typeof window === "undefined") return;
  const m = mode === DEPLOYMENT_CLIENT ? DEPLOYMENT_CLIENT : DEPLOYMENT_SERVER;
  localStorage.setItem(POS_DEPLOYMENT_MODE_KEY, m);
  window.dispatchEvent(new CustomEvent("pos-deployment-mode-changed", { detail: { mode: m } }));
}

export function hasDeploymentModeSelection() {
  if (typeof window === "undefined") return true;
  try {
    const v = localStorage.getItem(POS_DEPLOYMENT_MODE_KEY);
    return v === DEPLOYMENT_CLIENT || v === DEPLOYMENT_SERVER;
  } catch {
    return true;
  }
}

/** @returns {number} */
export function getDiscoveryHttpPort() {
  if (typeof window === "undefined") return 4000;
  try {
    const raw = localStorage.getItem(POS_DISCOVERY_HTTP_PORT_KEY);
    const n = parseInt(String(raw || ""), 10);
    if (Number.isFinite(n) && n > 0 && n < 65536) return n;
  } catch {
    /* ignore */
  }
  return 4000;
}

/** @param {number} port */
export function setDiscoveryHttpPort(port) {
  if (typeof window === "undefined") return;
  const n = parseInt(String(port), 10);
  if (Number.isFinite(n) && n > 0 && n < 65536) {
    localStorage.setItem(POS_DISCOVERY_HTTP_PORT_KEY, String(n));
  } else {
    localStorage.removeItem(POS_DISCOVERY_HTTP_PORT_KEY);
  }
  window.dispatchEvent(new CustomEvent("pos-discovery-port-changed", { detail: { port: getDiscoveryHttpPort() } }));
}

export function getWorkstationName() {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(POS_WORKSTATION_NAME_KEY) || "";
  } catch {
    return "";
  }
}

export function getWorkstationId() {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(POS_WORKSTATION_ID_KEY);
    if (!id) {
      if (typeof crypto !== "undefined" && crypto.randomUUID) {
        id = crypto.randomUUID();
      } else {
        id = `ws_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      }
      localStorage.setItem(POS_WORKSTATION_ID_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

export function setWorkstationName(name) {
  if (typeof window === "undefined") return;
  const n = String(name || "").trim();
  if (n) localStorage.setItem(POS_WORKSTATION_NAME_KEY, n);
  else localStorage.removeItem(POS_WORKSTATION_NAME_KEY);
}

/** @returns {{ id: string, name: string, baseUrl?: string, addedAt: string }[]} */
export function getRegisteredDevices() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(POS_NETWORK_DEVICES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRegisteredDevices(list) {
  if (typeof window === "undefined") return;
  localStorage.setItem(POS_NETWORK_DEVICES_KEY, JSON.stringify(list));
}

export function addRegisteredDevice(entry) {
  const list = getRegisteredDevices();
  const id = entry.id || `dev_${Date.now()}`;
  const next = [...list.filter((x) => x.id !== id), { ...entry, id, addedAt: entry.addedAt || new Date().toISOString() }];
  saveRegisteredDevices(next);
  return next;
}

export function removeRegisteredDevice(id) {
  const list = getRegisteredDevices().filter((x) => x.id !== id);
  saveRegisteredDevices(list);
  return list;
}

/** @returns {string[]} */
export function getSuspendedDeviceIds() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(POS_SUSPENDED_DEVICES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

/** @param {string[]} ids */
export function saveSuspendedDeviceIds(ids) {
  if (typeof window === "undefined") return;
  const next = Array.isArray(ids) ? ids.map((x) => String(x)) : [];
  localStorage.setItem(POS_SUSPENDED_DEVICES_KEY, JSON.stringify(next));
}
